import * as THREE from 'three';
import { roundedBox } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import {
  CHIBI, armGeometry, bagGeometry, chibiPartMatrix, chibiPose, faceGeometry, hairGeometry, handGeometry, headGeometry,
  hipsGeometry, legGeometry, shoeGeometry, torsoGeometry, type ChibiPose, type ChibiSlot,
} from '../fx/Chibi';
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

const TRAINER_SCALE = 1.1;

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
  private stride = 0;
  private readonly pose: ChibiPose = { bob: 0, leg: 0, arm: 0, tilt: 0 };

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
    this.stride += ((moving > 0.4 && this.onGround ? 1 : 0) - this.stride) * Math.min(1, dt * 10);
    poseTrainer(this.mesh, chibiPose(this.bob * 2, this.stride, this.pose));

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

/** The trainer is a crowd chibi in the avatar's outfit: navy hood up, cyan trims, backpack. */
function buildTrainer(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Trainer';
  g.scale.setScalar(TRAINER_SCALE);
  const cloth = (color: number, roughness: number) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, vertexColors: true });
    m.name = `trainer.cloth.${color.toString(16)}`;
    return m;
  };
  const hoodie = cloth(0x2e3f8a, 0.78);
  const jeans = cloth(0x262c40, 0.82);
  const sneakers = cloth(0xf2f2f4, 0.6);
  const pack = cloth(0x1e2438, 0.7);
  const hood = cloth(0xffffff, 0.8);
  const skin = creatureSkin({ color: 0xf0cdb0, wrap: 0.45, rim: 0.22, roughness: 0.6, detail: 'none' });
  skin.vertexColors = true;
  const face = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0, vertexColors: true });
  const accent = glowMaterial('trainer.accent', 0x4de1ff, 1.2, 3.2);

  const slots = {} as Record<ChibiSlot, THREE.Mesh>;
  const part = (slot: ChibiSlot, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    slots[slot] = m;
    return m;
  };
  const torso = part('torso', torsoGeometry('hoodie'), hoodie);
  part('hips', hipsGeometry(), jeans);
  part('head', headGeometry(), skin);
  part('face', faceGeometry(), face, false);
  part('hair', hairGeometry('hood'), hood);
  const bag = part('bag', bagGeometry(), pack);
  for (const s of ['L', 'R'] as const) {
    part(`leg${s}`, legGeometry(), jeans);
    part(`shoe${s}`, shoeGeometry(), sneakers);
    part(`arm${s}`, armGeometry(), hoodie);
    part(`hand${s}`, handGeometry(), skin, false);
  }

  const trim = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D, rz = 0) => {
    const m = new THREE.Mesh(roundedBox(w, h, d, Math.min(w, h, d) * 0.45, 1), accent);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    parent.add(m);
  };
  const H = CHIBI.SHOULDER - CHIBI.HIP;
  trim(0.016, H * 0.8, 0.012, 0, H * 0.46, 0.142, torso);
  trim(0.06, 0.05, 0.012, 0.075, H * 0.7, 0.13, torso);
  for (const s of [-1, 1]) trim(0.028, H * 0.95, 0.012, s * 0.1, H * 0.5, 0.125, torso, s * 0.08);
  trim(0.16, 0.022, 0.012, 0, 0.02, 0.075, bag);

  g.userData.parts = slots;
  g.userData.height = CHIBI.HEAD_Y + CHIBI.HEAD_R;
  poseTrainer(g, chibiPose(0, 0));
  return g;
}

function poseTrainer(g: THREE.Group, pose: ChibiPose): void {
  const slots = g.userData.parts as Record<ChibiSlot, THREE.Mesh>;
  for (const [slot, mesh] of Object.entries(slots) as [ChibiSlot, THREE.Mesh][]) {
    chibiPartMatrix(slot, pose, mesh.matrix);
    mesh.matrixWorldNeedsUpdate = true;
  }
}
