// src/world/shibuya.js — Shibuya Crossing procedural.
// El cruce famoso: 5 vías confluyendo, paso de cebra diagonal en X sobre el cruce,
// manzanas con aceras, calles que salen en las direcciones reales aproximadas.
//
// Convención: el cruce está centrado en (0,0). Eje Y = arriba (norte = -Z en three).
// Calles (nombres aproximados):
//   - N  → hacia Aoyama / Omotesando (recto, +Z)
//   - S  → hacia el 109 y Shibuya Center-gai (recto, -Z)
//   - E  → hacia Miyamasuzaka (recto, +X)
//   - W  → hacia Dogenzaka / Hachiko (recto, -X)
//   - SW → hacia el edificio Tsutaya / Diagonal (en diagonal)

import * as THREE from 'three';
import { asphaltTex, sidewalkTex } from './tex.js';
import { bakeColorMap, bakeNormalMap, cached, NOISE } from '../core/TextureLab';
import { tileableFbm } from '../core/Noise';

export const LAYOUT = {
  ROAD: 26,
  SW: 8,
  SW_CENTER: 17,
  SLAB_H: 0.26,
  CURB_INNER: 13.2
};

const WORLD = {
  size: 320,
  roadWidth: LAYOUT.ROAD,
  sidewalkWidth: LAYOUT.SW,
  crosswalkLen: 40,
  blockSize: 48
};

export class Shibuya {
  static id = 'world';
  static deps = [];

  constructor() { this.root = new THREE.Group(); }

