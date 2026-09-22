import * as THREE from 'three';
import type { FacadeSpec } from '../fx/materials/BuildingMaterials';
import { updateScreens, ledScreenMaterial } from '../fx/materials/NeonMaterials';
import type { Ctx, GameSystem } from '../core/Context';
import type { Rng } from '../core/Rng';
import { LAYOUT } from './Layout';
import { MergeBin, type Collider } from './geom';
import { buildTower, buildRoundTower, buildMass, type KitBins, type SignSpec, type TowerSpec } from './FacadeKit';

/**
 * Every building: the four Shibuya landmarks on the corners, a continuous
 * street wall of kit towers down each arm, back-lot massing and a skyline
 * ring that closes every vista. Owns building colliders.
 */

const F: Record<string, FacadeSpec> = {
  cream: { key: 'f.cream', kind: 'punched', wall: 0xd8d0c2, accent: 0x4a4a52, seed: 3 },
  pale: { key: 'f.pale', kind: 'punched', wall: 0xc4cad4, accent: 0x3a4250, seed: 7 },
  sand: { key: 'f.sand', kind: 'punched', wall: 0xdcc8a8, accent: 0x5a4a3a, seed: 11 },
  lilac: { key: 'f.lilac', kind: 'punched', wall: 0x9a88b4, accent: 0x2e2a3a, seed: 13 },
  terra: { key: 'f.terra', kind: 'ribbon', wall: 0xc47a68, accent: 0x2a2a30, seed: 17 },
  slate: { key: 'f.slate', kind: 'ribbon', wall: 0x6f86a4, accent: 0x22262e, seed: 19 },
  ochre: { key: 'f.ochre', kind: 'ribbon', wall: 0xd6ae6c, accent: 0x2e2a26, seed: 23 },
  blueGlass: { key: 'f.blueglass', kind: 'curtain', wall: 0, glass: 0x2e4868, accent: 0x7c8494 },
  tealGlass: { key: 'f.tealglass', kind: 'curtain', wall: 0, glass: 0x2a5058, accent: 0x8a9096 },
  creamTile: { key: 'f.creamtile', kind: 'tile', wall: 0xe2d4bc },
  brickTile: { key: 'f.bricktile', kind: 'tile', wall: 0xa8604e },
  silverTile: { key: 'f.silvertile', kind: 'tile', wall: 0xc8ccd2 },
  concrete: { key: 'f.concrete', kind: 'concrete', wall: 0x8e9098 },
};

const STREET = [F.cream, F.pale, F.sand, F.lilac, F.terra, F.slate, F.ochre, F.blueGlass, F.tealGlass];
const PODIUMS = [F.creamTile, F.brickTile, F.concrete, undefined, undefined];
const SKY = [F.blueGlass, F.tealGlass, F.slate, F.concrete, F.pale, F.cream];

const NEON = [0xff3d8a, 0x4de1ff, 0xffd23d, 0x7cff6b, 0xff7a2e, 0xb06bff, 0xff4a4a];
const SIGNS_V = ['カラオケ', 'ラーメン', '居酒屋', 'ゲーム', '薬局', '寿司', 'ホテル', '焼肉', 'デジモン', '書店', 'カフェ'];
const SIGNS_H = ['BAR', 'CAFE', '24H', 'SALE', 'MUSIC', 'DIGI', 'HOTEL', 'SUSHI', 'GAMES', 'KARAOKE'];
const AD_PANELS = [0xff5a9a, 0xffc53a, 0x3a9aff, 0x3ad08a, 0xff7a3a, 0xa86aff, 0xff4a5a, 0x2ac8d8];
const AD_TEXT = ['DIGIVICE', 'SALE 50%', 'NEW!', 'DIGI COLA', 'SHIBUYA', 'TAMER', 'BYTE BAR', 'ANIME', 'MEGA', 'LIVE', 'デジタル', '新作'];
const AWNINGS = [0xc84a3a, 0x2f6e5a, 0x3a5a8c, 0xd8a038, 0x6a3a6e, 0x30343c];

const img = (name: string) => `${import.meta.env.BASE_URL}assets/imagine/${name}`;

export class CityBlocks implements GameSystem {
  static id = 'buildings';
  static deps = ['world'];

  readonly root = new THREE.Group();
  readonly colliders: Collider[] = [];
  private ctx!: Ctx;
  private elapsed = 0;
  private ads: { material: THREE.Material; aspect: number }[] = [];

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.root.name = 'CityBlocks';
    ctx.get<{ root: THREE.Object3D }>('world').root.add(this.root);
    const size = ctx.config.q.bakeSize;
    const rng = ctx.rng.fork();
    const bins: KitBins = { mass: new MergeBin(), glow: new MergeBin() };

