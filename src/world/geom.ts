import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Collects world geometry per material and fuses it into one mesh per
 * material. Static city geometry is thousands of pieces sharing a dozen
 * materials; drawing them one by one was 1500 draw calls, fused it is tens
 * (ART_DIRECTION §2.12).
 */
export class MergeBin {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4): void {
    if (matrix) geo.applyMatrix4(matrix);
    let list = this.parts.get(material);
    if (!list) {
      list = [];
      this.parts.set(material, list);
    }
    list.push(geo);
  }

  build(parent: THREE.Object3D, opts: { castShadow?: boolean; receiveShadow?: boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [material, list] of this.parts) {
      const norm = list.map(normalise);
      const merged = mergeGeometries(norm, false);
      for (const g of list) g.dispose();
      for (const g of norm) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${opts.name ?? 'merged'}:${material.name}`;
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

/** position + normal + uv, indexed — the common denominator for merging. */
function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.attributes.position);
  if (!src.attributes.normal) src.computeVertexNormals();
  out.setAttribute('normal', src.attributes.normal);
  out.setAttribute('uv', src.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
  if (src.index) out.setIndex(src.index);
  else {
    const n = src.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

export function place(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)).clone();
}

/**
 * Facade UVs in tiles, computed in WORLD space after the geometry is placed so
 * every tower shares the same window size. Upward/downward faces get a fixed
 * texel of plain wall (`flat`) so roofs and soffits never show windows.
 */
export function facadeUV(geo: THREE.BufferGeometry, tileU: number, tileV: number, baseY: number, flat: [number, number]): void {
  geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    if (Math.abs(ny) > 0.72) {
      uv[i * 2] = flat[0];
      uv[i * 2 + 1] = flat[1];
      continue;
    }
    const along = Math.abs(nx) > Math.abs(nz) ? -pos.getZ(i) * Math.sign(nx) : pos.getX(i) * Math.sign(nz || 1);
    uv[i * 2] = along / tileU;
    uv[i * 2 + 1] = (pos.getY(i) - baseY) / tileV;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Planar XZ UVs in tiles — ground, slabs, roofs. */
export function groundUV(geo: THREE.BufferGeometry, tile: number, ox = 0, oz = 0): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + ox) / tile;
    uv[i * 2 + 1] = (pos.getZ(i) + oz) / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** A horizontal quad centred at the origin, facing +Y, with 0..1 UVs. */
export function flatQuad(w: number, d: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  return g;
}

export interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}
