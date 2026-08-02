// src/core/engine.js — bootstrap: renderer, cámara, bucle con fixed timestep,
// registro de sistemas, ctx compartido.

import * as THREE from 'three';
import { Events } from './events.js';
import { Rng } from './rng.js';
import { Input } from './input.js';
import { defaultConfig } from './config.js';

const FIXED_HZ = 120;
const FIXED_DT = 1 / FIXED_HZ;

export class Engine {
  constructor(canvas, userConfig = {}) {
    this.canvas = canvas;
    this.config = { ...defaultConfig(), ...userConfig };
    this.q = this.config.q;
    this.events = new Events();
    this.rng = new Rng(this.config.seed);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.q.antialias,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 2.5;   // Art Bible: brillo medio objetivo ~120

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0e1a, 40, this.q.far);

    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, this.q.far
    );

    this.input = new Input(canvas, this.config);

    this.systems = new Map();
    this._order = [];
    this._clock = new THREE.Clock();
    this._acc = 0;
    this.time = {
      elapsed: 0, raw: 0, dt: 0, fixed: FIXED_DT, alpha: 0, frame: 0, scale: 1
    };

    // ctx compartido — el contrato entre subsistemas
    this.ctx = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      canvas,
      config: this.config,
      events: this.events,
      input: this.input,
      time: this.time,
      rng: this.rng,
      get: (id) => this.systems.get(id),
      peek: (id) => this.systems.get(id),
      has: (id) => this.systems.has(id)
    };
  }

  register(system) {
    if (!system || typeof system.init !== 'function') {
      throw new Error('Sistema inválido: necesita init(ctx)');
    }
    this.systems.set(system.constructor.id || system.id, system);
    this._order.push(system);
    return system;
  }

  async boot() {
    // topológico por deps (simple: orden de registro respetando deps declaradas)
    const ordered = [...this._order].sort((a, b) => {
      const da = a.constructor.deps || [];
      const db = b.constructor.deps || [];
      return da.length - db.length;
    });
    for (const sys of ordered) {
      await sys.init(this.ctx);
    }
    this._order = ordered;

    window.addEventListener('resize', () => this._onResize());
    this._onResize();
    this._clock.start();

    this.renderer.setAnimationLoop(() => this._frame());
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    for (const sys of this._order) {
      if (sys.resize) sys.resize(w, h, this.ctx);
    }
  }

  _frame() {
    const dt = Math.min(this._clock.getDelta(), 0.1) * this.time.scale;
    this.time.raw += dt;
    this.time.dt = dt;

    // fixed timestep: gameplay determinista a 120 Hz con interp. alpha
    this._acc += dt;
    while (this._acc >= FIXED_DT) {
      for (const sys of this._order) {
        if (sys.fixedUpdate) sys.fixedUpdate(FIXED_DT, this.ctx);
      }
      this._acc -= FIXED_DT;
    }
    this.time.alpha = this._acc / FIXED_DT;

    for (const sys of this._order) {
      if (sys.update) sys.update(dt, this.ctx);
    }
    for (const sys of this._order) {
      if (sys.lateUpdate) sys.lateUpdate(dt, this.ctx);
    }

    this.time.elapsed += dt;
    this.time.frame++;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    for (const sys of [...this._order].reverse()) {
      if (sys.dispose) sys.dispose();
    }
    this.renderer.dispose();
  }
}

export async function createEngine(canvas, userConfig = {}) {
  const engine = new Engine(canvas, userConfig);
  return engine;
}
