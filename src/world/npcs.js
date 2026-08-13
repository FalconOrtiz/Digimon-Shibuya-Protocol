// 28 sculpted pedestrians — better than Pallet Town capsules.
import * as THREE from 'three';
import { roundedBox } from '../fx/Sculpt';
import { creatureSkin } from '../fx/CreatureMaterials';
import { bakeColorMap, cached } from '../core/TextureLab';
import { makeRng } from '../core/Noise';
import { LAYOUT } from './shibuya.js';

const SHIRTS = [0xc04a62, 0x4a7ab8, 0x3a8a58, 0xc49838, 0x7a58b0, 0x2aa0a0, 0xc06838, 0x2a3048];
const PANTS = [0x2e3340, 0x3a3248, 0x2a3838, 0x403028];
const SKIN = [0xe0c0a0, 0xc8a078, 0xb08860, 0x8a5a3a];
const HAIR = [0x1e1c20, 0x5a3a24, 0xc8a050, 0xb03830];
const EYE = 0x1b1412;
const SHOE = 0x1a1a1e;
const HIP_Y = 0.70;
const HIP_SEP = 0.048;
const LEG_LEN = 0.36;
const AMP = 0.28;

function clothTex(hex) {
  return cached(`cloth-${hex.toString(16)}`, () =>
    bakeColorMap({
      size: 64,
      color: (u, v) => {
        const r = makeRng(Math.floor(u * 32) * 5 + Math.floor(v * 32) * 9 + hex)();
        const k = 0.88 + r * 0.14;
        return [((hex >> 16) & 255) / 255 * k, ((hex >> 8) & 255) / 255 * k, (hex & 255) / 255 * k];
      }
    })
  );
}

export class Npcs {
  static id = 'npcs';
  static deps = ['world'];

  constructor() { this.root = new THREE.Group(); }

