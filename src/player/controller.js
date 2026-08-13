// src/player/controller.js — FPS controller.
// WASD + ratón (pointer lock), gravedad, salto, agacharse, sprint con stamina,
// lean Q/E, colisiones AABB contra edificios, interacción E.

import * as THREE from 'three';
import { roundedBox } from '../fx/Sculpt';
import { creatureSkin, makeEye } from '../fx/CreatureMaterials';

export class Player {
  static id = 'player';
  static deps = ['world', 'buildings'];

  constructor() {
    this.pos = new THREE.Vector3(0, 1.7, 5);   // on the zebra, looking down -Z
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.crouching = false;
    this.sprinting = false;
    this.lean = 0;           // -1..1
    this.stamina = 100;
    this.hp = 100;
    this.radius = 0.45;
    this.height = 1.7;
    this.crouchH = 1.1;
    this._bob = 0;
    this.viewMode = 'trainer';
    this.followAnchor = new THREE.Vector3();
  }

  init(ctx) {
    this.ctx = ctx;
    this.cfg = ctx.config;
    this.world = ctx.get('world');
    this.buildings = ctx.get('buildings');
    this.events = ctx.events;

    this.mesh = this._buildTrainer();
    this.mesh.visible = true;
    ctx.scene.add(this.mesh);

    this.events.on('player:damage', (p) => this._applyDamage(p));
    return this;
  }

