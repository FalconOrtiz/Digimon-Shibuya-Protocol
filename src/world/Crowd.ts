import * as THREE from 'three';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import {
  armGeometry, bagGeometry, chibiPartMatrix, chibiPose, faceGeometry, hairGeometry, handGeometry, headGeometry,
  hipsGeometry, legGeometry, shoeGeometry, torsoGeometry,
  type ChibiPose, type ChibiSlot, type HairStyle, type TopStyle,
} from '../fx/Chibi';
import type { Ctx, GameSystem } from '../core/Context';
import type { Rng } from '../core/Rng';
import { LAYOUT, groundHeightAt } from '../core/Layout';

/**
 * The scramble crowd: chibi pedestrians from the shared `fx/Chibi` kit (the
 * trainer uses the same parts) instanced per part. Clothing, skin and hair
 * vary through styles and instance colours, so 200 people cost ~16 draw calls.
 * Crossers walk corner to corner (diagonals included); strollers walk the
 * sidewalks of each arm.
 */

const TOPS = [0xd8544e, 0x4a7ec8, 0x3e9a62, 0xe0b040, 0x8a62c0, 0x2eaaa8, 0xe07a3a, 0xf0ece4, 0x2c3242, 0xe88aa8];
const BOTTOMS = [0x2e3444, 0x3a3450, 0x2a3a3a, 0x4a3a2c, 0x5a6478, 0x1e2026];
const SKIN = [0xf0d0b0, 0xe0b890, 0xc89870, 0x9a6a48];
const HAIR = [0x1e1c22, 0x3a2a22, 0x6a4a2e, 0xc8a060, 0xb04838, 0x3a3a48];
const SHOES = [0x1a1a1e, 0xf0f0f0, 0x6a4a34, 0xd84a3a];

const HAIR_STYLES: HairStyle[] = ['short', 'bun', 'bob', 'pony', 'spiky'];
const TOP_STYLES: TopStyle[] = ['tee', 'hoodie'];
const BAGS = [0x2a2e3a, 0xd8544e, 0xe0b040, 0x4a7ec8, 0x6a4a34];

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
  bag: boolean;
  /** Instance slots inside the per-style meshes. */
  topSlot: number;
  hairSlot: number;
  bagSlot: number;
}

type Part = `torso.${TopStyle}` | `hair.${HairStyle}` | 'hips' | 'head' | 'face' | 'bag' | 'legs' | 'shoes' | 'arms' | 'hands';

const ARMS: [number, number][] = [[0, -1], [0, 1], [1, 0], [-1, 0]];

export class Crowd implements GameSystem {
  static id = 'crowd';
  static deps = ['world'];

