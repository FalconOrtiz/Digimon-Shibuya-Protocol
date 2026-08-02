// src/player/controller.js — FPS controller.
// WASD + ratón (pointer lock), gravedad, salto, agacharse, sprint con stamina,
// lean Q/E, colisiones AABB contra edificios, interacción E.

import * as THREE from 'three';

export class Player {
  static id = 'player';
  static deps = ['world', 'buildings'];

  constructor() {
    this.pos = new THREE.Vector3(0, 1.7, 14);
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
  }

  init(ctx) {
    this.ctx = ctx;
    this.cfg = ctx.config;
    this.world = ctx.get('world');
    this.buildings = ctx.get('buildings');
    this.events = ctx.events;

    // campana de eventos de salud/stamina
    this.events.on('player:damage', (p) => this._applyDamage(p));
    return this;
  }

  _applyDamage(p) {
    this.hp = Math.max(0, this.hp - p.amount);
    this.events.emit('player:health', { current: this.hp, max: this.cfg.player.hp });
    if (this.hp <= 0) this.events.emit('player:death', {});
  }

  fixedUpdate(h, ctx) {
    const input = ctx.input;
    const pcfg = this.cfg.player;

    // --- look ---
    if (input.locked) {
      const { dx, dy } = input.consumeMouse();
      this.yaw -= dx * this.cfg.mouse.sensitivity;
      this.pitch -= dy * this.cfg.mouse.sensitivity;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }

    // --- movimiento ---
    const fwd = input.downKey('forward') ? 1 : 0;
    const back = input.downKey('back') ? 1 : 0;
    const left = input.downKey('left') ? 1 : 0;
    const right = input.downKey('right') ? 1 : 0;

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
    if (!inBattle && input.tap('jump') && this.onGround) {
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
    if (input.tap('interact')) {
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
    // posición de cámara: ojos + bob + lean lateral
    const eye = this.crouching ? this.crouchH : this.height;
    const bobY = this.onGround && Math.abs(this.vel.x) + Math.abs(this.vel.z) > 1
      ? Math.sin(this._bob * 2) * 0.045
      : 0;
    const bobX = this.onGround && Math.abs(this.vel.x) + Math.abs(this.vel.z) > 1
      ? Math.cos(this._bob) * 0.03
      : 0;

    ctx.camera.position.set(
      this.pos.x + bobX + this.lean * 0.25,
      this.pos.y + bobY,
      this.pos.z
    );
    ctx.camera.rotation.order = 'YXZ';
    ctx.camera.rotation.y = this.yaw;
    ctx.camera.rotation.x = this.pitch;
    ctx.camera.rotation.z = this.lean * 0.06;

    // FOV kick al sprint
    const targetFov = this.sprinting ? this.cfg.mouse.fovSprint : this.cfg.mouse.fov;
    if (Math.abs(ctx.camera.fov - targetFov) > 0.1) {
      ctx.camera.fov += (targetFov - ctx.camera.fov) * Math.min(1, dt * 8);
      ctx.camera.updateProjectionMatrix();
    }
  }

  resize() {}
  dispose() {}
}
