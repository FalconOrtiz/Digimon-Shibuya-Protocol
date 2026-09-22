import * as THREE from 'three';
import { roundedBox } from '../fx/Sculpt';
import { creatureSkin, makeEye } from '../fx/materials/CreatureMaterials';
import { glowMaterial } from '../fx/materials/PropMaterials';
import { groundHeightAt } from '../core/Layout';
import type { Ctx, GameSystem } from '../core/Context';
import type { GameConfig } from '../core/Config';

/**
 * Trainer: controlador en tercera persona (V alterna a primera), WASD + ratón
 * con pointer lock, sprint con stamina, salto, agacharse, lean Q/E y colisión
 * círculo-AABB contra `buildings`. Escribe la cámara en exploración; en
 * combate la cámara es de `battle` (registrado después).
 */

interface Collide {
  collide(pos: { x: number; z: number }, radius: number): { hit: boolean; nx?: number; nz?: number };
}

interface TrainerParts {
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  shoeL: THREE.Object3D;
  shoeR: THREE.Object3D;
}

export class Player implements GameSystem {
  static id = 'player';
  static deps = ['world', 'buildings'];

  /** Ojos del trainer (pies = pos.y - height). Arranca sobre la cebra mirando a -Z. */
  readonly pos = new THREE.Vector3(0, 1.7, 5);
  readonly vel = new THREE.Vector3();
  readonly followAnchor = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  crouching = false;
  sprinting = false;
  lean = 0;
  stamina = 100;
  hp = 100;
  readonly radius = 0.45;
  readonly height = 1.7;
  readonly crouchH = 1.1;
  viewMode: 'trainer' | 'fps' = 'trainer';
  mesh!: THREE.Group;

  private ctx!: Ctx;
  private cfg!: GameConfig;
  private buildings!: Collide;
  private bob = 0;

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.cfg = ctx.config;
    this.buildings = ctx.get<Collide>('buildings');
    this.stamina = this.cfg.player.staminaMax;
    this.hp = this.cfg.player.hp;
    this.mesh = buildTrainer();
    ctx.scene.add(this.mesh);
    ctx.events.on('player:damage', (p: { amount: number }) => {
      this.hp = Math.max(0, this.hp - p.amount);
      ctx.events.emit('player:health', { current: this.hp, max: this.cfg.player.hp });
      if (this.hp <= 0) ctx.events.emit('player:death', {});
    });
    // El combate reserva un sitio al trainer fuera del eje cámara→pads.
    ctx.events.on('battle:stage', (p: { trainer: { x: number; z: number }; yaw: number }) => {
      this.teleport(p.trainer.x, p.trainer.z, p.yaw);
      this.viewMode = 'trainer';
      this.mesh.visible = true;
    });
    return this;
  }

  /** Coloca al trainer con los pies en el suelo de (x, z). */
  teleport(x: number, z: number, yaw = this.yaw): void {
    this.pos.set(x, groundHeightAt(x, z) + this.height, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
  }

  fixedUpdate(h: number, ctx: Ctx): void {
    const input = ctx.input;
    const p = this.cfg.player;
    const digiviceOpen = !!ctx.peek<{ open: boolean }>('digivice')?.open;
    const inBattle = !!ctx.peek<{ running: boolean }>('battle')?.running;
    const frozen = digiviceOpen || inBattle || !input.locked;

    if (!digiviceOpen && !inBattle && input.tap('view')) {
      this.viewMode = this.viewMode === 'fps' ? 'trainer' : 'fps';
      this.mesh.visible = this.viewMode === 'trainer';
    }

    if (!frozen) {
      const { dx, dy } = input.consumeMouse();
      this.yaw -= dx * this.cfg.mouse.sensitivity;
      this.pitch -= dy * this.cfg.mouse.sensitivity;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }

    const key = (n: string) => (!frozen && input.downKey(n) ? 1 : 0);
    const fwd = key('forward');
    const back = key('back');
    const left = key('left');
    const right = key('right');

    this.crouching = !frozen && input.downKey('crouch');
    this.sprinting = !frozen && input.downKey('sprint') && this.stamina > 0 && !this.crouching && fwd > 0;
    let speed = p.walkSpeed * (this.crouching ? p.crouchMult : 1);
    if (this.sprinting) speed *= p.sprintMult;
    this.stamina = this.sprinting
      ? Math.max(0, this.stamina - p.staminaDrain * h)
      : Math.min(p.staminaMax, this.stamina + p.staminaRegen * h);

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let dx = -sin * (fwd - back) + cos * (right - left);
    let dz = -cos * (fwd - back) - sin * (right - left);
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }
    const k = Math.min(1, 60 * h);
    this.vel.x += (dx * speed - this.vel.x) * k;
    this.vel.z += (dz * speed - this.vel.z) * k;

    // En combate Space es de las ventanas de defensa: no consumir el tap.
    this.vel.y -= 16 * h;
    if (!frozen && input.tap('jump') && this.onGround) {
      this.vel.y = p.jumpVel;
      this.onGround = false;
    }

    this.pos.x += this.vel.x * h;
    this.pos.z += this.vel.z * h;
    this.pos.y += this.vel.y * h;

    const floor = groundHeightAt(this.pos.x, this.pos.z) + this.height;
    if (this.pos.y <= floor) {
      this.pos.y = floor;
      this.vel.y = 0;
      this.onGround = true;
    }

    const col = this.buildings.collide(this.pos, this.radius);
    if (col.hit && col.nx !== undefined && col.nz !== undefined) {
      const px = this.pos.x - col.nx;
      const pz = this.pos.z - col.nz;
      const d = Math.hypot(px, pz);
      if (d > 1e-4) {
        this.pos.x = col.nx + (px / d) * this.radius;
        this.pos.z = col.nz + (pz / d) * this.radius;
      } else {
        this.pos.x -= this.vel.x * h;
        this.pos.z -= this.vel.z * h;
      }
    }

    const leanTarget = key('leanLeft') * -1 + key('leanRight');
    this.lean += (leanTarget - this.lean) * Math.min(1, 10 * h);
    if (len > 0 && this.onGround) this.bob += h * (this.sprinting ? 11 : 7.5);

    if (!frozen && input.tap('interact')) ctx.events.emit('interact', { from: this.pos.clone() });
    ctx.events.emit('player:stamina', { current: this.stamina, max: p.staminaMax });
  }

  lateUpdate(dt: number, ctx: Ctx): void {
    const moving = Math.abs(this.vel.x) + Math.abs(this.vel.z);
    const bobY = this.onGround && moving > 1 ? Math.sin(this.bob * 2) * 0.045 : 0;
    const bobX = this.onGround && moving > 1 ? Math.cos(this.bob) * 0.03 : 0;
    const feetY = this.pos.y - this.height;

    this.mesh.position.set(this.pos.x, feetY, this.pos.z);
    // El modelo mira a +Z; el trainer camina hacia -Z (forward de cámara).
    this.mesh.rotation.y = this.yaw + Math.PI;
    const parts = this.mesh.userData.parts as TrainerParts;
    const swing = moving > 0.4 ? Math.sin(this.bob * 2) * 0.28 : 0;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing;
    parts.armR.rotation.x = swing;
    parts.shoeL.position.y = 0.05 + (moving > 0.4 ? Math.max(0, -Math.sin(this.bob * 2)) * 0.04 : 0);
    parts.shoeR.position.y = 0.05 + (moving > 0.4 ? Math.max(0, Math.sin(this.bob * 2)) * 0.04 : 0);

    const right = this.yaw + Math.PI / 2;
    this.followAnchor.set(
      this.pos.x + Math.sin(right) * 1.35 - Math.sin(this.yaw) * 1.6,
      feetY,
      this.pos.z + Math.cos(right) * 1.35 - Math.cos(this.yaw) * 1.6,
    );

    if (ctx.peek<{ running: boolean }>('battle')?.running) return;
    const cam = ctx.camera;
    cam.rotation.order = 'YXZ';
    if (this.viewMode === 'trainer') {
      const back = 2.6;
      const side = 0.45;
      cam.position.set(
        this.pos.x + Math.sin(this.yaw) * back + Math.sin(right) * side,
        feetY + 1.5 + bobY,
        this.pos.z + Math.cos(this.yaw) * back + Math.cos(right) * side,
      );
      cam.lookAt(this.pos.x - Math.sin(this.yaw) * 7, feetY + 0.7 + Math.tan(this.pitch * 0.5) * 3, this.pos.z - Math.cos(this.yaw) * 7);
    } else {
      cam.position.set(this.pos.x + bobX + this.lean * 0.25, this.pos.y + bobY, this.pos.z);
      cam.rotation.set(this.pitch, this.yaw, this.lean * 0.06);
    }

    const targetFov = this.sprinting ? this.cfg.mouse.fovSprint : this.cfg.mouse.fov;
    if (Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 8);
      cam.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.mesh?.removeFromParent();
  }
}

