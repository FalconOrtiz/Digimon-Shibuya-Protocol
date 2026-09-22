import * as THREE from 'three';
import { roundedBox } from '../fx/Sculpt';
import { facadeMaterial, roofMaterial, trimMaterial, shopGlassMaterial, type FacadeSpec } from '../fx/materials/BuildingMaterials';
import { neonSignMaterial, ledScreenMaterial } from '../fx/materials/NeonMaterials';
import { paintedMetal, shutterMaterial } from '../fx/materials/PropMaterials';
import type { LedScreenOptions } from '../core/TextureLab';
import { MergeBin, facadeUV, place, type Collider } from './geom';

/**
 * Modular tower kit. A tower is a podium, one to three shaft volumes with
 * setbacks, a crown, a street-level shopfront and signage on its street face.
 * Every volume is a filleted `roundedBox` (≥ 1.5 cm bevel, ART_DIRECTION §2.1)
 * with world-metric facade UVs so windows keep one size across the city.
 */

export type Face = 'n' | 's' | 'e' | 'w';

const FACE_DIR: Record<Face, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export interface SignSpec {
  text: string;
  color: number;
  vertical?: boolean;
}

export interface TowerSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  facade: FacadeSpec;
  podium?: FacadeSpec;
  podiumH?: number;
  /** 0 = straight shaft, 1-2 = stepped. */
  setbacks?: number;
  crown?: 'flat' | 'plant' | 'lit';
  crownColor?: number;
  front: Face;
  shop?: boolean;
  awning?: number;
  signs?: SignSpec[];
  /** Big flat ad board over the podium; materials come from a shared pool. */
  ad?: { material: THREE.Material; aspect: number };
  billboard?: LedScreenOptions & { w: number; h: number; y: number };
  seed: number;
}

export interface KitBins {
  /** Opaque, shadow-casting building mass. */
  mass: MergeBin;
  /** Emissive signage: no shadows. */
  glow: MergeBin;
}

const FLAT_UV: Record<string, [number, number]> = {
  punched: [0.004, 0.975],
  ribbon: [0.004, 0.98],
  curtain: [0.025, 0.033],
  concrete: [0.25, 0.25],
  tile: [0.02, 0.02],
};

