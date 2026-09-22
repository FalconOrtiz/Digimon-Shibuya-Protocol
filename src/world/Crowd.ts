import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedBox, metaSurface, bakeCavityAO, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import type { Ctx, GameSystem } from '../core/Context';
import type { Rng } from '../core/Rng';
import { LAYOUT, groundHeightAt } from '../core/Layout';

/**
 * The scramble crowd: chibi pedestrians (head ≈ 1/3.5 of the body, as in the
 * cartoon reference) sculpted once and instanced per part. Clothing, skin and
 * hair vary through instance colours, so 200 people cost ~10 draw calls.
 * Crossers walk corner to corner (diagonals included); strollers walk the
 * sidewalks of each arm.
 */

const TOPS = [0xd8544e, 0x4a7ec8, 0x3e9a62, 0xe0b040, 0x8a62c0, 0x2eaaa8, 0xe07a3a, 0xf0ece4, 0x2c3242, 0xe88aa8];
const BOTTOMS = [0x2e3444, 0x3a3450, 0x2a3a3a, 0x4a3a2c, 0x5a6478, 0x1e2026];
const SKIN = [0xf0d0b0, 0xe0b890, 0xc89870, 0x9a6a48];
const HAIR = [0x1e1c22, 0x3a2a22, 0x6a4a2e, 0xc8a060, 0xb04838, 0x3a3a48];
const SHOES = [0x1a1a1e, 0xf0f0f0, 0x6a4a34, 0xd84a3a];

const HIP = 0.56;
const LEG = 0.5;
const SHOULDER = HIP + 0.4;
const ARM = 0.34;
const HEAD_Y = HIP + 0.66;

interface Walker {
  x: number;
  z: number;
  tx: number;
  tz: number;
  speed: number;
  wait: number;
  phase: number;
  scale: number;
  cross: boolean;
  /** Stroller: which arm, side, and the span it paces. */
  arm: [number, number];
  side: number;
  yaw: number;
  top: number;
  hair: number;
}

type Part = 'torso0' | 'torso1' | 'head' | 'hair0' | 'hair1' | 'eyes' | 'legs' | 'shoes' | 'arms' | 'hands';

const ARMS: [number, number][] = [[0, -1], [0, 1], [1, 0], [-1, 0]];

function sculptTorso(coat: boolean): THREE.BufferGeometry {
  const balls: Ball[] = [
    { x: 0, y: 0.3, z: 0, r: 0.19, sx: 1.2, sz: 0.8 },
    { x: 0, y: 0.13, z: 0, r: 0.17, sx: 1.1, sz: 0.78 },
    { x: 0, y: 0.02, z: 0, r: 0.16, sx: 1.15, sz: 0.8 },
    { x: -0.15, y: 0.34, z: 0, r: 0.08 },
    { x: 0.15, y: 0.34, z: 0, r: 0.08 },
  ];
  if (coat) balls.push({ x: 0, y: -0.12, z: 0, r: 0.17, sx: 1.25, sz: 0.85 }, { x: 0, y: 0.36, z: -0.08, r: 0.12, sx: 1.4 });
  const g = metaSurface(balls, { resolution: 24 });
  bakeCavityAO(g, new THREE.Vector3(0, 0.15, 0), 0.4);
  return g;
}

function hairGeo(style: 0 | 1): THREE.BufferGeometry {
  const cap = new THREE.SphereGeometry(0.212, 22, 12, 0, Math.PI * 2, 0, Math.PI * (style === 0 ? 0.62 : 0.5));
  cap.rotateX(-0.25);
  cap.translate(0, 0.02, -0.015);
  if (style === 0) return cap;
  const bun = new THREE.SphereGeometry(0.085, 14, 10);
  bun.translate(0, 0.19, -0.12);
  const g = mergeGeometries([cap, bun], false)!;
  cap.dispose();
  bun.dispose();
  return g;
}

export class Crowd implements GameSystem {
  static id = 'crowd';
  static deps = ['world'];

