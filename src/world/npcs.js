// src/world/npcs.js — la multitud de Shibuya.
// Sprites billboard procedurales (círculo cabeza + cuerpo) con animación de
// caminar, cruzando el paso de cebra. Instanciados para rendimiento.

import * as THREE from 'three';

export class Npcs {
  static id = 'npcs';
  static deps = ['world'];

  constructor() { this.root = new THREE.Group(); this.npcs = []; }

  init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.world = ctx.get('world');
    this.world.root.add(this.root);
    this.count = ctx.config.q.npcCount;
    this._buildAll();
    return this;
  }

  _makeSpriteTexture(seed) {
    const rng = this.rng.fork();
    const c = document.createElement('canvas');
    c.width = 64; c.height = 96;
    const g = c.getContext('2d');

    // paleta de ropa urbana vibrante (estilo cartoon Pokémon/AC)
    const shirts = ['#ff6b8a', '#4ac0ff', '#5aff8a', '#ffb84a', '#c86bff', '#ff8a5a', '#4ae8d8', '#7a9aff', '#ff5a5a', '#8aff6b'];
    const pants = ['#4a5a7a', '#6a5a8a', '#5a7a6a', '#8a7a5a', '#4a6a8a', '#7a5a6a'];
    const skin = ['#ffd9b0', '#f0b888', '#d89860', '#ffe8c8'];
    const hair = ['#3a2a1a', '#2a2a3a', '#6a4a2a', '#8a6a3a', '#c84a4a', '#3a3a4a'];

    const shirt = rng.pick(shirts), pant = rng.pick(pants), sk = rng.pick(skin), hr = rng.pick(hair);
    const isFemale = rng.chance(0.5);

    // cuerpo
    g.fillStyle = shirt;
    g.fillRect(18, 40, 28, 42);
    // piernas
    g.fillStyle = pant;
    g.fillRect(22, 82, 9, 14);
    g.fillRect(33, 82, 9, 14);
    // brazos
    g.fillStyle = shirt;
    g.fillRect(10, 42, 8, 24);
    g.fillRect(46, 42, 8, 24);
    // cabeza
    g.fillStyle = sk;
    g.beginPath();
    g.arc(32, 28, 13, 0, Math.PI * 2);
    g.fill();
    // pelo
    g.fillStyle = hr;
    g.beginPath();
    g.arc(32, 24, 13, Math.PI, 0);
    g.fill();
    g.fillRect(19, 22, 26, 8);
    if (isFemale) {
      g.fillRect(19, 22, 6, 30); // coleta lateral
    }
    // cara
    g.fillStyle = '#1c1c22';
    g.fillRect(26, 28, 3, 4);
    g.fillRect(36, 28, 3, 4);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildAll() {
    const rng = this.rng;
    const texPool = [];
    const poolSize = 8;
    for (let i = 0; i < poolSize; i++) texPool.push(this._makeSpriteTexture(rng.int(1, 999)));

    for (let i = 0; i < this.count; i++) {
      const tex = texPool[i % poolSize];
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.1, 1.65, 1.1);

      // posición inicial: sobre el cruce o calles cercanas
      const a = rng.float() * Math.PI * 2;
      const r = rng.float() * 38;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      sprite.position.set(x, 0.82, z);

      // destino: cruzar el paso de cebra (hacia el otro lado)
      const targetAngle = rng.chance(0.5) ? Math.PI / 4 : -Math.PI / 4;
      const tr = 24;
      const tx = Math.cos(targetAngle) * tr, tz = Math.sin(targetAngle) * tr;

      const speed = 0.8 + rng.float() * 1.6;
      const dir = new THREE.Vector3(tx - x, 0, tz - z).normalize();

      this.npcs.push({ sprite, dir, speed, phase: rng.float() * Math.PI * 2 });
      this.root.add(sprite);
    }
  }

  update(dt) {
    for (const n of this.npcs) {
      n.sprite.position.x += n.dir.x * n.speed * dt;
      n.sprite.position.z += n.dir.z * n.speed * dt;
      // bob de caminar
      n.phase += dt * 8;
      n.sprite.position.y = 0.82 + Math.abs(Math.sin(n.phase)) * 0.06;
      // al llegar lejos del cruce, reaparecer al otro lado
      const d = Math.hypot(n.sprite.position.x, n.sprite.position.z);
      if (d > 30) {
        n.sprite.position.x = -n.sprite.position.x * 0.5;
        n.sprite.position.z = -n.sprite.position.z * 0.5;
      }
    }
  }

  resize() {}
  dispose() {
    this.world.root.remove(this.root);
    this.root.traverse(o => {
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}