function hash(seed: number, k: number): number {
  const s = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function volume(bins: KitBins, spec: FacadeSpec, size: number, w: number, h: number, d: number, x: number, y0: number, z: number, r = 0.6): void {
  const mat = facadeMaterial(spec, size);
  const geo = roundedBox(w, h, d, Math.min(r, w * 0.1, d * 0.1), 2);
  geo.translate(x, y0 + h / 2, z);
  facadeUV(geo, mat.userData.tileU, mat.userData.tileV, 0, FLAT_UV[spec.kind]);
  bins.mass.add(geo, mat);
}

function slab(bins: KitBins, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.08): void {
  const geo = roundedBox(w, h, d, Math.min(r, h * 0.45), 1);
  geo.translate(x, y, z);
  facadeUV(geo, 1, 1, 0, [0.5, 0.5]);
  bins.mass.add(geo, mat);
}

/** Quad facing `dir`, centred at (x, y, z). */
function quad(bin: MergeBin, mat: THREE.Material, w: number, h: number, x: number, y: number, z: number, dir: [number, number]): void {
  const g = new THREE.PlaneGeometry(w, h);
  bin.add(g, mat, place(x, y, z, Math.atan2(dir[0], dir[1])));
}

export function buildTower(t: TowerSpec, bins: KitBins, size: number): Collider {
  const f = FACE_DIR[t.front];
  const r: [number, number] = [-f[1], f[0]];
  const podiumH = t.podiumH ?? Math.min(t.h, 7 + Math.floor(hash(t.seed, 1) * 3) * 3.5);
  const faceDepth = Math.abs(f[0]) > 0 ? t.w : t.d;
  const faceWidth = Math.abs(f[0]) > 0 ? t.d : t.w;
  const at = (along: number, out: number, y: number) =>
    [t.x + r[0] * along + f[0] * (faceDepth / 2 + out), y, t.z + r[1] * along + f[1] * (faceDepth / 2 + out)] as const;

  // Podium + shaft volumes.
  volume(bins, t.podium ?? t.facade, size, t.w, podiumH, t.d, t.x, 0, t.z);
  let top = podiumH;
  if (t.h > podiumH + 2) {
    const steps = Math.max(1, (t.setbacks ?? 0) + 1);
    const shaftH = t.h - podiumH;
    let sw = t.w * 0.94;
    let sd = t.d * 0.94;
    for (let s = 0; s < steps; s++) {
      const hh = s === steps - 1 ? t.h - top : shaftH * (s === 0 ? 0.55 : 0.3);
      volume(bins, t.facade, size, sw, hh, sd, t.x, top, t.z);
      slab(bins, trimMaterial(), sw + 0.5, 0.45, sd + 0.5, t.x, top + 0.2, t.z, 0.18);
      top += hh;
      sw *= 0.82;
      sd *= 0.82;
    }
  }

  // Cornice over the podium and a roof slab with parapet on the top volume.
  slab(bins, trimMaterial(), t.w + 0.6, 0.5, t.d + 0.6, t.x, podiumH - 0.25, t.z, 0.2);
  const roofW = t.h > podiumH + 2 ? t.w * 0.94 * Math.pow(0.82, Math.max(1, (t.setbacks ?? 0) + 1) - 1) : t.w;
  const roofD = roofW * (t.d / t.w);
  slab(bins, roofMaterial(), roofW - 0.4, 0.3, roofD - 0.4, t.x, top + 0.1, t.z, 0.1);

  const crown = t.crown ?? 'plant';
  if (crown === 'plant') {
    for (let i = 0; i < 3; i++) {
      const px = t.x + (hash(t.seed, 10 + i) - 0.5) * roofW * 0.5;
      const pz = t.z + (hash(t.seed, 20 + i) - 0.5) * roofD * 0.5;
      slab(bins, trimMaterial(), 2 + hash(t.seed, 30 + i) * 2, 1.4, 1.6 + hash(t.seed, 40 + i) * 1.5, px, top + 0.9, pz, 0.2);
    }
  } else if (crown === 'lit') {
    const band = neonSignMaterial({ text: ' ', color: t.crownColor ?? 0x4de1ff, panel: t.crownColor ?? 0x4de1ff });
    const cw = roofW * 0.9;
    const cd = roofD * 0.9;
    for (const [dx, dz, w, dir] of [
      [0, cd / 2 + 0.02, cw, [0, 1]],
      [0, -cd / 2 - 0.02, cw, [0, -1]],
      [cw / 2 + 0.02, 0, cd, [1, 0]],
      [-cw / 2 - 0.02, 0, cd, [-1, 0]],
    ] as [number, number, number, [number, number]][]) {
      quad(bins.glow, band.material, w, 0.8, t.x + dx, top - 1.6, t.z + dz, dir);
    }
  }

  // Shopfront band on the street face.
  if (t.shop !== false) {
    const sw = faceWidth * 0.84;
    const [gx, , gz] = at(0, 0.06, 0);
    quad(bins.mass, shopGlassMaterial(), sw, 3.4, gx, 1.8, gz, f);
    const [mx, , mz] = at(0, 0.12, 0);
    for (let i = -2; i <= 2; i++) {
      slab(bins, trimMaterial(), Math.abs(f[0]) > 0 ? 0.14 : 0.12, 3.6, Math.abs(f[0]) > 0 ? 0.12 : 0.14, mx + r[0] * i * sw * 0.25, 1.8, mz + r[1] * i * sw * 0.25, 0.03);
    }
    if (hash(t.seed, 5) < 0.35) {
      const [hx, , hz] = at(sw * 0.3, 0.09, 0);
      quad(bins.mass, shutterMaterial(), sw * 0.25, 3.2, hx, 1.7, hz, f);
    }
    const awning = paintedMetal(`awning.${(t.awning ?? 0xc84a3a).toString(16)}`, t.awning ?? 0xc84a3a);
    const [ax, , az] = at(0, 0.9, 0);
    const aw = Math.abs(f[0]) > 0 ? 1.8 : sw;
    const ad = Math.abs(f[0]) > 0 ? sw : 1.8;
    const geo = roundedBox(aw, 0.22, ad, 0.08, 2);
    geo.translate(ax, 3.9, az);
    facadeUV(geo, 1, 1, 0, [0.5, 0.5]);
    bins.mass.add(geo, awning);
  }

  // Blade signs stacked up the street face near the corners, flat signs between.
  const signs = t.signs ?? [];
  signs.forEach((s, i) => {
    const sm = neonSignMaterial(s);
    if (s.vertical) {
      const hgt = Math.min(podiumH + (t.h - podiumH) * 0.5, 5.5 + [...s.text].length * 1.3);
      const wid = hgt * sm.aspect;
      const side = i % 2 === 0 ? 1 : -1;
      const along = side * (faceWidth / 2 - 1.2 - (i >> 1) * 2.4);
      const y = 4.6 + hgt / 2 + (i >> 1) * 1.2;
      const [sx, , sz] = at(along, wid / 2 + 0.25, y);
      // Two faces back to back so the blade reads from both ends of the street.
      quad(bins.glow, sm.material, wid, hgt, sx + r[0] * 0.06, y, sz + r[1] * 0.06, r);
      quad(bins.glow, sm.material, wid, hgt, sx - r[0] * 0.06, y, sz - r[1] * 0.06, [-r[0], -r[1]]);
      const cab = Math.abs(r[0]) > 0 ? [0.1, hgt + 0.2, wid + 0.2] : [wid + 0.2, hgt + 0.2, 0.1];
      slab(bins, trimMaterial(), cab[0], cab[1], cab[2], sx, y, sz, 0.04);
    } else {
      const wid = Math.min(faceWidth * 0.6, 2.2 * sm.aspect);
      const hgt = wid / sm.aspect;
      const y = podiumH + 1.2 + hgt / 2 + i * 0.4;
      const [sx, , sz] = at((hash(t.seed, 60 + i) - 0.5) * faceWidth * 0.2, 0.22, y);
      quad(bins.glow, sm.material, wid, hgt, sx, y, sz, f);
    }
  });

  if (t.ad) {
    const { material, aspect } = t.ad;
    const hgt = Math.min((faceWidth * 0.7) / aspect, 9, t.h - podiumH - 3);
    const wid = hgt * aspect;
    const y = podiumH + 1.4 + hgt / 2;
    if (hgt > 2.5) {
      const [sx, , sz] = at(0, 0.3, y);
      quad(bins.glow, material, wid, hgt, sx, y, sz, f);
      const frame = Math.abs(f[0]) > 0 ? [0.3, hgt + 0.4, wid + 0.4] : [wid + 0.4, hgt + 0.4, 0.3];
      slab(bins, trimMaterial(), frame[0], frame[1], frame[2], sx - f[0] * 0.17, y, sz - f[1] * 0.17, 0.1);
    }
  }

  if (t.billboard) {
    const b = t.billboard;
    const mat = ledScreenMaterial(b);
    const [bx, , bz] = at(0, 0.35, b.y);
    quad(bins.glow, mat, b.w, b.h, bx, b.y, bz, f);
    const frame = Math.abs(f[0]) > 0 ? [0.4, b.h + 0.6, b.w + 0.6] : [b.w + 0.6, b.h + 0.6, 0.4];
    slab(bins, trimMaterial(), frame[0], frame[1], frame[2], bx - f[0] * 0.2, b.y, bz - f[1] * 0.2, 0.12);
  }

  return { x: t.x - t.w / 2, z: t.z - t.d / 2, w: t.w, d: t.d, h: t.h };
}

/** Round tower (Shibuya 109): cylinder with tile cladding and a crown ring. */
export function buildRoundTower(
  bins: KitBins,
  size: number,
  o: { x: number; z: number; radius: number; h: number; facade: FacadeSpec; sign: SignSpec; face: [number, number] },
): Collider {
  const mat = facadeMaterial(o.facade, size);
  const geo = new THREE.CylinderGeometry(o.radius, o.radius * 1.04, o.h, 40, Math.ceil(o.h / 3.5));
  geo.translate(o.x, o.h / 2, o.z);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i) - o.x, pos.getZ(i) - o.z);
    uv[i * 2] = (a * o.radius) / mat.userData.tileU;
    uv[i * 2 + 1] = pos.getY(i) / mat.userData.tileV;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  bins.mass.add(geo, mat);

  const ring = new THREE.CylinderGeometry(o.radius + 0.5, o.radius + 0.5, 1.2, 40);
  ring.translate(o.x, o.h + 0.4, o.z);
  bins.mass.add(ring, trimMaterial());
  const cap = new THREE.CylinderGeometry(o.radius - 0.2, o.radius - 0.2, 0.3, 40);
  cap.translate(o.x, o.h + 1.1, o.z);
  bins.mass.add(cap, roofMaterial());

  // Flat-mounted tategaki sign on the drum, facing the crossing.
  const sm = neonSignMaterial(o.sign);
  const hgt = o.h * 0.55;
  const wid = hgt * sm.aspect;
  const sx = o.x + o.face[0] * (o.radius + 0.35);
  const sz = o.z + o.face[1] * (o.radius + 0.35);
  quad(bins.glow, sm.material, wid, hgt, sx, o.h * 0.56, sz, o.face);
  return { x: o.x - o.radius, z: o.z - o.radius, w: o.radius * 2, d: o.radius * 2, h: o.h };
}

/** Plain massing for the far skyline: one volume, roof slab, no signage. */
export function buildMass(bins: KitBins, size: number, spec: FacadeSpec, x: number, z: number, w: number, d: number, h: number): void {
  volume(bins, spec, size, w, h, d, x, 0, z, 0.8);
  slab(bins, roofMaterial(), w - 0.6, 0.3, d - 0.6, x, h + 0.1, z, 0.1);
}
