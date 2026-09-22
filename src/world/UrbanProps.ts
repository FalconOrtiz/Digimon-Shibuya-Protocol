import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedBox, metaSurface, boxProjectedUV } from '../fx/Sculpt';
import {
  steelMaterial,
  galvanisedMaterial,
  paintedMetal,
  barkMaterial,
  foliageMaterial,
  rubberMaterial,
  carPaint,
  carGlass,
  glowMaterial,
  soilMaterial,
} from '../fx/materials/PropMaterials';
import type { Ctx, GameSystem } from '../core/Context';
import type { Rng } from '../core/Rng';
import { LAYOUT } from './Layout';
import { place, type Collider } from './geom';

/**
 * Street furniture. Everything that repeats more than eight times is an
 * InstancedMesh (ART_DIRECTION §2.9): one draw per part, whatever the count.
 * Cars wait at the stop lines — the scramble is in its pedestrian phase.
 */

type V2 = [number, number];

const ARMS: V2[] = [[0, -1], [0, 1], [1, 0], [-1, 0]];
const CAR_COLOURS = [0xf2f2ee, 0xc8ccd2, 0x1c1e24, 0x2a5a3e, 0xe0b830, 0x8a2a2a, 0x3a4e7a, 0xf2f2ee];
const VEND_COLOURS = [0xd83a3a, 0x2a6ad8, 0xf0f0f0, 0x2a9a5a];
const LEAF_TINTS = [0xffffff, 0xe8f0c8, 0xd8e8b0, 0xfff0c0];

interface Batch {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  shadow: boolean;
  items: THREE.Matrix4[];
  colors?: THREE.Color[];
}

