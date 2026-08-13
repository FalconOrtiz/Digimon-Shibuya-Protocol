// src/digimon/anim.js — animación por código (sin esqueletos).
// Estados: idle, walk, attack, hit, death, win. Todo con sin()/easing
// sobre las partes referenciadas del modelo chibi.

const TAU = Math.PI * 2;

function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

// clamp de ángulo a [-pi, pi]
function wrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export class DigimonAnimator {
  constructor(model) {
    this.model = model;
    this.p = model.userData.parts;
    this.state = 'idle';
    this.t = 0;          // tiempo local de la animación
    this.duration = 1;
    this.onDone = null;
    this._base = {};     // poses base restaurables
  }

  play(state, duration = 0.5, onDone = null) {
    this.state = state;
    this.t = 0;
    this.duration = Math.max(0.1, duration);
    this.onDone = onDone;
  }

  update(dt) {
    const creature = this.model?.userData?.creature;
    if (creature && creature.update) {
      this._elapsed = (this._elapsed || 0) + dt;
      creature.update(dt, this._elapsed);
      return;
    }
    this.t += dt;
    const u = Math.min(1, this.t / this.duration);
    const p = this.p;
    if (!p || !p.head || !p.armL) return;
    const t = this.t;

    // reset transformaciones base cada frame (las animaciones son aditivas simples)
    this._reset(p);

    switch (this.state) {
      case 'idle': this._idle(p, t); break;
      case 'walk': this._walk(p, t); break;
      case 'attack': this._attack(p, u, t); break;
      case 'hit': this._hit(p, u); break;
      case 'death': this._death(p, u); break;
      case 'win': this._win(p, t, u); break;
    }

    if (u >= 1 && this.state !== 'idle' && this.state !== 'walk' && this.onDone) {
      const cb = this.onDone;
      this.onDone = null;
      cb();
    }
  }

  _reset(p) {
    const s = 1;
    p.torso.scale.set(s, s, s);
    p.torso.position.set(0, 0, 0);
    p.torso.rotation.set(0, 0, 0);
    p.head.position.set(0, p.head.userData.baseY ?? (p.head.position.y > 0 ? this._snapY(p.head) : 0.75), 0.06);
    p.head.rotation.set(0, 0, 0);
    p.armL.rotation.set(0, 0, 0); p.armR.rotation.set(0, 0, 0);
    p.legL.rotation.set(0, 0, 0); p.legR.rotation.set(0, 0, 0);
    p.tail.rotation.set(0, 0, 0);
    if (p.earL && p.earR) {
      p.earL.rotation.z = 0.25;
      p.earR.rotation.z = -0.25;
    }
    if (p.wingL && p.wingR) {
      p.wingL.rotation.z = 0;
      p.wingR.rotation.z = 0;
    }
  }

  _snapY(mesh) {
    // guarda la Y base la primera vez
    mesh.userData.baseY = mesh.position.y;
    return mesh.position.y;
  }

  _idle(p, t) {
    // respiración: torso escala sutil + cabeceo
    const b = Math.sin(t * 2.2) * 0.03;
    p.torso.scale.set(1 + b, 1 - b * 0.6, 1 + b * 0.4);
    p.torso.position.y = Math.sin(t * 2.2) * 0.015;
    p.head.rotation.z = Math.sin(t * 1.4) * 0.05;
    p.tail.rotation.y = Math.sin(t * 3) * 0.18;
    if (p.wingL && p.wingR) {
      const flap = Math.sin(t * 5) * 0.28;
      p.wingL.rotation.z = flap;
      p.wingR.rotation.z = -flap;
    }
  }

  _walk(p, t) {
    // piernas alternando, brazos balanceando, cuerpo bob
    const ph = t * 9;
    p.legL.rotation.x = Math.sin(ph) * 0.55;
    p.legR.rotation.x = Math.sin(ph + Math.PI) * 0.55;
    p.armL.rotation.x = Math.sin(ph + Math.PI) * 0.4;
    p.armR.rotation.x = Math.sin(ph) * 0.4;
    p.torso.position.y = Math.abs(Math.sin(ph)) * 0.05;
    p.tail.rotation.y = Math.sin(t * 8) * 0.3;
    p.head.rotation.z = Math.sin(ph * 0.5) * 0.06;
  }

  _attack(p, u, t) {
    // lunge hacia delante + swing de brazo
    const lunge = Math.sin(u * Math.PI) * 0.25;      // 0→1→0
    const swing = Math.sin(u * Math.PI) * 1.2;       // barrido
    p.torso.position.z = -lunge;
    p.torso.rotation.x = -lunge * 1.2;
    p.armR.rotation.x = -swing * 1.4;
    p.armL.rotation.x = -swing * 0.6;
    p.legL.rotation.x = -0.3 + lunge;
    p.legR.rotation.x = 0.2;
    p.head.rotation.x = -0.15;
    // giro de cola para peso
    p.tail.rotation.y = Math.sin(t * 30) * 0.2;
  }

  _hit(p, u) {
    // flinch: retroceso + temblor
    const back = easeOut(u) * 0.12;
    const shake = Math.sin(u * 40) * (1 - u) * 0.06;
    p.torso.position.z = back;
    p.torso.rotation.x = back * 2;
    p.torso.rotation.z = shake;
    p.head.rotation.z = shake * 1.5;
    p.armL.rotation.x = -0.6; p.armR.rotation.x = -0.6;
  }

  _death(p, u) {
    // caerse de lado + desvanecer visualmente (escala → 0.6 y rotación)
    const rot = easeInOut(u) * (Math.PI / 2.2);
    p.torso.rotation.z = rot;
    p.torso.position.y = -easeInOut(u) * 0.15;
    p.head.rotation.z = rot * 0.8;
    p.legL.rotation.x = -1; p.legR.rotation.x = -1;
    const s = 1 - u * 0.35;
    this.model.scale.setScalar(Math.max(0.01, s));
  }

  _win(p, t, u) {
    // salto de victoria
    const jump = Math.sin(Math.min(1, t * 1.5) * Math.PI) * 0.25;
    p.torso.position.y = jump;
    p.armL.rotation.x = -2.6; p.armR.rotation.x = -2.6;
    p.armL.rotation.z = 0.3; p.armR.rotation.z = -0.3;
    p.tail.rotation.y = Math.sin(t * 10) * 0.4;
    p.head.rotation.z = Math.sin(t * 8) * 0.1;
  }

  // estado actual a string (para debug)
  get stateName() { return this.state; }
}
