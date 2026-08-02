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
import { asphaltTex, sidewalkTex, crosswalkTex } from './tex.js';

const WORLD = {
  size: 320,            // zona jugable total
  roadWidth: 26,        // ancho de calle
  sidewalkWidth: 8,     // ancho de acera
  crosswalkLen: 40,     // longitud del paso de cebra diagonal
  blockSize: 48,        // manzana de edificios
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
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, WORLD.size, 1, 1),
      new THREE.MeshStandardMaterial({
        map: asphaltTex(512, 7),
        roughness: 0.95, metalness: 0.0
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  // ---- paso de cebra diagonal (el icono) ----
  _buildCrosswalks() {
    // franja diagonal NE-SW y NW-SE, cruzando el centro
    const cw = crosswalkTex(256, 11);
    const make = (angle) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD.crosswalkLen, 9, 1, 1),
        new THREE.MeshStandardMaterial({ map: cw, roughness: 0.9, metalness: 0 })
      );
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = angle;
      m.position.y = 0.02;
      m.receiveShadow = true;
      return m;
    };
    this.root.add(make(Math.PI / 4));   // diagonal principal
    this.root.add(make(-Math.PI / 4));  // la otra diagonal (X del cruce)
  }

  // ---- calles (carreteras) que salen del cruce ----
  _buildStreets() {
    const asphalt = asphaltTex(512, 7);
    const mk = (w, h, x, z, ry = 0) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h, 1, 1),
        new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95, metalness: 0 })
      );
      m.rotation.x = -Math.PI / 2;
      m.rotation.y = ry;
      m.position.set(x, 0.01, z);
      m.receiveShadow = true;
      return m;
    };
    const L = WORLD.size / 2;
    const R = WORLD.roadWidth;

    // N-S (vertical)
    this.root.add(mk(R, L * 2, 0, 0));
    // E-W (horizontal)
    this.root.add(mk(L * 2, R, 0, 0));
    // diagonales (aproximación: dos cintas a 45°)
    const d = new THREE.Mesh(
      new THREE.PlaneGeometry(L * 1.2, R, 1, 1),
      new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 })
    );
    d.rotation.x = -Math.PI / 2;
    d.rotation.z = Math.PI / 4;
    d.position.y = 0.015;
    this.root.add(d);
    const d2 = d.clone();
    d2.rotation.z = -Math.PI / 4;
    this.root.add(d2);

    // marcas de carril: líneas discontinuas blancas/amarillas sobre las calles
    this._buildLaneMarkings();
  }

  _buildLaneMarkings() {
    const mkLine = (w, len, x, z, ry = 0, color = '#f2f2f0') => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = color;
      for (let i = 0; i < 8; i += 2) g.fillRect(0, i * 4 + 1, 128, 2.4);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(len / 8, 1);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(len, w),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75 })
      );
      m.rotation.x = -Math.PI / 2;
      m.rotation.y = ry;
      m.position.set(x, 0.03, z);
      return m;
    };
    const L = WORLD.size / 2;
    // línea central N-S
    this.root.add(mkLine(0.18, L * 1.6, 0, 0));
    // línea central E-W
    this.root.add(mkLine(0.18, L * 1.6, 0, 0, Math.PI / 2));
  }

  // ---- manzanas de edificios alrededor del cruce ----
  _buildBlocks() {
    const bs = WORLD.blockSize;
    const halfRoad = WORLD.roadWidth / 2 + WORLD.sidewalkWidth;
    const positions = [
      // esquinas del cruce (4 manzanas grandes)
      { x: -bs, z: -bs }, { x: bs, z: -bs },
      { x: -bs, z: bs }, { x: bs, z: bs },
      // manzanas más lejanas (borde de la zona jugable)
      { x: -bs * 2, z: -bs * 2 }, { x: 0, z: -bs * 2 }, { x: bs * 2, z: -bs * 2 },
      { x: -bs * 2, z: 0 }, { x: bs * 2, z: 0 },
      { x: -bs * 2, z: bs * 2 }, { x: 0, z: bs * 2 }, { x: bs * 2, z: bs * 2 },
    ];

    // aceras alrededor del cruce (anillo)
    const sw = sidewalkTex(256, 3);
    const addSidewalk = (x, z, w, h, ry = 0) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h, 1, 1),
        new THREE.MeshStandardMaterial({ map: sw, roughness: 0.85, metalness: 0.02 })
      );
      m.rotation.x = -Math.PI / 2;
      m.rotation.y = ry;
      m.position.set(x, 0.025, z);
      m.receiveShadow = true;
      this.root.add(m);
    };
    // anillo alrededor del cruce central (cuadrado de 60×60 con hueco en medio)
    const ring = 42;
    addSidewalk(0, -ring / 2, 92, 8);            // norte
    addSidewalk(0, ring / 2, 92, 8);             // sur
    addSidewalk(-ring / 2, 0, 8, 92);            // oeste
    addSidewalk(ring / 2, 0, 8, 92);             // este

    for (const p of positions) {
      this._buildBlock(p.x, p.z, bs);
    }
  }

  // una manzana = plataforma de acera + hueco donde el sistema de edificios pondrá torres
  _buildBlock(x, z, size) {
    const sw = sidewalkTex(256, 3);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size, 1, 1),
      new THREE.MeshStandardMaterial({ map: sw, roughness: 0.85, metalness: 0.02 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    m.receiveShadow = true;
    this.root.add(m);
    // borde de la manzana (curb)
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(size + 0.5, 0.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x6a6a6e, roughness: 0.8 })
    );
    curb.position.set(x, 0.2, z + size / 2);
    this.root.add(curb);
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