function buildTrainer(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Trainer';
  const cloth = (color: number, roughness: number) => creatureSkin({ color, wrap: 0.35, rim: 0.18, roughness, detail: 'none' });
  const jacket = cloth(0x1c2438, 0.72);
  const jeans = cloth(0x2a3348, 0.8);
  const hood = cloth(0x161a22, 0.85);
  const shoe = cloth(0x1a1a1e, 0.6);
  const skin = creatureSkin({ color: 0xe0b898, wrap: 0.45, rim: 0.22, roughness: 0.6, detail: 'none' });
  const accent = glowMaterial('trainer.accent', 0x4de1ff, 1.2, 3.2);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  add(roundedBox(0.3, 0.12, 0.2, 0.04, 2), jeans, 0, 0.78, 0);
  const legGeo = new THREE.CapsuleGeometry(0.052, 0.52, 4, 8);
  const legL = add(legGeo, jeans, -0.055, 0.4, 0);
  const legR = add(legGeo, jeans, 0.055, 0.4, 0);
  const shoeGeo = roundedBox(0.11, 0.06, 0.18, 0.02, 2);
  const shoeL = add(shoeGeo, shoe, -0.055, 0.05, 0.03);
  const shoeR = add(shoeGeo, shoe, 0.055, 0.05, 0.03);
  add(roundedBox(0.38, 0.48, 0.24, 0.07, 2), jacket, 0, 1.08, 0);
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.28, 3, 6);
  const armL = add(armGeo, jacket, -0.22, 1.04, 0);
  armL.rotation.z = 0.18;
  const armR = add(armGeo, jacket, 0.22, 1.04, 0);
  armR.rotation.z = -0.18;
  add(new THREE.SphereGeometry(0.15, 18, 14), skin, 0, 1.48, 0);
  for (const x of [-0.048, 0.048]) {
    const eye = makeEye({ radius: 0.022, irisColor: 0x3a5a78 });
    eye.position.set(x, 1.5, 0.125);
    g.add(eye);
  }
  add(new THREE.SphereGeometry(0.175, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), hood, 0, 1.55, -0.02);
  add(roundedBox(0.32, 0.045, 0.05, 0.01, 1), accent, 0, 1.02, 0.13).castShadow = false;
  add(roundedBox(0.07, 0.09, 0.035, 0.01, 1), accent, 0.2, 0.88, 0.08).castShadow = false;

  g.userData.parts = { legL, legR, armL, armR, shoeL, shoeR } satisfies TrainerParts;
  g.userData.height = 1.7;
  return g;
}