    this.landmarks(bins, size);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.frontage(bins, size, rng, sx, sz, 'z');
      this.frontage(bins, size, rng, sx, sz, 'x');
      this.backLots(bins, size, rng, sx, sz);
    }
    this.skyline(bins, size, rng);

    bins.mass.build(this.root, { name: 'city', castShadow: true, receiveShadow: true });
    bins.glow.build(this.root, { name: 'signs', castShadow: false, receiveShadow: false });
    return this;
  }

  update(dt: number): void {
    this.elapsed += dt;
    updateScreens(dt, this.elapsed);
  }

  /** Other world systems (props, cars) register their solids here. */
  addColliders(list: Collider[]): void {
    this.colliders.push(...list);
  }

  /** Circle-vs-AABB push out, same contract the player controller already uses. */
  collide(pos: { x: number; z: number }, radius = 0.5): { hit: boolean; nx?: number; nz?: number } {
    for (const c of this.colliders) {
      const nx = Math.max(c.x, Math.min(pos.x, c.x + c.w));
      const nz = Math.max(c.z, Math.min(pos.z, c.z + c.d));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      if (dx * dx + dz * dz < radius * radius) return { hit: true, nx, nz };
    }
    return { hit: false };
  }

  /** Eight shared ad screens (portrait and landscape): 8 draw calls for every ad board in town. */
  private adPool(rng: Rng): { material: THREE.Material; aspect: number }[] {
    if (this.ads.length) return this.ads;
    for (let i = 0; i < 8; i++) {
      const portrait = i % 3 === 0;
      const width = portrait ? 240 : 400;
      const height = portrait ? 320 : 250;
      const panel = AD_PANELS[i % AD_PANELS.length];
      const material = ledScreenMaterial({ width, height, seed: 40 + i, palette: [panel, 0xffffff, rng.pick(AD_PANELS)], text: AD_TEXT[i % AD_TEXT.length] });
      this.ads.push({ material, aspect: width / height });
    }
    return this.ads;
  }

  private tower(bins: KitBins, size: number, t: TowerSpec): void {
    this.colliders.push(buildTower(t, bins, size));
  }

  /** QFRONT (NE), Scramble Square (NW), 109 (SW), Hikarie (SE). */
  private landmarks(bins: KitBins, size: number): void {
    const A = LAYOUT.FRONT;
    this.tower(bins, size, {
      x: A + 14, z: -(A + 13), w: 28, d: 26, h: 38, seed: 101,
      facade: F.tealGlass, podium: F.concrete, podiumH: 7, crown: 'lit', crownColor: 0x4de1ff,
      front: 's', awning: 0x2f6e5a,
      signs: [{ text: 'TSUTAYA', color: 0x3dffb0 }, { text: 'デジモン', color: 0xff3d8a, vertical: true }],
      billboard: { w: 20, h: 13, y: 19, width: 640, height: 416, seed: 1, palette: [0x2e7bff, 0xff3d8a, 0xffd23d], imageUrl: img('led-qfront.jpg') },
    });
    this.tower(bins, size, {
      x: -(A + 15), z: -(A + 15), w: 30, d: 30, h: 128, seed: 102, setbacks: 2,
      facade: F.blueGlass, podium: F.creamTile, podiumH: 14, crown: 'lit', crownColor: 0xffd23d,
      front: 's', awning: 0x3a5a8c,
      signs: [{ text: 'SHIBUYA', color: 0xffd23d }, { text: 'カラオケ', color: 0x4de1ff, vertical: true }],
      billboard: { w: 16, h: 9, y: 22, width: 512, height: 288, seed: 2, palette: [0xb06bff, 0x4de1ff, 0xffffff], imageUrl: img('led-digitonic.jpg') },
    });
    this.colliders.push(buildRoundTower(bins, size, {
      x: -(A + 12), z: A + 12, radius: 10, h: 44, facade: F.silverTile,
      sign: { text: 'SHIBUYA109', color: 0xff3d8a, vertical: true }, face: [Math.SQRT1_2, -Math.SQRT1_2],
    }));
    this.tower(bins, size, {
      x: A + 15, z: A + 15, w: 30, d: 28, h: 92, seed: 104, setbacks: 1,
      facade: F.tealGlass, podium: F.brickTile, podiumH: 10, crown: 'lit', crownColor: 0xff7a2e,
      front: 'n', awning: 0x6a3a6e,
      signs: [{ text: 'HIKARIE', color: 0xff7a2e }],
      billboard: { w: 14, h: 8, y: 16, width: 512, height: 292, seed: 4, palette: [0xff7a2e, 0xffd23d, 0x2e7bff], imageUrl: img('led-tsunet.jpg') },
    });
  }

  /** Continuous street wall along one side of one arm. */
  private frontage(bins: KitBins, size: number, rng: Rng, sx: number, sz: number, axis: 'x' | 'z'): void {
    const A = LAYOUT.FRONT;
    let along = A + 31;
    let prev: FacadeSpec | undefined;
    let n = 0;
    while (along < LAYOUT.STREET_LEN) {
      const lot = rng.range(10, 18);
      const depth = rng.range(15, 22);
      const near = along < 80;
      const h = near ? rng.range(16, 44) : rng.range(12, 34);
      let facade = rng.pick(STREET);
      if (facade === prev) facade = STREET[(STREET.indexOf(facade) + 1) % STREET.length];
      prev = facade;
      const c = along + lot / 2;
      const signs: SignSpec[] = [];
      const nv = near ? rng.int(2, 3) : rng.int(1, 2);
      for (let i = 0; i < nv; i++) signs.push({ text: rng.pick(SIGNS_V), color: rng.pick(NEON), vertical: true });
      const ad = rng.chance(near ? 0.75 : 0.45) ? rng.pick(this.adPool(rng)) : undefined;
      if (!ad && rng.chance(0.55)) signs.push({ text: rng.pick(SIGNS_H), color: rng.pick(NEON) });
      const spec: TowerSpec =
        axis === 'z'
          ? { x: sx * (A + depth / 2), z: sz * c, w: depth, d: lot - 0.4, front: sx > 0 ? 'w' : 'e', h, facade, seed: n * 13 + sx * 7 + sz * 3 }
          : { x: sx * c, z: sz * (A + depth / 2), w: lot - 0.4, d: depth, front: sz > 0 ? 'n' : 's', h, facade, seed: n * 17 + sx * 5 + sz * 11 };
      spec.podium = rng.pick(PODIUMS);
      spec.setbacks = h > 34 ? 1 : 0;
      spec.crown = rng.chance(0.25) ? 'lit' : 'plant';
      spec.crownColor = rng.pick(NEON);
      spec.awning = rng.pick(AWNINGS);
      spec.signs = signs;
      spec.ad = ad;
      if (!ad && near && rng.chance(0.4)) {
        spec.billboard = {
          w: lot * 0.55, h: lot * 0.34, y: Math.min(h - 3, 9 + rng.range(0, 4)),
          width: 384, height: 240, seed: n + 20, palette: [rng.pick(NEON), rng.pick(NEON), 0xffffff],
          text: rng.pick(SIGNS_H),
        };
      }
      this.tower(bins, size, spec);
      along += lot;
      n++;
    }
  }

  /** Mid-rise massing behind the street walls — reads in the aerial shot. */
  private backLots(bins: KitBins, size: number, rng: Rng, sx: number, sz: number): void {
    const start = LAYOUT.FRONT + 32;
    for (let a = start; a < LAYOUT.STREET_LEN - 8; a += 24) {
      for (let b = start; b < LAYOUT.STREET_LEN - 8; b += 24) {
        if (rng.chance(0.15)) continue;
        const w = rng.range(14, 20);
        const d = rng.range(14, 20);
        const h = rng.range(14, 46);
        const x = sx * (a + 12);
        const z = sz * (b + 12);
        buildMass(bins, size, rng.pick(STREET), x, z, w, d, h);
        this.colliders.push({ x: x - w / 2, z: z - d / 2, w, d, h });
      }
    }
  }

  /** Towers beyond the street ends; the one straight down the north arm closes the vista. */
  private skyline(bins: KitBins, size: number, rng: Rng): void {
    buildMass(bins, size, F.blueGlass, -6, -232, 34, 30, 158);
    buildMass(bins, size, F.tealGlass, 34, -214, 26, 24, 104);
    for (let i = 0; i < 72; i++) {
      const ang = (i / 72) * Math.PI * 2 + rng.range(-0.03, 0.03);
      const rad = rng.range(196, 330);
      const w = rng.range(18, 34);
      const d = rng.range(18, 34);
      const h = rng.range(34, 118) * (rad < 240 ? 0.8 : 1);
      buildMass(bins, size, rng.pick(SKY), Math.cos(ang) * rad, Math.sin(ang) * rad, w, d, h);
    }
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
