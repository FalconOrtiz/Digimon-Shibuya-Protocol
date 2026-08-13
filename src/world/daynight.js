// src/world/daynight.js — ciclo día/noche.
// Atardecer azul eléctrico al empezar (17:30), cielo físico aproximado,
// sol/luna, luz direccional con sombras, y atenuación de neones/luces.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createSkyUniforms, createSkyMaterial, SKY_PALETTE } from '../fx/SkyShader';
import { buildCloudLayer } from '../fx/Clouds';

const DAY_PHASES = [
  // Paleta validada contra referencias (Art Bible): hora azul dominante,
  // horizonte dorado, edificios violeta-marrón desaturados.
  { hour: 5,  sky: 0x303048, sun: 0xffb46a, sunI: 0.5,  ambient: 0x555566, ambI: 0.5 },
  { hour: 8,  sky: 0x88a8c8, sun: 0xfff2c8, sunI: 1.0,  ambient: 0x8898a8, ambI: 0.55 },
  { hour: 12, sky: 0x98b8d8, sun: 0xfff8d8, sunI: 1.15, ambient: 0x98a8b8, ambI: 0.6 },
  { hour: 16, sky: 0xf0b898, sun: 0xffb050, sunI: 1.05, ambient: 0xffd0a8, ambI: 0.85 },
  { hour: 17, sky: 0xf0c0a8, sun: 0xffb050, sunI: 1.0,  ambient: 0xffd8b8, ambI: 0.9 },   // golden hour cartoon
  { hour: 18, sky: 0x5a4a80, sun: 0xffd090, sunI: 0.78, ambient: 0x8a8098, ambI: 0.82 },
  { hour: 18.2, sky: 0x4a3a72, sun: 0xffd8a0, sunI: 0.68, ambient: 0x8a7898, ambI: 0.8 },
  { hour: 18.5, sky: 0x3d2a6b, sun: 0xfff3d6, sunI: 0.58, ambient: 0x8a7898, ambI: 0.78 },
  { hour: 18.8, sky: 0x342456, sun: 0xf8c888, sunI: 0.46, ambient: 0x7a6a90, ambI: 0.72 },
  { hour: 19.4, sky: 0x2a1e4a, sun: 0xf0b060, sunI: 0.32, ambient: 0x6a5a80, ambI: 0.62 },
  { hour: 19.8, sky: 0x221838, sun: 0xc0a0c8, sunI: 0.20, ambient: 0x4a4868, ambI: 0.48 },
  { hour: 20.2, sky: 0x1a1830, sun: 0x8898c8, sunI: 0.12, ambient: 0x3a4060, ambI: 0.38 },
  { hour: 20.5, sky: 0x141428, sun: 0x8898c8, sunI: 0.08, ambient: 0x303850, ambI: 0.32 },
  { hour: 23, sky: 0x10101c, sun: 0x8898c8, sunI: 0.06, ambient: 0x282838, ambI: 0.28 },
];

export class DayNight {
  static id = 'daynight';
  static deps = ['world'];

  constructor() { this.hour = 17.5; }

  init(ctx) {
    this.ctx = ctx;
    this.config = ctx.config;
    this.hour = this.config.world.startHour;

    this.sky = new Sky();
    this.sky.scale.setScalar(450);
    ctx.scene.add(this.sky);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 6;
    su.rayleigh.value = 1.6;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.8;
    this.skyUniforms = createSkyUniforms(SKY_PALETTE);
    this.skyMat = createSkyMaterial(this.skyUniforms);
    this.skyDome = new THREE.Mesh(new THREE.IcosahedronGeometry(520, 4), this.skyMat);
    this.skyDome.name = 'SkyDome';
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -1000;
    this.skyDome.material.side = THREE.BackSide;
    this.skyDome.material.depthWrite = false;
    this.skyDome.material.fog = false;
    ctx.scene.add(this.skyDome);

    this.clouds = buildCloudLayer({
      seed: 1337,
      count: 27,
      hazeColor: new THREE.Color(0xffc890).multiplyScalar(1.35),
      exposure: 1.45
    });
    this.clouds.group.scale.setScalar(0.72);
    ctx.scene.add(this.clouds.group);

    // cielo
    this.skyColor = new THREE.Color(0x1a2440);
    this.hemi = new THREE.HemisphereLight(0x8a7898, 0x3a3440, 0.8);
    ctx.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x3a4060, 0.35);
    ctx.scene.add(this.ambient);