  init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    ctx.scene.add(this.root);
    this._buildGround();
    this._buildCrosswalks();
    this._buildStreets();
    this._buildBlocks();
    return this;
  }

  // ---- suelo base ----
  _buildGround() {
    const map = cached('sp.asphalt.alb', () => bakeColorMap({
      size: 256,
      color: (u, v) => {
        const n = tileableFbm(NOISE.stone, u, v, 6, 3);
        const t = 0.5 + n * 0.06;
        return [0.227 + t * 0.03, 0.267 + t * 0.03, 0.314 + t * 0.03];
      }
    }));
    const nrm = cached('sp.asphalt.n', () => bakeNormalMap({
      size: 256,
      height: (u, v) => 0.5 + tileableFbm(NOISE.stone, u, v, 22, 4) * 0.35
    }, 1.4));
    // 4 m per tile — isotropic speckle, no stretched streaks
    const tiles = WORLD.size / 4;
    map.repeat.set(tiles, tiles);
    nrm.repeat.set(tiles, tiles);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, WORLD.size, 1, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0x243040,
        map,
        normalMap: nrm,
        normalScale: new THREE.Vector2(0.1, 0.1),
        roughness: 0.32, metalness: 0.0, clearcoat: 0.28, clearcoatRoughness: 0.45
      })
    );
    ground.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  // ---- paso de cebra pintado (plano, sobre el asfalto, no sobre la acera) ----
  _buildCrosswalks() {
    const paint = new THREE.MeshStandardMaterial({
      color: 0xc4c0b6,
      roughness: 0.68,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const stripe = (len, x, z, rotY, n = 12) => {
      const g = new THREE.Group();
      const w = 0.92, gap = 0.55;
      const span = n * (w + gap);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), paint);
        m.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
        m.position.set(0, 0.014, -span / 2 + i * (w + gap));
        m.receiveShadow = true;
        g.add(m);
      }
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      this.root.add(g);
    };
    stripe(24, 0, 0.4, 0, 14);
    stripe(20, 0, -12, 0, 12);
    stripe(14, -22, -1, Math.PI / 2, 8);
    stripe(14, 22, -1, Math.PI / 2, 8);

    const puddle = new THREE.MeshPhysicalMaterial({
      color: 0x1a2838, roughness: 0.08, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1,
      transparent: true, opacity: 0.45, emissive: 0x2a6078, emissiveIntensity: 0.05
    });
    for (const [px, pz, sx] of [[-4, 4, 2.2], [5, 2, 1.6], [2, -3, 1.8], [-6, -1, 1.5]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1, 20), puddle);
      p.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      p.position.set(px, 0.016, pz);
      p.scale.set(sx, sx * 0.55, 1);
      this.root.add(p);
    }
  }

  // ---- calles (carreteras) que salen del cruce ----
  _buildStreets() {
    const asphalt = asphaltTex(512, 7);
    const mk = (w, h, x, z, yaw = 0) => {
      const map = asphalt.clone();
      map.repeat.set(Math.max(1, w / 6), Math.max(1, h / 6));
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h, 1, 1),
        new THREE.MeshPhysicalMaterial({
          map, color: 0x2a3340, roughness: 0.38, metalness: 0.0,
          clearcoat: 0.22, clearcoatRoughness: 0.5
        })
      );
      m.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
      m.position.set(x, 0.008, z);
      m.receiveShadow = true;
      return m;
    };
    const L = WORLD.size / 2;
    const R = WORLD.roadWidth;

    this.root.add(mk(R, L * 2, 0, 0));
    this.root.add(mk(L * 2, R, 0, 0));
    this.root.add(mk(L * 1.2, R, 0, 0, Math.PI / 4));
    this.root.add(mk(L * 1.2, R, 0, 0, -Math.PI / 4));
  }

  // ---- manzanas de edificios alrededor del cruce ----
  _buildBlocks() {
    const bs = WORLD.blockSize;
    const positions = [
      { x: -bs, z: -bs }, { x: bs, z: -bs },
      { x: -bs, z: bs }, { x: bs, z: bs },
      { x: -bs * 2, z: -bs * 2 }, { x: 0, z: -bs * 2 }, { x: bs * 2, z: -bs * 2 },
      { x: -bs * 2, z: 0 }, { x: bs * 2, z: 0 },
      { x: -bs * 2, z: bs * 2 }, { x: 0, z: bs * 2 }, { x: bs * 2, z: bs * 2 },
    ];

    this._swMap = sidewalkTex(256, 3);
    this._curbMat = new THREE.MeshStandardMaterial({
      color: 0x5a5856, roughness: 0.68, metalness: 0.1
    });
    this._tactileMat = new THREE.MeshStandardMaterial({
      color: 0xb8942a, roughness: 0.55, metalness: 0.04,
      emissive: 0x3a2800, emissiveIntensity: 0.06
    });

    this._crossingSidewalks();
    this._roadSidewalks();
    this._streetSigns();
    for (const p of positions) this._buildBlock(p.x, p.z, bs);
  }

  _swMat(repeatX, repeatZ) {
    const map = this._swMap.clone();
    map.repeat.set(repeatX, repeatZ);
    return new THREE.MeshStandardMaterial({
      map, color: 0x8a8682, roughness: 0.82, metalness: 0.03
    });
  }

  _crossingSidewalks() {
    const road = WORLD.roadWidth;
    const sw = WORLD.sidewalkWidth;
    const inner = road / 2;
    const slabH = 0.26;
    const curbH = 0.4;
    const curbT = 0.48;
    const span = (inner + sw) * 2;

    const slab = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, slabH, d), this._swMat(w / 2, d / 2));
      m.position.set(x, slabH / 2, z);
      m.receiveShadow = true;
      m.castShadow = true;
      this.root.add(m);
    };
    const curb = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, curbH, d), this._curbMat);
      m.position.set(x, curbH / 2, z);
      m.receiveShadow = true;
      m.castShadow = true;
      this.root.add(m);
    };
    const tactile = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), this._tactileMat);
      m.position.set(x, slabH + 0.018, z);
      this.root.add(m);
    };

    slab(span, sw, 0, -(inner + sw / 2));
    curb(span, curbT, 0, -(inner + curbT / 2));
    tactile(span * 0.72, 0.42, 0, -(inner + 0.65));

    slab(span, sw, 0, inner + sw / 2);
    curb(span, curbT, 0, inner + curbT / 2);
    tactile(span * 0.72, 0.42, 0, inner + 0.65);

    slab(sw, road, -(inner + sw / 2), 0);
    curb(curbT, road, -(inner + curbT / 2), 0);
    tactile(0.42, road * 0.72, -(inner + 0.65), 0);

    slab(sw, road, inner + sw / 2, 0);
    curb(curbT, road, inner + curbT / 2, 0);
    tactile(0.42, road * 0.72, inner + 0.65, 0);
  }

  _roadSidewalks() {
    const sw = WORLD.sidewalkWidth;
    const inner = WORLD.roadWidth / 2;
    const slabH = 0.26;
    const curbH = 0.38;
    const len = 90;
    const start = inner + sw + 6;
    const along = (axis, sign) => {
      const mid = start + len / 2;
      if (axis === 'z') {
        const z = sign * mid;
        const m = new THREE.Mesh(new THREE.BoxGeometry(sw, slabH, len), this._swMat(sw / 2, len / 2));
        m.position.set(sign > 0 ? -(inner + sw / 2) : inner + sw / 2, slabH / 2, z);
        m.receiveShadow = true;
        this.root.add(m);
        const m2 = m.clone();
        m2.material = this._swMat(sw / 2, len / 2);
        m2.position.x = -m.position.x;
        this.root.add(m2);
        for (const x of [inner + 0.2, -(inner + 0.2)]) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, curbH, len), this._curbMat);
          c.position.set(x, curbH / 2, z);
          this.root.add(c);
        }
      } else {
        const x = sign * mid;
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, slabH, sw), this._swMat(len / 2, sw / 2));
        m.position.set(x, slabH / 2, inner + sw / 2);
        m.receiveShadow = true;
        this.root.add(m);
        const m2 = m.clone();
        m2.material = this._swMat(len / 2, sw / 2);
        m2.position.z = -(inner + sw / 2);
        this.root.add(m2);
        for (const z of [inner + 0.2, -(inner + 0.2)]) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(len, curbH, 0.4), this._curbMat);
          c.position.set(x, curbH / 2, z);
          this.root.add(c);
        }
      }
    };
    along('z', 1);
    along('z', -1);
    along('x', 1);
    along('x', -1);
  }

  _streetSigns() {
    const labels = [
      { t: 'KOEN-DORI', x: 0, z: -36, ry: 0 },
      { t: 'CENTER-GAI', x: 0, z: 36, ry: Math.PI },
      { t: 'MIYAMASUZAKA', x: 36, z: 0, ry: -Math.PI / 2 },
      { t: 'DOGENZAKA', x: -36, z: 0, ry: Math.PI / 2 }
    ];
    const poleM = new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.15, roughness: 0.5 });
    for (const s of labels) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 8), poleM);
      pole.position.y = 1.6;
      g.add(pole);
      const c = document.createElement('canvas');
      c.width = 512; c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1a3a68';
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#e8eef8';
      ctx.font = 'bold 52px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.t, 256, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.55, 0.08),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })
      );
      plate.position.y = 3.05;
      g.add(plate);
      g.position.set(s.x, 0, s.z);
      g.rotation.y = s.ry;
      this.root.add(g);
    }
  }

  _buildBlock(x, z, size) {
    const slabH = 0.24;
    const plaza = new THREE.Mesh(
      new THREE.BoxGeometry(size, slabH, size),
      this._swMat(size / 2, size / 2)
    );
    plaza.position.set(x, slabH / 2, z);
    plaza.receiveShadow = true;
    plaza.castShadow = true;
    this.root.add(plaza);

    const curbH = 0.38;
    const t = 0.42;
    const edges = [
      { w: size + t, d: t, px: x, pz: z + size / 2 },
      { w: size + t, d: t, px: x, pz: z - size / 2 },
      { w: t, d: size, px: x + size / 2, pz: z },
      { w: t, d: size, px: x - size / 2, pz: z }
    ];
    for (const e of edges) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(e.w, curbH, e.d), this._curbMat);
      c.position.set(e.px, curbH / 2, e.pz);
      c.castShadow = true;
      c.receiveShadow = true;
      this.root.add(c);
    }
  }

  // superficie de calle transitable (para colisiones del player)
  walkableAt(x, z) {
    // el cruce completo es transitable; las manzanas son sólidas
    return true;
  }

  resize() {}
  dispose() {
    this.ctx.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}