  readonly root = new THREE.Group();
  private ctx!: Ctx;
  private rng!: Rng;
  private people: Walker[] = [];
  private parts = {} as Record<Part, THREE.InstancedMesh>;
  private dummy = new THREE.Object3D();
  private corners: [number, number][] = [];

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.root.name = 'Crowd';
    ctx.get<{ root: THREE.Object3D }>('world').root.add(this.root);
    const n = ctx.config.q.crowd;
    const L = LAYOUT.CURB + 2.5;
    this.corners = [[L, L], [-L, L], [L, -L], [-L, -L]];
    for (let i = 0; i < n; i++) this.people.push(this.spawn(i < n * 0.6));
    this.build(n);
    this.write();
    ctx.events.on('battle:stage', (p: { center: { x: number; z: number }; radius: number }) => {
      this.keepOut = { x: p.center.x, z: p.center.z, r: p.radius };
    });
    ctx.events.on('battle:end', () => {
      this.keepOut = null;
    });
    return this;
  }

  /** Disco que la multitud rodea (la arena de combate). */
  private keepOut: { x: number; z: number; r: number } | null = null;

  /** Saca al peatón al borde del disco; así rodea la arena en vez de cruzarla. */
  private avoid(w: Walker): void {
    const k = this.keepOut;
    if (!k) return;
    const dx = w.x - k.x;
    const dz = w.z - k.z;
    const d = Math.hypot(dx, dz);
    if (d >= k.r) return;
    const s = d > 1e-3 ? k.r / d : 1;
    w.x = k.x + (d > 1e-3 ? dx : k.r) * s;
    w.z = k.z + (d > 1e-3 ? dz : 0) * s;
    // Destino dentro del disco: nunca llegaría, así que se elige otro.
    if (Math.hypot(w.tx - k.x, w.tz - k.z) < k.r) this.retarget(w);
  }

  private spawn(cross: boolean): Walker {
    const r = this.rng;
    const w: Walker = {
      x: 0, z: 0, tx: 0, tz: 0,
      speed: r.range(1.05, 1.6),
      wait: 0,
      phase: r.range(0, Math.PI * 2),
      scale: r.chance(0.1) ? r.range(0.72, 0.8) : r.range(0.94, 1.08),
      cross,
      arm: r.pick(ARMS),
      side: r.pick([-1, 1]),
      yaw: 0,
      top: r.int(0, 1),
      hair: r.int(0, 1),
    };
    if (cross) {
      const [cx, cz] = r.pick(this.corners);
      const f = r.float();
      w.x = cx + r.range(-2.5, 2.5);
      w.z = cz + r.range(-2.5, 2.5);
      this.retarget(w);
      // Start somewhere along the first leg so the scramble is full at t=0.
      w.x += (w.tx - w.x) * f;
      w.z += (w.tz - w.z) * f;
    } else {
      const t = r.range(24, 110);
      const lat = w.side * r.range(LAYOUT.CURB + 2.6, LAYOUT.FRONT - 2.2);
      [w.x, w.z] = this.onArm(w.arm, t, lat);
      const dest = r.chance(0.5) ? r.range(24, 110) : t + r.pick([-1, 1]) * 30;
      [w.tx, w.tz] = this.onArm(w.arm, Math.min(130, Math.max(22, dest)), lat);
    }
    return w;
  }

  private onArm(dir: [number, number], t: number, lat: number): [number, number] {
    return [dir[0] * t - dir[1] * lat, dir[1] * t + dir[0] * lat];
  }

  private retarget(w: Walker): void {
    const r = this.rng;
    if (w.cross) {
      const here = this.corners.reduce((best, c) => (Math.hypot(c[0] - w.x, c[1] - w.z) < Math.hypot(best[0] - w.x, best[1] - w.z) ? c : best));
      const others = this.corners.filter((c) => c !== here);
      const [cx, cz] = r.pick(others);
      w.tx = cx + r.range(-3, 3);
      w.tz = cz + r.range(-3, 3);
    } else {
      const lat = -w.arm[1] * w.x + w.arm[0] * w.z;
      [w.tx, w.tz] = this.onArm(w.arm, r.range(24, 130), lat);
    }
    w.wait = r.chance(0.3) ? r.range(0.5, 3) : 0;
  }

  private inst(part: Part, geo: THREE.BufferGeometry, mat: THREE.Material, count: number): void {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.name = `crowd:${part}`;
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    this.parts[part] = m;
    this.root.add(m);
  }

  private build(n: number): void {
    const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, vertexColors: true });
    cloth.name = 'crowd.cloth';
    const plain = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
    plain.name = 'crowd.plain';
    const skin = creatureSkin({ color: 0xffffff, wrap: 0.45, rim: 0.22, roughness: 0.6, detail: 'none' });
    const hair = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
    hair.name = 'crowd.hair';
    const eye = new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.25, metalness: 0 });

    const n0 = this.people.filter((p) => p.top === 0).length;
    const h0 = this.people.filter((p) => p.hair === 0).length;
    this.inst('torso0', sculptTorso(false), cloth, Math.max(1, n0));
    this.inst('torso1', sculptTorso(true), cloth, Math.max(1, n - n0));
    const head = new THREE.SphereGeometry(0.2, 22, 16);
    head.scale(1, 0.96, 0.98);
    this.inst('head', head, skin, n);
    this.inst('hair0', hairGeo(0), hair, Math.max(1, h0));
    this.inst('hair1', hairGeo(1), hair, Math.max(1, n - h0));
    const eyes = new THREE.SphereGeometry(0.03, 10, 8);
    eyes.scale(0.8, 1.25, 0.45);
    this.inst('eyes', eyes, eye, n * 2);
    const leg = new THREE.CapsuleGeometry(0.068, LEG - 0.12, 4, 10);
    this.inst('legs', leg, plain, n * 2);
    const shoe = roundedBox(0.12, 0.08, 0.2, 0.035, 2);
    this.inst('shoes', shoe, plain, n * 2);
    const arm = new THREE.CapsuleGeometry(0.052, ARM - 0.1, 4, 10);
    this.inst('arms', arm, plain, n * 2);
    const hand = new THREE.SphereGeometry(0.055, 10, 8);
    this.inst('hands', hand, skin, n * 2);

    // Colours are fixed per person; only matrices change per frame.
    const col = new THREE.Color();
    const c = { torso0: 0, torso1: 0, hair0: 0, hair1: 0 };
    this.people.forEach((p, i) => {
      const top = col.setHex(this.rng.pick(TOPS)).clone();
      const tk = `torso${p.top}` as 'torso0' | 'torso1';
      this.parts[tk].setColorAt(c[tk]++, top);
      this.parts.arms.setColorAt(i * 2, top);
      this.parts.arms.setColorAt(i * 2 + 1, top);
      const sk = col.setHex(this.rng.pick(SKIN)).clone();
      this.parts.head.setColorAt(i, sk);
      this.parts.hands.setColorAt(i * 2, sk);
      this.parts.hands.setColorAt(i * 2 + 1, sk);
      const hk = `hair${p.hair}` as 'hair0' | 'hair1';
      this.parts[hk].setColorAt(c[hk]++, col.setHex(this.rng.pick(HAIR)));
      const bottom = col.setHex(this.rng.pick(BOTTOMS)).clone();
      const shoe = col.setHex(this.rng.pick(SHOES)).clone();
      for (const s of [0, 1]) {
        this.parts.legs.setColorAt(i * 2 + s, bottom);
        this.parts.shoes.setColorAt(i * 2 + s, shoe);
      }
    });
  }

  update(dt: number): void {
    for (const w of this.people) {
      if (w.wait > 0) {
        w.wait -= dt;
        continue;
      }
      const dx = w.tx - w.x;
      const dz = w.tz - w.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        this.retarget(w);
        continue;
      }
      const step = Math.min(d, w.speed * dt);
      const px = w.x;
      const pz = w.z;
      w.x += (dx / d) * step;
      w.z += (dz / d) * step;
      this.avoid(w);
      const yaw = Math.atan2(w.x - px || dx, w.z - pz || dz);
      let dy = yaw - w.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      w.yaw += dy * Math.min(1, dt * 6);
      w.phase += dt * w.speed * 6.2;
    }
    this.write();
  }

  private set(part: Part, i: number, x: number, y: number, z: number, yaw: number, s: number, rx = 0, rz = 0): void {
    const d = this.dummy;
    d.position.set(x, y, z);
    d.rotation.set(rx, yaw, rz, 'YXZ');
    d.scale.setScalar(s);
    d.updateMatrix();
    this.parts[part].setMatrixAt(i, d.matrix);
  }

  private write(): void {
    const c = { torso0: 0, torso1: 0, hair0: 0, hair1: 0 };
    this.people.forEach((w, i) => {
      const s = w.scale;
      const g = groundHeightAt(w.x, w.z);
      const walking = w.wait <= 0;
      const swing = walking ? Math.sin(w.phase) * 0.42 : 0;
      const bob = walking ? Math.abs(Math.cos(w.phase)) * 0.025 * s : 0;
      const fx = Math.sin(w.yaw);
      const fz = Math.cos(w.yaw);
      const rx = fz;
      const rz = -fx;
      const base = g + bob;

      const tk = `torso${w.top}` as 'torso0' | 'torso1';
      this.set(tk, c[tk]++, w.x, base + HIP * s, w.z, w.yaw, s);
      this.set('head', i, w.x, base + HEAD_Y * s, w.z, w.yaw, s);
      const hk = `hair${w.hair}` as 'hair0' | 'hair1';
      this.set(hk, c[hk]++, w.x, base + HEAD_Y * s, w.z, w.yaw, s);
      for (const side of [-1, 1]) {
        const k = i * 2 + (side > 0 ? 1 : 0);
        const ex = w.x + (rx * 0.075 * side + fx * 0.182) * s;
        const ez = w.z + (rz * 0.075 * side + fz * 0.182) * s;
        this.set('eyes', k, ex, base + (HEAD_Y - 0.01) * s, ez, w.yaw, s);

        const a = swing * side;
        const hx = w.x + rx * 0.085 * side * s;
        const hz = w.z + rz * 0.085 * side * s;
        const hy = base + HIP * s;
        const lx = Math.sin(a) * LEG * s;
        const ly = Math.cos(a) * LEG * s;
        this.set('legs', k, hx + fx * lx * 0.5, hy - ly * 0.5, hz + fz * lx * 0.5, w.yaw, s, -a);
        this.set('shoes', k, hx + fx * (lx + 0.03 * s), Math.max(g + 0.04 * s, hy - ly), hz + fz * (lx + 0.03 * s), w.yaw, s);

        const b = -a * 0.8;
        const sx = w.x + rx * 0.225 * side * s;
        const sz = w.z + rz * 0.225 * side * s;
        const sy = base + SHOULDER * s;
        const ax = Math.sin(b) * ARM * s;
        const ay = Math.cos(b) * ARM * s;
        this.set('arms', k, sx + fx * ax * 0.5, sy - ay * 0.5, sz + fz * ax * 0.5, w.yaw, s, -b, 0.12 * side);
        this.set('hands', k, sx + fx * ax, sy - ay, sz + fz * ax, w.yaw, s);
      }
    });
    for (const m of Object.values(this.parts)) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