    // sol (luz direccional con sombras)
    this.sun = new THREE.DirectionalLight(0xffb050, 1.15);
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

    // FILL LIGHT: luz de relleno frontal (opuesta al sol) — Art Bible:
    // las referencias muestran fachadas iluminadas aunque sea hora azul,
    // "friendly warm lighting". Sin esto las fachadas traseras al sol
    // caen a negro y el tonemapping ACES las aplasta.
    this.fill = new THREE.DirectionalLight(0xc8a0b8, 0.42);
    this.fill.position.set(30, 20, -40);
    ctx.scene.add(this.fill);

    ctx.scene.fog = new THREE.FogExp2(0x4a3a5e, 0.0032);

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

    this.ctx.scene.background = null;
    const night = this.hour >= 19.2 || this.hour < 6;
    if (this.ctx.scene.fog) {
      this.ctx.scene.fog.color.copy(night ? this.skyColor : new THREE.Color(0x4a3a5e));
    }

    const dusk = this.hour < 6 ? 1 : Math.max(0, Math.min(1, (this.hour - 17.8) / 3.0));
    this.nightFactor = dusk * dusk * (3 - 2 * dusk);

    const sunAngle = ((this.hour - 6.5) / 12.5) * Math.PI;
    const sx = Math.cos(sunAngle) * 60;
    const sy = Math.sin(sunAngle) * 60;
    if (this.sky) this.sky.visible = false;
    if (this.ctx.scene.fog && this.ctx.scene.fog.isFogExp2) {
      this.ctx.scene.fog.density = night ? 0.0036 : 0.0028;
    }
    if (this.skyDome) this.skyDome.visible = true;
    if (this.skyUniforms) {
      this.skyUniforms.uZenith.value.copy(this.skyColor);
      this.skyUniforms.uHorizon.value.set(night ? 0x484868 : 0xffb070);
      this.skyUniforms.uHaze.value.set(night ? 0x5a5a7a : 0xffc890);
      this.skyUniforms.uNadir.value.set(night ? 0x14142a : 0x4a3a5e);
      this.skyUniforms.uSunColor.value.copy(sunC);
      this.skyUniforms.uSunDir.value.set(sx, Math.max(sy, 2), 30).normalize();
      this.skyUniforms.uIntensity.value = night ? 0.9 : 1.75;
    }
    if (this.clouds) {
      const nf = this.nightFactor ?? 0;
      this.clouds.material.uniforms.uHaze.value.set(night ? 0x3a3a58 : 0xffc890);
      this.clouds.material.uniforms.uExposure.value = 1.45 - nf * 1.0;
      this.clouds.material.uniforms.uOpacity.value = 1.0 - nf * 0.5;
    }
    this.sun.position.set(sx, Math.max(sy, -20), 30);
    this.sun.color.copy(sunC);
    this.sun.intensity = sunI;

    // luna opuesta
    this.moon.position.set(-sx, -sy, -30);
    this.moon.intensity = 0.06 + (1 - Math.min(1, sunI)) * 0.18;

    this.hemi.color.copy(ambC);
    this.hemi.groundColor.set(night ? 0x1a1a2a : 0x3a3440);
    this.hemi.intensity = ambI * (sunI < 0.2 ? 0.7 : 1.05);

    this.ambient.intensity = sunI < 0.2 ? 0.28 : 1.0 * (0.7 + 0.3 * (1 - Math.min(1, sunI)));

    this.fill.intensity = 0.3 + 0.4 * (1 - Math.min(1, sunI));

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
    const duskSlow = this.hour >= 17.5 && this.hour <= 20.5;
    this.hour = (this.hour + dt * (duskSlow ? 0.012 : this.config.world.daySpeed)) % 24;
    this._sample();
    if (this.clouds) this.clouds.update(this.hour * 40);
  }

  resize() {}
  dispose() {
    const s = this.ctx.scene;
    s.remove(this.hemi, this.sun, this.moon, this.ambient, this.fill);
    if (this.skyDome) s.remove(this.skyDome);
    if (this.clouds) s.remove(this.clouds.group);
    if (this.sky) s.remove(this.sky);
  }
}