function merge(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) {
    if (!p.attributes.uv) p.setAttribute('uv', boxProjectedUV(p));
    if (!p.index) {
      const idx = new Uint32Array(p.attributes.position.count);
      for (let i = 0; i < idx.length; i++) idx[i] = i;
      p.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') p.deleteAttribute(k);
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(place(x, y, z, ry, 1, 1, 1, rx, rz));

export class UrbanProps implements GameSystem {
  static id = 'props';
  static deps = ['world', 'buildings'];

  readonly root = new THREE.Group();
  readonly colliders: Collider[] = [];
  private batches = new Map<string, Batch>();
  private ctx!: Ctx;

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.root.name = 'UrbanProps';
    ctx.get<{ root: THREE.Object3D }>('world').root.add(this.root);
    const rng = ctx.rng.fork();
    this.defineParts();
    this.lamps();
    this.trees(rng);
    this.signals();
    this.bollardsAndRails();
    this.vending(rng);
    this.cars(rng);
    this.puddles(rng);
    this.flush();
    ctx.get<{ addColliders(c: Collider[]): void }>('buildings').addColliders(this.colliders);
    return this;
  }

  /* ---------------------------------------------------------------- */

  private part(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): void {
    this.batches.set(key, { geo, mat, shadow, items: [] });
  }

  private put(key: string, m: THREE.Matrix4, color?: number | THREE.Color): void {
    const b = this.batches.get(key)!;
    b.items.push(m);
    if (color !== undefined) (b.colors ??= []).push(color instanceof THREE.Color ? color : new THREE.Color(color));
  }

  private flush(): void {
    for (const [key, b] of this.batches) {
      if (!b.items.length) {
        b.geo.dispose();
        continue;
      }
      const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.items.length);
      mesh.name = `props:${key}`;
      b.items.forEach((m, i) => mesh.setMatrixAt(i, m));
      b.colors?.forEach((c, i) => mesh.setColorAt(i, c));
      mesh.castShadow = b.shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    }
    this.batches.clear();
  }

  private defineParts(): void {
    // Lamp: tapered pole, curved arm over the road, lantern head (local +Z = road).
    const pole = cyl(0.07, 0.12, 7.2);
    at(pole, 0, 3.6, 0);
    const base = roundedBox(0.42, 0.5, 0.42, 0.08, 2);
    at(base, 0, 0.25, 0);
    const arm = cyl(0.05, 0.05, 1.9, 8);
    at(arm, 0, 7.05, 0.85, Math.PI / 2 - 0.12);
    const hood = roundedBox(0.5, 0.18, 0.95, 0.07, 2);
    at(hood, 0, 7.2, 1.85);
    this.part('lamp.pole', merge(pole, base, arm, hood), steelMaterial());
    const lens = roundedBox(0.36, 0.06, 0.75, 0.03, 1);
    at(lens, 0, 7.08, 1.85);
    this.part('lamp.head', lens, glowMaterial('lamp', 0xffe2b0, 0.12, 3.2), false);

    // Street tree: bark trunk, sculpted cartoon canopy, grate planter.
    const trunk = cyl(0.11, 0.2, 3.2, 10);
    at(trunk, 0, 1.6, 0);
    this.part('tree.trunk', trunk, barkMaterial());
    const canopy = metaSurface(
      [
        { x: 0, y: 0, z: 0, r: 1.25 },
        { x: 0.9, y: -0.25, z: 0.2, r: 0.85 },
        { x: -0.8, y: -0.2, z: -0.3, r: 0.9 },
        { x: 0.2, y: 0.75, z: -0.2, r: 0.85 },
        { x: -0.3, y: -0.3, z: 0.9, r: 0.8 },
        { x: 0.3, y: -0.2, z: -0.95, r: 0.75 },
      ],
      { resolution: 26 },
    );
    canopy.setAttribute('uv', boxProjectedUV(canopy, 0.6));
    canopy.deleteAttribute('color');
    at(canopy, 0, 4.2, 0);
    this.part('tree.canopy', canopy, foliageMaterial(0xffffff));
    const planter = roundedBox(1.5, 0.12, 1.5, 0.04, 1);
    at(planter, 0, 0.06, 0);
    this.part('tree.planter', planter, steelMaterial(), false);
    const soil = new THREE.PlaneGeometry(1.3, 1.3);
    at(soil, 0, 0.07, 0, -Math.PI / 2);
    this.part('tree.soil', soil, soilMaterial(), false);

    // Signal mast (local +Z = over the road, local -X = towards inbound
    // traffic, +X = towards the crosswalk): 3-lamp head, pedestrian box.
    const mast = cyl(0.1, 0.13, 6);
    at(mast, 0, 3, 0);
    const mastArm = cyl(0.07, 0.07, 6.5, 8);
    at(mastArm, 0, 5.7, 3.25, Math.PI / 2);
    const head = roundedBox(0.34, 0.42, 1.25, 0.08, 2);
    at(head, 0, 5.3, 5.6);
    const ped = roundedBox(0.3, 0.7, 0.36, 0.06, 2);
    at(ped, 0.26, 2.7, 0);
    this.part('signal.mast', merge(mast, mastArm, head, ped), paintedMetal('signal', 0x6a6e76));
    const lamp = (z: number) => at(new THREE.CircleGeometry(0.13, 16), -0.175, 5.3, z, 0, -Math.PI / 2);
    this.part('signal.red', lamp(5.2), glowMaterial('sig.red', 0xff3a24, 0.9, 2.6), false);
    this.part('signal.off', merge(lamp(5.6), lamp(6.0)), paintedMetal('signal.off', 0x1a1c20), false);
    const walk = new THREE.PlaneGeometry(0.26, 0.26);
    at(walk, 0.415, 2.85, 0, 0, Math.PI / 2);
    this.part('signal.walk', walk, glowMaterial('sig.walk', 0x3affa0, 0.9, 2.4), false);

    // Bollard + guard rail segment.
    const bollard = merge(at(cyl(0.09, 0.1, 0.85, 12), 0, 0.425, 0), at(new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.85, 0));
    this.part('bollard', bollard, galvanisedMaterial());
    const rail = merge(
      at(cyl(0.04, 0.04, 2.4, 8), 0, 0.9, 0, 0, 0, Math.PI / 2),
      at(cyl(0.035, 0.035, 2.4, 8), 0, 0.5, 0, 0, 0, Math.PI / 2),
      at(cyl(0.045, 0.045, 0.95, 8), -1.15, 0.475, 0),
    );
    this.part('rail', rail, galvanisedMaterial());

    // Vending machine: painted cabinet with a lit display window.
    const vend = roundedBox(1.0, 1.85, 0.8, 0.06, 2);
    at(vend, 0, 0.925, 0);
    this.part('vend.body', vend, paintedMetal('vend', 0xffffff));
    const vpanel = new THREE.PlaneGeometry(0.8, 0.95);
    at(vpanel, 0, 1.22, 0.405);
    this.part('vend.panel', vpanel, glowMaterial('vend', 0xe8f4ff, 0.55, 1.9), false);

    // Car (local +Z forward): body, glasshouse, wheels, lamps.
    const body = roundedBox(1.8, 0.72, 4.4, 0.22, 3);
    at(body, 0, 0.62, 0);
    this.part('car.body', body, carPaint(0xffffff));
    const cabin = roundedBox(1.58, 0.62, 2.3, 0.2, 3);
    at(cabin, 0, 1.22, -0.25);
    this.part('car.glass', cabin, carGlass());
    const wheels: THREE.BufferGeometry[] = [];
    for (const wx of [-0.82, 0.82]) for (const wz of [-1.4, 1.4]) wheels.push(at(cyl(0.34, 0.34, 0.26, 16), wx, 0.34, wz, 0, 0, Math.PI / 2));
    this.part('car.wheels', merge(...wheels), rubberMaterial());
    const hl = merge(at(new THREE.PlaneGeometry(0.36, 0.14), -0.6, 0.72, 2.205), at(new THREE.PlaneGeometry(0.36, 0.14), 0.6, 0.72, 2.205));
    this.part('car.head', hl, glowMaterial('headlight', 0xfff4dc, 0.3, 2.6), false);
    const tl = merge(at(new THREE.PlaneGeometry(0.4, 0.12), -0.6, 0.76, -2.205, 0, Math.PI), at(new THREE.PlaneGeometry(0.4, 0.12), 0.6, 0.76, -2.205, 0, Math.PI));
    this.part('car.tail', tl, glowMaterial('taillight', 0xff2a1a, 0.5, 2.4), false);

    // Puddle: irregular disc, mirror-smooth so the sky and neon land in it.
    const puddle = new THREE.CircleGeometry(1, 28);
    const pos = puddle.attributes.position as THREE.BufferAttribute;
    for (let i = 1; i < pos.count; i++) {
      const a = Math.atan2(pos.getY(i), pos.getX(i));
      const k = 1 + 0.22 * Math.sin(a * 3 + 1.3) + 0.12 * Math.sin(a * 5 + 0.4);
      pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k);
    }
    puddle.rotateX(-Math.PI / 2);
    const water = new THREE.MeshPhysicalMaterial({
      color: 0x12151a,
      roughness: 0.03,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.4,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    water.name = 'prop.puddle';
    this.part('puddle', puddle, water, false);
  }

  /* ---------------------------------------------------------------- */

  /** World position on an arm: `t` metres out from the centre, `lat` across. */
  private onArm(dir: V2, t: number, lat: number): V2 {
    return [dir[0] * t - dir[1] * lat, dir[1] * t + dir[0] * lat];
  }

  private lamps(): void {
    for (const dir of ARMS) for (const s of [-1, 1]) {
      for (let t = 26; t < LAYOUT.STREET_LEN; t += 24) {
        const [x, z] = this.onArm(dir, t, s * (LAYOUT.CURB + 0.9));
        const ry = Math.atan2(dir[1] * s, -dir[0] * s);
        const m = place(x, LAYOUT.SLAB_H, z, ry);
        this.put('lamp.pole', m);
        this.put('lamp.head', m);
      }
    }
  }

  private trees(rng: Rng): void {
    for (const dir of ARMS) for (const s of [-1, 1]) {
      for (let t = 38; t < LAYOUT.STREET_LEN - 4; t += 24) {
        const [x, z] = this.onArm(dir, t, s * (LAYOUT.CURB + 1.7));
        const k = rng.range(0.85, 1.2);
        const ry = rng.range(0, Math.PI * 2);
        this.put('tree.trunk', place(x, LAYOUT.SLAB_H, z, ry, 1, k, 1));
        this.put('tree.canopy', place(x, LAYOUT.SLAB_H + (k - 1) * 3.2, z, ry, k, k * rng.range(0.9, 1.05), k), rng.pick(LEAF_TINTS));
        this.put('tree.planter', place(x, LAYOUT.SLAB_H, z));
        this.put('tree.soil', place(x, LAYOUT.SLAB_H, z));
        this.colliders.push({ x: x - 0.3, z: z - 0.3, w: 0.6, d: 0.6, h: 4 });
      }
    }
  }

  /** One mast per arm per corner, facing inbound traffic; all red, pedestrians green. */
  private signals(): void {
    const C = LAYOUT.CURB;
    const stop = C + LAYOUT.ZEBRA + 2.2;
    for (const dir of ARMS) {
      // Japan drives on the left: inbound traffic is on the arm's +perp side.
      const [x, z] = this.onArm(dir, stop - 1.2, C + 0.7);
      const toRoad = Math.atan2(dir[1], -dir[0]);
      const m = place(x, LAYOUT.SLAB_H, z, toRoad);
      for (const k of ['signal.mast', 'signal.red', 'signal.off', 'signal.walk']) this.put(k, m);
    }
  }

  private bollardsAndRails(): void {
    const C = LAYOUT.CURB;
    const landing = C + 1 + LAYOUT.ZEBRA;
    for (const dir of ARMS) for (const s of [-1, 1]) {
      // Bollards between the crosswalk landing and the first lamp.
      for (let t = landing + 1; t < 25; t += 1.6) {
        const [x, z] = this.onArm(dir, t, s * (C + 0.45));
        this.put('bollard', place(x, LAYOUT.SLAB_H, z));
      }
      // Guard rail runs between lamps, gaps left for the trees.
      for (let t = 28.5; t < LAYOUT.STREET_LEN - 2; t += 2.4) {
        const local = (t - 26) % 24;
        if (local > 9 && local < 15) continue;
        const [x, z] = this.onArm(dir, t, s * (C + 0.45));
        this.put('rail', place(x, LAYOUT.SLAB_H, z, Math.atan2(-dir[1], dir[0])));
      }
    }
  }

  private vending(rng: Rng): void {
    for (const dir of ARMS) for (const s of [-1, 1]) {
      for (let t = 34; t < 150; t += rng.range(22, 40)) {
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) {
          const [x, z] = this.onArm(dir, t + i * 1.05, s * (LAYOUT.FRONT - 1.2));
          const ry = Math.atan2(dir[1] * s, -dir[0] * s);
          const m = place(x, LAYOUT.SLAB_H, z, ry);
          this.put('vend.body', m, rng.pick(VEND_COLOURS));
          this.put('vend.panel', m);
        }
        const [cx, cz] = this.onArm(dir, t + (n - 1) * 0.52, s * (LAYOUT.FRONT - 1.2));
        const along = Math.abs(dir[0]) > 0;
        this.colliders.push(along ? { x: cx - n * 0.55, z: cz - 0.45, w: n * 1.1, d: 0.9, h: 1.9 } : { x: cx - 0.45, z: cz - n * 0.55, w: 0.9, d: n * 1.1, h: 1.9 });
      }
    }
  }

  /** Queues at every stop line on the inbound (left-hand) lanes. */
  private cars(rng: Rng): void {
    const stop = LAYOUT.CURB + LAYOUT.ZEBRA + 2.2;
    for (const dir of ARMS) {
      const ry = Math.atan2(-dir[0], -dir[1]);
      for (const lane of [3.3, 9.7]) {
        const count = rng.int(2, 4);
        let t = stop + 3.2;
        for (let i = 0; i < count; i++) {
          const k = rng.chance(0.12) ? 1.35 : rng.range(0.92, 1.05);
          const [x, z] = this.onArm(dir, t, lane);
          const m = place(x, 0, z, ry, 1, k > 1.2 ? 1.25 : 1, k);
          this.put('car.body', m, rng.pick(CAR_COLOURS));
          for (const p of ['car.glass', 'car.wheels', 'car.head', 'car.tail']) this.put(p, m);
          const hl = 2.2 * k;
          this.colliders.push(Math.abs(dir[0]) > 0 ? { x: x - hl, z: z - 0.9, w: hl * 2, d: 1.8, h: 1.6 } : { x: x - 0.9, z: z - hl, w: 1.8, d: hl * 2, h: 1.6 });
          t += 4.4 * k + rng.range(1.2, 2.2);
        }
      }
    }
  }

  private puddles(rng: Rng): void {
    for (let i = 0; i < 46; i++) {
      const dir = rng.pick(ARMS);
      const onRoad = rng.chance(0.65);
      const t = rng.range(onRoad ? 4 : 24, 120);
      const lat = onRoad ? rng.range(-11, 11) : rng.pick([-1, 1]) * rng.range(LAYOUT.CURB + 2.5, LAYOUT.FRONT - 2);
      const [x, z] = this.onArm(dir, t, lat);
      const r = rng.range(0.6, 2.2);
      const y = onRoad ? 0.02 : LAYOUT.SLAB_H + 0.012;
      this.put('puddle', place(x, y, z, rng.range(0, Math.PI * 2), r * rng.range(1, 1.8), 1, r));
    }
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