  init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.world = ctx.get('world');
    this.world.root.add(this.root);
    this.count = 28;
    this._build();
    return this;
  }

  _inst(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.castShadow = true;
    m.count = 0;
    this.root.add(m);
    return m;
  }

  _build() {
    const n = this.count;
    const torsoG = roundedBox(0.32, 0.40, 0.20, 0.06, 2);
    const hipG = roundedBox(0.26, 0.10, 0.18, 0.04, 2);
    const legG = new THREE.CapsuleGeometry(0.048, 0.22, 3, 6);
    const shoeG = roundedBox(0.09, 0.05, 0.14, 0.02, 2);
    const headG = new THREE.SphereGeometry(0.118, 10, 8);
    const hairG = new THREE.SphereGeometry(0.124, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const armG = new THREE.CapsuleGeometry(0.038, 0.20, 3, 6);
    const eyeG = new THREE.SphereGeometry(0.018, 8, 6);

    this.torsos = SHIRTS.map((c) => this._inst(torsoG, new THREE.MeshStandardMaterial({
      color: c, map: clothTex(c), roughness: 0.78, metalness: 0
    }), n));
    this.hips = PANTS.map((c) => this._inst(hipG, new THREE.MeshStandardMaterial({
      color: c, map: clothTex(c), roughness: 0.8
    }), n));
    this.legs = PANTS.map((c) => this._inst(legG, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }), n * 2));
    this.shoes = [this._inst(shoeG, new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.7 }), n * 2)];
    this.heads = SKIN.map((c) => this._inst(headG, creatureSkin({ color: c, wrap: 0.45, rim: 0.2, roughness: 0.62, detail: 'none' }), n));
    this.hairs = HAIR.map((c) => this._inst(hairG, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }), n));
    this.arms = SHIRTS.map((c) => this._inst(armG, new THREE.MeshStandardMaterial({
      color: c, map: clothTex(c), roughness: 0.78
    }), n * 2));
    this.eyes = [this._inst(eyeG, new THREE.MeshStandardMaterial({ color: EYE, roughness: 0.4 }), n * 2)];

    this.people = [];
    const sw = LAYOUT.SW_CENTER;
    for (let i = 0; i < n; i++) {
      const route = this.rng.int(0, 5);
      let x, z, dir, path;
      if (route <= 1) {
        path = 'ns';
        dir = new THREE.Vector3(0, 0, route === 0 ? 1 : -1);
        x = (this.rng.float() - 0.5) * 8;
        z = (this.rng.float() - 0.5) * 20;
      } else if (route <= 3) {
        path = 'ew';
        dir = new THREE.Vector3(route === 2 ? 1 : -1, 0, 0);
        x = (this.rng.float() - 0.5) * 20;
        z = (this.rng.float() - 0.5) * 8;
      } else {
        path = 'walk';
        const side = this.rng.chance(0.5) ? 1 : -1;
        if (this.rng.chance(0.5)) {
          dir = new THREE.Vector3(this.rng.chance(0.5) ? 1 : -1, 0, 0);
          x = (this.rng.float() - 0.5) * 36;
          z = side * sw;
        } else {
          dir = new THREE.Vector3(0, 0, this.rng.chance(0.5) ? 1 : -1);
          x = side * sw;
          z = (this.rng.float() - 0.5) * 36;
        }
      }
      this.people.push({
        shirt: this.rng.int(0, SHIRTS.length - 1),
        pant: this.rng.int(0, PANTS.length - 1),
        skin: this.rng.int(0, SKIN.length - 1),
        hair: this.rng.int(0, HAIR.length - 1),
        dir, path,
        speed: 1.0 + this.rng.float() * 0.9,
        phase: this.rng.float() * Math.PI * 2,
        h: 0.92 + this.rng.float() * 0.14,
        kid: this.rng.chance(0.12),
        x, z
      });
    }
    this.dummy = new THREE.Object3D();
    this._write();
  }

  _write() {
    const cT = new Array(SHIRTS.length).fill(0);
    const cP = new Array(PANTS.length).fill(0);
    const cL = new Array(PANTS.length).fill(0);
    const cH = new Array(SKIN.length).fill(0);
    const cR = new Array(HAIR.length).fill(0);
    const cA = new Array(SHIRTS.length).fill(0);
    let cS = 0;
    let cE = 0;
    const d = this.dummy;
    for (const p of this.people) {
      const sc = p.kid ? p.h * 0.72 : p.h;
      const yaw = Math.atan2(p.dir.x, p.dir.z);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const rx = cy, rz = -sy;

      d.scale.set(sc, sc, sc);
      d.rotation.set(0, yaw, 0);
      d.position.set(p.x, HIP_Y * sc + 0.16 * sc, p.z);
      d.updateMatrix();
      this.torsos[p.shirt].setMatrixAt(cT[p.shirt]++, d.matrix);
      d.position.y = HIP_Y * sc;
      d.updateMatrix();
      this.hips[p.pant].setMatrixAt(cP[p.pant]++, d.matrix);

      const headY = (HIP_Y + 0.48) * sc;
      d.position.y = headY;
      d.updateMatrix();
      this.heads[p.skin].setMatrixAt(cH[p.skin]++, d.matrix);
      d.position.y = headY + 0.07 * sc;
      d.updateMatrix();
      this.hairs[p.hair].setMatrixAt(cR[p.hair]++, d.matrix);

      const face = 0.11 * sc;
      for (const es of [-1, 1]) {
        d.position.set(p.x + rx * 0.04 * sc * es + sy * face, headY + 0.01 * sc, p.z + rz * 0.04 * sc * es + cy * face);
        d.scale.set(sc, sc, sc);
        d.rotation.set(0, yaw, 0);
        d.updateMatrix();
        this.eyes[0].setMatrixAt(cE++, d.matrix);
      }

      for (const side of [-1, 1]) {
        const phase = p.phase + (side > 0 ? Math.PI : 0);
        const swing = Math.sin(phase) * AMP;
        const hipX = p.x + rx * HIP_SEP * sc * side;
        const hipZ = p.z + rz * HIP_SEP * sc * side;
        const hipY = HIP_Y * sc;
        const len = LEG_LEN * sc;
        const ly = -Math.cos(swing) * len;
        const lz = -Math.sin(swing) * len;
        const fwx = sy * lz;
        const fwz = cy * lz;
        const footX = hipX + fwx;
        const footY = hipY + ly;
        const footZ = hipZ + fwz;

        d.position.set((hipX + footX) * 0.5, (hipY + footY) * 0.5, (hipZ + footZ) * 0.5);
        d.rotation.set(swing, yaw, 0);
        d.scale.set(sc, sc, sc);
        d.updateMatrix();
        this.legs[p.pant].setMatrixAt(cL[p.pant]++, d.matrix);

        d.position.set(footX, Math.max(0.03, footY), footZ);
        d.rotation.set(0, yaw, 0);
        d.updateMatrix();
        this.shoes[0].setMatrixAt(cS++, d.matrix);

        const armSwing = -swing;
        d.position.set(
          p.x + rx * 0.18 * sc * side,
          (HIP_Y + 0.18) * sc,
          p.z + rz * 0.18 * sc * side
        );
        d.rotation.set(armSwing, yaw, 0.22 * side);
        d.updateMatrix();
        this.arms[p.shirt].setMatrixAt(cA[p.shirt]++, d.matrix);
      }
    }
    const apply = (arr, counts) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i].count = counts[i];
        arr[i].instanceMatrix.needsUpdate = true;
      }
    };
    apply(this.torsos, cT);
    apply(this.hips, cP);
    apply(this.legs, cL);
    apply(this.heads, cH);
    apply(this.hairs, cR);
    apply(this.arms, cA);
    this.shoes[0].count = cS;
    this.shoes[0].instanceMatrix.needsUpdate = true;
    this.eyes[0].count = cE;
    this.eyes[0].instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    for (const p of this.people) {
      p.x += p.dir.x * p.speed * dt;
      p.z += p.dir.z * p.speed * dt;
      if (p.path === 'ns' && Math.abs(p.z) > 24) p.z = -Math.sign(p.z) * 23;
      else if (p.path === 'ew' && Math.abs(p.x) > 24) p.x = -Math.sign(p.x) * 23;
      else if (p.path === 'walk') {
        if (Math.abs(p.x) > 48) p.dir.x *= -1;
        if (Math.abs(p.z) > 48) p.dir.z *= -1;
      }
      p.phase += dt * (7.2 + p.speed * 0.8);
    }
    this._write();
  }

  resize() {}
  dispose() {
    this.world.root.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
