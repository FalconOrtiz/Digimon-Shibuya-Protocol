// src/world/daynight.js — ciclo día/noche.
// Atardecer azul eléctrico al empezar (17:30), cielo físico aproximado,
// sol/luna, luz direccional con sombras, y atenuación de neones/luces.

import * as THREE from 'three';

const DAY_PHASES = [
  { hour: 5,  sky: 0x0e1a2e, sun: 0xffd27a, sunI: 0.35, ambient: 0x334466, ambI: 0.35 },
  { hour: 8,  sky: 0x7ec8e8, sun: 0xfff4d8, sunI: 1.0,  ambient: 0x8899aa, ambI: 0.5 },
  { hour: 12, sky: 0x9ad4f0, sun: 0xfff8e0, sunI: 1.15, ambient: 0x99aabb, ambI: 0.55 },
  { hour: 16, sky: 0x6fb0d8, sun: 0xffe0a0, sunI: 0.85, ambient: 0x7788aa, ambI: 0.45 },
  { hour: 18, sky: 0x1a2440, sun: 0xff8a4a, sunI: 0.45, ambient: 0x445588, ambI: 0.4 },
  { hour: 20, sky: 0x0a0e1a, sun: 0x88aaff, sunI: 0.12, ambient: 0x223355, ambI: 0.35 },
  { hour: 23, sky: 0x070a14, sun: 0xaabbff, sunI: 0.08, ambient: 0x1a2a44, ambI: 0.3 },
];

export class DayNight {
  static id = 'daynight';
  static deps = ['world'];

  constructor() { this.hour = 17.5; }

  init(ctx) {
    this.ctx = ctx;
    this.config = ctx.config;
    this.hour = this.config.world.startHour;

    // cielo
    this.skyColor = new THREE.Color(0x1a2440);
    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x2a2a33, 0.5);
    ctx.scene.add(this.hemi);

    // relleno ambiental suave para que las sombras no caigan a negro puro
    this.ambient = new THREE.AmbientLight(0x334466, 0.35);
    ctx.scene.add(this.ambient);

    // sol (luz direccional con sombras)
    this.sun = new THREE.DirectionalLight(0xffe0a0, 1.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    const sc = 60;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0004;
    ctx.scene.add(this.sun);

    // luna (direccional tenue)
    this.moon = new THREE.DirectionalLight(0x88aaff, 0.1);
    ctx.scene.add(this.moon);

    // neblina urbana sutil — lejana para no oscurecer el cruce
    ctx.scene.fog = new THREE.Fog(this.skyColor, 140, this.config.q.far);

    this._sample();
    return this;
  }

  _sample() {
    const h = this.hour;
    // interpolación lineal entre fases
    let a = DAY_PHASES[0];
    let b = DAY_PHASES[DAY_PHASES.length - 1];
    for (let i = 0; i < DAY_PHASES.length - 1; i++) {
      if (h >= DAY_PHASES[i].hour && h <= DAY_PHASES[i + 1].hour) {
        a = DAY_PHASES[i]; b = DAY_PHASES[i + 1]; break;
      }
    }
    const t = b.hour === a.hour ? 0 : Math.min(1, Math.max(0, (h - a.hour) / (b.hour - a.hour)));

    this.skyColor.copy(new THREE.Color(a.sky)).lerp(new THREE.Color(b.sky), t);
    const sunC = new THREE.Color(a.sun).lerp(new THREE.Color(b.sun), t);
    const sunI = a.sunI + (b.sunI - a.sunI) * t;
    const ambC = new THREE.Color(a.ambient).lerp(new THREE.Color(b.ambient), t);
    const ambI = a.ambI + (b.ambI - a.ambI) * t;

    this.ctx.scene.background = this.skyColor;

    // fog sigue al cielo (color + distancia)
    this.ctx.scene.fog.color.copy(this.skyColor);

    // ángulo del sol
    const sunAngle = ((h - 6) / 12) * Math.PI;
    const sx = Math.cos(sunAngle) * 60;
    const sy = Math.sin(sunAngle) * 60;
    this.sun.position.set(sx, Math.max(sy, -20), 30);
    this.sun.color.copy(sunC);
    this.sun.intensity = sunI;

    // luna opuesta
    this.moon.position.set(-sx, -sy, -30);
    this.moon.intensity = 0.06 + (1 - Math.min(1, sunI)) * 0.18;

    this.hemi.color.copy(ambC);
    this.hemi.intensity = ambI;

    // ambient de relleno sigue el ciclo (más nocturno → menos)
    this.ambient.intensity = 0.35 * (0.4 + 0.6 * (1 - Math.min(1, sunI)));

    // factor nocturno para neones (0 día, 1 noche)
    this.nightFactor = Math.max(0, Math.min(1, (this.hour - 18.5) / 2.5 + (this.hour < 6 ? 0.6 : 0)));

    // avisar a props
    const props = this.ctx.get('props');
    if (props && props.setNightFactor) props.setNightFactor(this.nightFactor);

    const ev = this.ctx.events;
    if (ev) ev.emit('world:time', { hour: this.hour, dayPhase: this._phase() });
  }

  _phase() {
    if (this.hour >= 5 && this.hour < 12) return 'mañana';
    if (this.hour >= 12 && this.hour < 17) return 'tarde';
    if (this.hour >= 17 && this.hour < 20) return 'atardecer';
    return 'noche';
  }

  update(dt) {
    this.hour = (this.hour + dt * this.config.world.daySpeed) % 24;
    this._sample();
  }

  resize() {}
  dispose() {
    const s = this.ctx.scene;
    s.remove(this.hemi, this.sun, this.moon, this.ambient);
  }
}