  _buildTrainer() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x1c2438, roughness: 0.72, emissive: 0x0a1828, emissiveIntensity: 0.12 });
    const skin = creatureSkin({ color: 0xe0b898, wrap: 0.45, rim: 0.22, roughness: 0.6, detail: 'none' });
    const jeans = new THREE.MeshStandardMaterial({ color: 0x2a3348, roughness: 0.78 });
    const hood = new THREE.MeshStandardMaterial({ color: 0x161a22, roughness: 0.82 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x4de1ff, emissive: 0x4de1ff, emissiveIntensity: 0.55 });
    const shoeM = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.7 });

    const hips = new THREE.Mesh(roundedBox(0.30, 0.12, 0.20, 0.04, 2), jeans);
    hips.position.y = 0.78;
    g.add(hips);
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.52, 4, 8), jeans);
    legL.position.set(-0.055, 0.40, 0);
    const legR = legL.clone();
    legR.position.x = 0.055;
    g.add(legL, legR);
    const shoeL = new THREE.Mesh(roundedBox(0.11, 0.06, 0.18, 0.02, 2), shoeM);
    shoeL.position.set(-0.055, 0.05, 0.03);
    const shoeR = shoeL.clone();
    shoeR.position.x = 0.055;
    g.add(shoeL, shoeR);

    const body = new THREE.Mesh(roundedBox(0.38, 0.48, 0.24, 0.07, 2), jacket);
    body.position.y = 1.08;
    body.castShadow = true;
    g.add(body);
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.28, 3, 6), jacket);
    armL.position.set(-0.22, 1.04, 0);
    armL.rotation.z = 0.18;
    const armR = armL.clone();
    armR.position.x = 0.22;
    armR.rotation.z = -0.18;
    g.add(armL, armR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), skin);
    head.position.y = 1.48;
    g.add(head);
    const eyeL = makeEye({ radius: 0.022, irisColor: 0x3a5a78 });
    eyeL.position.set(-0.048, 1.50, 0.125);
    const eyeR = makeEye({ radius: 0.022, irisColor: 0x3a5a78 });
    eyeR.position.set(0.048, 1.50, 0.125);
    g.add(eyeL, eyeR);
    const hoodMesh = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hood);
    hoodMesh.position.set(0, 1.55, -0.02);
    g.add(hoodMesh);
    const stripe = new THREE.Mesh(roundedBox(0.32, 0.045, 0.05, 0.01, 1), accent);
    stripe.position.set(0, 1.02, 0.13);
    g.add(stripe);
    const vice = new THREE.Mesh(roundedBox(0.07, 0.09, 0.035, 0.01, 1), accent);
    vice.position.set(0.20, 0.88, 0.08);
    g.add(vice);

    g.userData.parts = { legL, legR, armL, armR, shoeL, shoeR };
    return g;
  }

  _applyDamage(p) {
    this.hp = Math.max(0, this.hp - p.amount);
    this.events.emit('player:health', { current: this.hp, max: this.cfg.player.hp });
    if (this.hp <= 0) this.events.emit('player:death', {});
  }

  fixedUpdate(h, ctx) {
    const input = ctx.input;
    const pcfg = this.cfg.player;
    const digivice = ctx.peek('digivice');
    const battle = ctx.peek('battle');
    const frozen = !!(digivice && digivice.open) || !!(battle && battle.running) || !input.locked;
    if (!(digivice && digivice.open) && !(battle && battle.running) && input.tap('view')) {
      this.viewMode = this.viewMode === 'fps' ? 'trainer' : 'fps';
      if (this.mesh) this.mesh.visible = this.viewMode === 'trainer';
    }

    // --- look ---
    if (input.locked && !frozen) {
      const { dx, dy } = input.consumeMouse();
      this.yaw -= dx * this.cfg.mouse.sensitivity;
      this.pitch -= dy * this.cfg.mouse.sensitivity;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }

    // --- movimiento ---
    const fwd = (!frozen && input.downKey('forward')) ? 1 : 0;
    const back = (!frozen && input.downKey('back')) ? 1 : 0;
    const left = (!frozen && input.downKey('left')) ? 1 : 0;
    const right = (!frozen && input.downKey('right')) ? 1 : 0;

    const sprintWanted = input.downKey('sprint') && this.stamina > 0;
    this.crouching = input.downKey('crouch');
    this.sprinting = sprintWanted && !this.crouching && (fwd > 0);

    let speed = pcfg.walkSpeed * (this.crouching ? pcfg.crouchMult : 1);
    if (this.sprinting) speed *= pcfg.sprintMult;

    // stamina
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - pcfg.staminaDrain * h);
    } else {
      this.stamina = Math.min(pcfg.staminaMax, this.stamina + pcfg.staminaRegen * h);
    }

    // dirección en espacio del mundo (yaw)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward local (0,0,-1) rotado por yaw
    let fx = -sin * (fwd - back);
    let fz = -cos * (fwd - back);
    let rx = cos * (right - left);
    let rz = -sin * (right - left);
    let dx = fx + rx, dz = fz + rz;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

    // aceleración/velocidad horizontal con fricción (más suave que instantáneo)
    const accel = 60;
    this.vel.x += (dx * speed - this.vel.x) * Math.min(1, accel * h);
    this.vel.z += (dz * speed - this.vel.z) * Math.min(1, accel * h);

    // gravedad y salto (en batalla el Space pertenece al QTE — no consumir el tap)
    this.vel.y -= 16 * h;
    const inBattle = this.ctx.get('battle')?.running;
    if (!inBattle && !frozen && input.tap('jump') && this.onGround) {
      this.vel.y = pcfg.jumpVel;
      this.onGround = false;
    }

    // integrar
    this.pos.x += this.vel.x * h;
    this.pos.z += this.vel.z * h;
    this.pos.y += this.vel.y * h;

    // suelo
    if (this.pos.y <= this.height) {
      this.pos.y = this.height;
      this.vel.y = 0;
      this.onGround = true;
    }

    // colisiones con edificios (AABB) — empuje radial
    const col = this.buildings.collide(this.pos, this.radius);
    if (col.hit) {
      // retroceder a lo largo del eje con menor penetración
      const penX = this.pos.x - col.nx, penZ = this.pos.z - col.nz;
      const ax = Math.abs(penX), az = Math.abs(penZ);
      if (ax < az) {
        this.pos.x = this.pos.x + (penX > 0 ? -this.radius : this.radius);
      } else {
        this.pos.z = this.pos.z + (penZ > 0 ? -this.radius : this.radius);
      }
    }

    // lean
    const leanTarget = (input.downKey('leanLeft') ? -1 : 0) + (input.downKey('leanRight') ? 1 : 0);
    this.lean += (leanTarget - this.lean) * Math.min(1, 10 * h);

    // bob de caminar
    if (len > 0 && this.onGround) {
      this._bob += h * (this.sprinting ? 11 : 7.5);
    }

    // interacción
    if (!frozen && input.tap('interact')) {
      this.events.emit('interact', { from: this.pos.clone() });
    }

    // emitir estado (event-driven para el HUD)
    this.events.emit('player:stamina', { current: this.stamina, max: pcfg.staminaMax });
    this.events.emit('player:state', {
      stance: this.crouching ? 'crouch' : 'stand',
      sprinting: this.sprinting,
      lean: this.lean
    });
  }

  lateUpdate(dt, ctx) {
    const eye = this.crouching ? this.crouchH : this.height;
    const bobY = this.onGround && Math.abs(this.vel.x) + Math.abs(this.vel.z) > 1
      ? Math.sin(this._bob * 2) * 0.045
      : 0;
    const bobX = this.onGround && Math.abs(this.vel.x) + Math.abs(this.vel.z) > 1
      ? Math.cos(this._bob) * 0.03
      : 0;

    const feetY = this.pos.y - this.height;
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, feetY, this.pos.z);
      this.mesh.rotation.y = this.yaw;
      const parts = this.mesh.userData.parts;
      const moving = Math.abs(this.vel.x) + Math.abs(this.vel.z) > 0.4;
      if (parts) {
        const swing = moving ? Math.sin(this._bob * 2) * 0.28 : 0;
        parts.legL.rotation.x = swing;
        parts.legR.rotation.x = -swing;
        parts.armL.rotation.x = -swing;
        parts.armR.rotation.x = swing;
        const lift = moving ? Math.max(0, -Math.sin(this._bob * 2)) * 0.04 : 0;
        const liftR = moving ? Math.max(0, Math.sin(this._bob * 2)) * 0.04 : 0;
        parts.shoeL.position.y = 0.05 + lift;
        parts.shoeR.position.y = 0.05 + liftR;
      }
    }

    const right = this.yaw + Math.PI / 2;
    this.followAnchor.set(
      this.pos.x + Math.sin(right) * 1.35 - Math.sin(this.yaw) * 1.6,
      feetY,
      this.pos.z + Math.cos(right) * 1.35 - Math.cos(this.yaw) * 1.6
    );

    ctx.camera.rotation.order = 'YXZ';
    if (this.viewMode === 'trainer') {
      const back = 2.6, up = 1.5, side = 0.45;
      ctx.camera.position.set(
        this.pos.x + Math.sin(this.yaw) * back + Math.sin(right) * side,
        feetY + up + bobY,
        this.pos.z + Math.cos(this.yaw) * back + Math.cos(right) * side
      );
      ctx.camera.lookAt(
        this.pos.x - Math.sin(this.yaw) * 7,
        feetY + 0.7,
        this.pos.z - Math.cos(this.yaw) * 7
      );
    } else {
      ctx.camera.position.set(
        this.pos.x + bobX + this.lean * 0.25,
        this.pos.y + bobY,
        this.pos.z
      );
      ctx.camera.rotation.y = this.yaw;
      ctx.camera.rotation.x = this.pitch;
      ctx.camera.rotation.z = this.lean * 0.06;
    }

    // FOV kick al sprint
    const targetFov = this.sprinting ? this.cfg.mouse.fovSprint : this.cfg.mouse.fov;
    if (Math.abs(ctx.camera.fov - targetFov) > 0.1) {
      ctx.camera.fov += (targetFov - ctx.camera.fov) * Math.min(1, dt * 8);
      ctx.camera.updateProjectionMatrix();
    }
  }

  resize() {}
  dispose() {
    if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}