  readonly root = new THREE.Group();
  private ctx!: Ctx;
  private rng!: Rng;
  private people: Walker[] = [];
  private parts = {} as Record<Part, THREE.InstancedMesh>;
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
      top: r.int(0, TOP_STYLES.length - 1),
      hair: r.int(0, HAIR_STYLES.length - 1),
      bag: r.chance(0.35),
      topSlot: 0,
      hairSlot: 0,
      bagSlot: 0,
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
    const skin = creatureSkin({ color: 0xffffff, wrap: 0.45, rim: 0.22, roughness: 0.6, detail: 'none' });
    skin.vertexColors = true;
    const hair = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, vertexColors: true });
    hair.name = 'crowd.hair';
    const face = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0, vertexColors: true });
    face.name = 'crowd.face';

    const slots = new Map<string, number>();
    const take = (key: string) => {
      const v = slots.get(key) ?? 0;
      slots.set(key, v + 1);
      return v;
    };
    for (const p of this.people) {
      p.topSlot = take(`torso.${TOP_STYLES[p.top]}`);
      p.hairSlot = take(`hair.${HAIR_STYLES[p.hair]}`);
      if (p.bag) p.bagSlot = take('bag');
    }
    for (const t of TOP_STYLES) this.inst(`torso.${t}`, torsoGeometry(t), cloth, Math.max(1, slots.get(`torso.${t}`) ?? 0));
    for (const h of HAIR_STYLES) this.inst(`hair.${h}`, hairGeometry(h), hair, Math.max(1, slots.get(`hair.${h}`) ?? 0));
    this.inst('bag', bagGeometry(), cloth, Math.max(1, slots.get('bag') ?? 0));
    this.inst('hips', hipsGeometry(), cloth, n);
    this.inst('head', headGeometry(), skin, n);
    this.inst('face', faceGeometry(), face, n);
    this.parts.face.castShadow = false;
    this.inst('legs', legGeometry(), cloth, n * 2);
    this.inst('shoes', shoeGeometry(), cloth, n * 2);
    this.inst('arms', armGeometry(), cloth, n * 2);
    this.inst('hands', handGeometry(), skin, n * 2);
    // Only the big volumes cast; small parts disappear in the soft VSM anyway.
    for (const k of ['hands', 'shoes', 'bag', 'hips', ...HAIR_STYLES.map((h) => `hair.${h}`)] as Part[]) {
      this.parts[k].castShadow = false;
    }

    // Colours are fixed per person; only matrices change per frame.
    const col = new THREE.Color();
    this.people.forEach((p, i) => {
      const top = col.setHex(this.rng.pick(TOPS)).clone();
      this.parts[`torso.${TOP_STYLES[p.top]}`].setColorAt(p.topSlot, top);
      this.parts.arms.setColorAt(i * 2, top);
      this.parts.arms.setColorAt(i * 2 + 1, top);
      const sk = col.setHex(this.rng.pick(SKIN)).clone();
      this.parts.head.setColorAt(i, sk);
      this.parts.hands.setColorAt(i * 2, sk);
      this.parts.hands.setColorAt(i * 2 + 1, sk);
      this.parts[`hair.${HAIR_STYLES[p.hair]}`].setColorAt(p.hairSlot, col.setHex(this.rng.pick(HAIR)));
      if (p.bag) this.parts.bag.setColorAt(p.bagSlot, col.setHex(this.rng.pick(BAGS)));
      const bottom = col.setHex(this.rng.pick(BOTTOMS)).clone();
      this.parts.hips.setColorAt(i, bottom);
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

  private readonly pose: ChibiPose = { bob: 0, leg: 0, arm: 0, tilt: 0 };
  private readonly root4 = new THREE.Matrix4();
  private readonly local4 = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();

  private put(part: Part, i: number, slot: ChibiSlot): void {
    chibiPartMatrix(slot, this.pose, this.local4);
    this.parts[part].setMatrixAt(i, this.local4.premultiply(this.root4));
  }

  private write(): void {
    this.people.forEach((w, i) => {
      chibiPose(w.phase, w.wait <= 0 ? 1 : 0, this.pose);
      this.root4.compose(
        this.tmpV.set(w.x, groundHeightAt(w.x, w.z), w.z),
        this.quat.setFromAxisAngle(this.up, w.yaw),
        this.tmpS.setScalar(w.scale),
      );
      this.put(`torso.${TOP_STYLES[w.top]}`, w.topSlot, 'torso');
      this.put(`hair.${HAIR_STYLES[w.hair]}`, w.hairSlot, 'hair');
      if (w.bag) this.put('bag', w.bagSlot, 'bag');
      this.put('hips', i, 'hips');
      this.put('head', i, 'head');
      this.put('face', i, 'face');
      this.put('legs', i * 2, 'legL');
      this.put('legs', i * 2 + 1, 'legR');
      this.put('shoes', i * 2, 'shoeL');
      this.put('shoes', i * 2 + 1, 'shoeR');
      this.put('arms', i * 2, 'armL');
      this.put('arms', i * 2 + 1, 'armR');
      this.put('hands', i * 2, 'handL');
      this.put('hands', i * 2 + 1, 'handR');
    });
    for (const m of Object.values(this.parts)) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g && !g.userData.shared) g.dispose();
    });
  }
}
