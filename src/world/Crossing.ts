import * as THREE from 'three';
import { roundedBox, metaSurface, bakeCavityAO, type Ball } from '../fx/Sculpt';
import {
  asphaltMaterial,
  roadPaintMaterial,
  sidewalkMaterial,
  brickPaverMaterial,
  curbMaterial,
  tactileMaterial,
  TILE,
} from '../fx/materials/TerrainMaterials';
import { LAYOUT, groundHeightAt } from './Layout';
import { MergeBin, place, groundUV, facadeUV, flatQuad } from './geom';
import type { Ctx, GameSystem } from '../core/Context';

/**
 * The scramble: four road arms, zebra on every arm plus the two diagonals,
 * lane paint, sidewalk quadrants with a brick band along the curb, and the
 * Hachiko statue. Everything static is fused per material.
 */
export class Crossing implements GameSystem {
  static id = 'world';
  static deps: string[] = [];

  readonly root = new THREE.Group();
  private ctx!: Ctx;

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.root.name = 'World';
    ctx.scene.add(this.root);
    const size = ctx.config.q.bakeSize;
    const bin = new MergeBin();
    this.roads(bin, size);
    this.markings(bin);
    this.sidewalks(bin, size);
    bin.build(this.root, { name: 'crossing', castShadow: false });
    this.hachiko();
    return this;
  }

  heightAt(x: number, z: number): number {
    return groundHeightAt(x, z);
  }

  walkableAt(_x: number, _z: number): boolean {
    return true;
  }

  private roads(bin: MergeBin, size: number): void {
    const mat = asphaltMaterial(size);
    const L = LAYOUT.STREET_LEN + 60;
    const R = LAYOUT.ROAD;
    const ns = flatQuad(R, L * 2);
    groundUV(ns, TILE.asphalt);
    bin.add(ns, mat);
    for (const s of [-1, 1]) {
      const len = L - R / 2;
      const ew = flatQuad(len, R);
      ew.translate(s * (R / 2 + len / 2), 0, 0);
      groundUV(ew, TILE.asphalt);
      bin.add(ew, mat);
    }
    // City floor under the skyline so nothing ever floats over the void.
    const floor = new THREE.CircleGeometry(620, 48);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, -0.04, 0);
    groundUV(floor, TILE.asphalt);
    bin.add(floor, mat);
  }

  private markings(bin: MergeBin): void {
    const white = roadPaintMaterial();
    const yellow = roadPaintMaterial(256, 0xf0c050);
    const C = LAYOUT.CURB;
    const Z = LAYOUT.ZEBRA;
    const stripe = (mat: THREE.Material, len: number, wid: number, x: number, z: number, ry: number, y = 0.012) => {
      bin.add(flatQuad(len, wid), mat, place(x, y, z, ry));
    };
    const band = C + 1 + Z / 2;
    // Arm crosswalks: stripes run with the traffic, pedestrians walk across them.
    for (let o = -C + 1; o <= C - 1; o += 1.1) {
      stripe(white, Z, 0.55, o, -band, -Math.PI / 2);
      stripe(white, Z, 0.55, o, band, -Math.PI / 2);
      stripe(white, Z, 0.55, -band, o, 0);
      stripe(white, Z, 0.55, band, o, 0);
    }
    // The two diagonals of the scramble X.
    const diag = Math.hypot(C * 2, C * 2);
    for (let d = -diag / 2 + 3.5; d <= diag / 2 - 3.5; d += 1.1) {
      const k = d / Math.SQRT2;
      stripe(white, Z, 0.55, k, k, Math.PI / 4, 0.013);
      stripe(white, Z, 0.55, k, -k, -Math.PI / 4, 0.014);
    }
    // Stop lines and lane paint on each arm.
    const stop = C + Z + 2.2;
    for (const s of [-1, 1]) {
      stripe(white, C - 0.6, 0.45, s * (C / 2), s * stop, 0);
      stripe(white, 0.45, C - 0.6, s * stop, -s * (C / 2), 0);
      for (let d = stop + 3; d < LAYOUT.STREET_LEN + 50; d += 6) {
        stripe(yellow, 3, 0.18, 0, s * d, -Math.PI / 2);
        stripe(yellow, 3, 0.18, s * d, 0, 0);
        for (const lane of [-C / 2, C / 2]) {
          stripe(white, 2, 0.14, lane, s * d, -Math.PI / 2);
          stripe(white, 2, 0.14, s * d, lane, 0);
        }
      }
    }
  }

  private sidewalks(bin: MergeBin, size: number): void {
    const tiles = sidewalkMaterial('warm', size);
    const brick = brickPaverMaterial(size);
    const curb = curbMaterial();
    const tactile = tactileMaterial();
    const C = LAYOUT.CURB;
    const L = LAYOUT.STREET_LEN + 40;
    const H = LAYOUT.SLAB_H;
    const span = L - C;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = sx * (C + span / 2);
        const cz = sz * (C + span / 2);
        const slab = roundedBox(span, H, span, 0.04, 1);
        slab.translate(cx, H / 2, cz);
        groundUV(slab, TILE.sidewalk);
        bin.add(slab, tiles);

        // Brick band along both curbs, then the curb stones themselves.
        const bw = 2.0;
        const b1 = flatQuad(span - 0.35, bw);
        b1.translate(sx * (C + 0.35 + (span - 0.35) / 2), H + 0.004, sz * (C + 0.35 + bw / 2));
        groundUV(b1, TILE.brick);
        bin.add(b1, brick);
        const b2 = flatQuad(bw, span - 0.35 - bw);
        b2.translate(sx * (C + 0.35 + bw / 2), H + 0.004, sz * (C + 0.35 + bw + (span - 0.35 - bw) / 2));
        groundUV(b2, TILE.brick);
        bin.add(b2, brick);

        const kx = roundedBox(span, 0.24, 0.36, 0.06, 2);
        kx.translate(cx, 0.12, sz * (C + 0.18));
        facadeUV(kx, 1, 1, 0, [0.5, 0.5]);
        bin.add(kx, curb);
        const kz = roundedBox(0.36, 0.24, span - 0.36, 0.06, 2);
        kz.translate(sx * (C + 0.18), 0.12, sz * (C + 0.36 + (span - 0.36) / 2));
        facadeUV(kz, 1, 1, 0, [0.5, 0.5]);
        bin.add(kz, curb);

        // Tactile landings where each crosswalk meets this corner.
        const landing = C + 1 + LAYOUT.ZEBRA / 2;
        const t1 = roundedBox(LAYOUT.ZEBRA, 0.03, 0.42, 0.01, 1);
        t1.translate(sx * landing, H + 0.012, sz * (C + 0.75));
        bin.add(t1, tactile);
        const t2 = roundedBox(0.42, 0.03, LAYOUT.ZEBRA, 0.01, 1);
        t2.translate(sx * (C + 0.75), H + 0.012, sz * landing);
        bin.add(t2, tactile);
        const t3 = roundedBox(1.6, 0.03, 1.6, 0.01, 1);
        t3.translate(sx * (C + 1.2), H + 0.012, sz * (C + 1.2));
        bin.add(t3, tactile);
      }
    }
  }

  /** Hachiko: a sculpted bronze Akita on a granite plinth, SW corner. */
  private hachiko(): void {
    const g = new THREE.Group();
    g.name = 'Hachiko';
    const granite = new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.7, metalness: 0 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 0.42, metalness: 0.85 });
    const plinth = new THREE.Mesh(roundedBox(1.6, 1.1, 2.2, 0.12, 3), granite);
    plinth.position.y = 0.55;
    plinth.castShadow = plinth.receiveShadow = true;
    g.add(plinth);
    const balls: Ball[] = [
      { x: 0, y: 0.55, z: 0.05, r: 0.34, sx: 1, sy: 0.9, sz: 1.5 },
      { x: 0, y: 0.95, z: 0.42, r: 0.24 },
      { x: 0, y: 0.9, z: 0.66, r: 0.12, sz: 1.3 },
      { x: -0.11, y: 1.18, z: 0.42, r: 0.07, sy: 1.6 },
      { x: 0.11, y: 1.18, z: 0.42, r: 0.07, sy: 1.6 },
      { x: -0.14, y: 0.24, z: 0.36, r: 0.08, sy: 2.4 },
      { x: 0.14, y: 0.24, z: 0.36, r: 0.08, sy: 2.4 },
      { x: -0.16, y: 0.2, z: -0.3, r: 0.13, sy: 1.6 },
      { x: 0.16, y: 0.2, z: -0.3, r: 0.13, sy: 1.6 },
      { x: 0, y: 0.72, z: -0.46, r: 0.08, sy: 1.6 },
    ];
    const geo = metaSurface(balls, { resolution: 44 });
    bakeCavityAO(geo, new THREE.Vector3(0, 0.6, 0), 0.45);
    bronze.vertexColors = true;
    const dog = new THREE.Mesh(geo, bronze);
    dog.position.y = 1.1;
    dog.castShadow = dog.receiveShadow = true;
    g.add(dog);
    g.position.set(-(LAYOUT.CURB + 5.2), LAYOUT.SLAB_H, LAYOUT.CURB + 6.5);
    g.rotation.y = -Math.PI * 0.75;
    this.root.add(g);
  }

  dispose(): void {
    this.ctx.scene.remove(this.root);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}
