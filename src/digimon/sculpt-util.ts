import * as THREE from 'three';
import { bendY } from '../fx/Sculpt';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lerp, clamp } from '../core/Noise';
import { eyeDecalMaterial, paint } from '../fx/materials/CreatureMaterials';

/**
 * sculpt-util — shared sculpting helpers used by the Digimon partners.
 *
 * These were extracted from the Charmander build (the project's quality
 * reference) so Flaremon and Earwingmon get the same hygiene: outward
 * winding, sliver-welding, angular marking fields, and the toon eye stack —
 * without each creature re-implementing them.
 */

/* ------------------------------------------------------------------ */
/* Winding & decimation                                                */
/* ------------------------------------------------------------------ */

/**
 * Guarantees a closed sculpt is wound outward. metaSurface emits correct
 * winding, so this measures positive and returns immediately; it stays as a
 * cheap assertion rather than a fix.
 */
export function fixOutward(geo: THREE.BufferGeometry, label: string): THREE.BufferGeometry {
  const measure = (): number => {
    geo.computeVertexNormals();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < pos.count; i++) {
      cx += pos.getX(i);
      cy += pos.getY(i);
      cz += pos.getZ(i);
    }
    cx /= pos.count;
    cy /= pos.count;
    cz /= pos.count;
    let sum = 0;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - cx;
      const dy = pos.getY(i) - cy;
      const dz = pos.getZ(i) - cz;
      const l = Math.hypot(dx, dy, dz) || 1;
      sum += (nor.getX(i) * dx + nor.getY(i) * dy + nor.getZ(i) * dz) / l;
    }
    return sum / pos.count;
  };

  if (measure() >= 0) return geo;

  const index = geo.getIndex();
  if (index) {
    const a = index.array as Uint32Array | Uint16Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    index.needsUpdate = true;
  }
  console.warn(`[sculpt] ${label} needed a winding flip — mesher regression?`);
  return geo;
}

/**
 * Grid-snapped vertex clustering that collapses marching-cubes slivers and
 * drops degenerate / duplicated faces. Same technique as Charmander's.
 */
export function weldDecimate(geo: THREE.BufferGeometry, cell: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const index = geo.getIndex();
  if (!index) return geo;

  const inv = 1 / cell;
  const map = new Map<string, number>();
  const remap = new Int32Array(pos.count);
  const out: number[] = [];
  const acc: number[] = [];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = out.length / 3;
      out.push(0, 0, 0);
      acc.push(0);
      map.set(key, id);
    }
    out[id * 3] += x;
    out[id * 3 + 1] += y;
    out[id * 3 + 2] += z;
    acc[id] += 1;
    remap[i] = id;
  }
  for (let i = 0; i < acc.length; i++) {
    out[i * 3] /= acc[i];
    out[i * 3 + 1] /= acc[i];
    out[i * 3 + 2] /= acc[i];
  }

  const src = index.array;
  const idx: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < src.length; i += 3) {
    const a = remap[src[i]];
    const b = remap[src[i + 1]];
    const c = remap[src[i + 2]];
    if (a === b || b === c || a === c) continue;
    const k = [a, b, c].slice().sort((p, q) => p - q).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    idx.push(a, b, c);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  geo.dispose();
  return g;
}

/* ------------------------------------------------------------------ */
/* Marking fields                                                      */
/* ------------------------------------------------------------------ */

/** Signed scalar sampled per vertex: positive inside the marking. */
export type MarkField = (
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  i: number,
) => number;

/** Piecewise-linear lookup over a sorted [key, value] table. */
export function ramp(table: [number, number][], k: number): number {
  if (k <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (k >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    if (k <= table[i][0]) {
      const [k0, v0] = table[i - 1];
      const [k1, v1] = table[i];
      return lerp(v0, v1, (k - k0) / (k1 - k0));
    }
  }
  return last[1];
}

/** Writes cavity AO into vertex colours and the field into `aMark`. */
export function markSculpt(
  geo: THREE.BufferGeometry,
  core: THREE.Vector3,
  field: MarkField,
  aoStrength = 0.26,
  smoothIters = 6,
): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  geo.computeBoundingSphere();
  const radius = geo.boundingSphere?.radius ?? 1;

  const colors = new Float32Array(pos.count * 3);
  const mark = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    mark[i] = field(v.x, v.y, v.z, nor.getX(i), nor.getY(i), nor.getZ(i), i);
    const d = clamp(v.distanceTo(core) / radius, 0, 1);
    const ao = lerp(1 - aoStrength, 1, d ** 0.7);
    colors[i * 3] = ao;
    colors[i * 3 + 1] = ao;
    colors[i * 3 + 2] = ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aMark', new THREE.BufferAttribute(mark, 1));
  smoothAttr(geo, 'aMark', smoothIters);
  return geo;
}

/** Laplacian smoothing of a scalar vertex attribute. */
function smoothAttr(geo: THREE.BufferGeometry, name: string, iters: number): void {
  const attr = geo.getAttribute(name) as THREE.BufferAttribute;
  const index = geo.getIndex();
  if (!attr || !index) return;
  const n = attr.count;
  const src = index.array;

  const deg = new Uint16Array(n);
  for (let i = 0; i < src.length; i += 3) {
    deg[src[i]] += 2; deg[src[i + 1]] += 2; deg[src[i + 2]] += 2;
  }
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
  const fill = new Uint32Array(n);
  const adj = new Uint32Array(start[n]);
  const push = (a: number, b: number) => { adj[start[a] + fill[a]++] = b; };
  for (let i = 0; i < src.length; i += 3) {
    const a = src[i]; const b = src[i + 1]; const c = src[i + 2];
    push(a, b); push(a, c); push(b, a); push(b, c); push(c, a); push(c, b);
  }

  let cur: Float32Array = new Float32Array(attr.array as ArrayLike<number>);
  let next: Float32Array = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < n; v++) {
      let sum = cur[v];
      let cnt = 1;
      for (let k = start[v]; k < start[v] + fill[v]; k++) { sum += cur[adj[k]]; cnt++; }
      next[v] = sum / cnt;
    }
    const t = cur; cur = next; next = t;
  }
  (attr.array as Float32Array).set(cur);
  attr.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* Surface probing                                                     */
/* ------------------------------------------------------------------ */

export interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Casts from `origin` along `dir` and returns the outermost hit on a sculpt,
 * so decals (eyes, mouth, nostrils) sit on the surface whatever the balls do.
 */
export function makeSurfaceProbe(geo: THREE.BufferGeometry): (origin: THREE.Vector3, dir: THREE.Vector3) => SurfaceHit | null {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  return (origin, dir) => {
    ray.set(origin, dir.clone().normalize());
    const hits = ray.intersectObject(mesh, false);
    const h = hits[hits.length - 1];
    if (!h?.face) return null;
    return { point: h.point.clone(), normal: h.face.normal.clone() };
  };
}

/* ------------------------------------------------------------------ */
/* Claws                                                               */
/* ------------------------------------------------------------------ */

/** A curved, rounded-tip claw (lathe + bend). The bible forbids sharp apexes. */
export function clawGeometry(len: number, rad: number): THREE.BufferGeometry {
  const T = [0, 0.22, 0.45, 0.68, 0.86, 0.96, 1.0];
  const R = [1.0, 0.95, 0.80, 0.56, 0.30, 0.12, 0.0];
  const geo = new THREE.LatheGeometry(
    T.map((t, i) => new THREE.Vector2(R[i] * rad, t * len)),
    7,
  );
  bendY(geo, -0.62);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ */
/* Toon eye                                                            */
/* ------------------------------------------------------------------ */

let scleraMat: THREE.MeshPhysicalMaterial | null = null;
function toonScleraMaterial(): THREE.MeshPhysicalMaterial {
  scleraMat ??= new THREE.MeshPhysicalMaterial({
    color: 0xf4f1e6, roughness: 0.35, clearcoat: 0.25, clearcoatRoughness: 0.35,
    envMapIntensity: 0.12, name: 'eye.toonSclera', userData: { shared: true },
  });
  return scleraMat;
}

const irisCache = new Map<string, THREE.MeshPhysicalMaterial>();
function irisMaterial(color: number, emissive: number): THREE.MeshPhysicalMaterial {
  const key = `${color}:${emissive}`;
  let m = irisCache.get(key);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.3,
      envMapIntensity: 0.10, emissive, emissiveIntensity: 0.5,
      name: `eye.iris.${key}`, userData: { shared: true },
    });
    irisCache.set(key, m);
  }
  return m;
}

export interface EyeParts {
  holder: THREE.Group;
  lid: THREE.Mesh;
}

/**
 * One large toon eye — nested shallow ellipsoids: dark liner, sclera, iris
 * cap, pupil cap, one catchlight, and a skin dome blink lid. Same stack as
 * Charmander, parameterised for any iris colour.
 */
export function buildEye(
  w: number,
  h: number,
  side: number,
  splay: number,
  skinMat: THREE.Material,
  irisColor = 0x0f6e80,
  irisEmissive = 0x0c4a58,
): EyeParts {
  const holder = new THREE.Group();
  holder.rotation.y = side * splay;
  holder.userData.static = true;

  const d = w * 0.85;

  const sclera = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), toonScleraMaterial());
  sclera.scale.set(w, h, d);
  holder.add(sclera);

  const capGeo = (reach: number, inflate: number): THREE.BufferGeometry => {
    const geo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.asin(clamp(reach, 0, 1)));
    geo.rotateX(Math.PI / 2);
    geo.scale(w * inflate, h * inflate, d * inflate);
    return geo;
  };
  holder.add(new THREE.Mesh(capGeo(0.93, 1.02), irisMaterial(irisColor, irisEmissive)));

  const liner = new THREE.SphereGeometry(1, 20, 14);
  liner.scale(w * 1.10, h * 1.075, d * 0.92);
  liner.translate(0, 0, -d * 0.05);
  const hi = new THREE.SphereGeometry(1, 10, 8);
  hi.scale(w * 0.20, h * 0.13, d * 0.18);
  hi.translate(-w * 0.18, h * 0.16, d * 0.99);
  const parts = [paint(liner, 0x14262c), paint(capGeo(0.46, 1.035), 0x101314), paint(hi, 0xeef1f4)];
  const decal = new THREE.Mesh(mergeGeometries(parts, false)!, eyeDecalMaterial());
  for (const p of parts) p.dispose();
  holder.add(decal);

  const LR = Math.max(w, h) * 1.1;
  const lidGeo = new THREE.SphereGeometry(LR, 14, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  lidGeo.scale(w / LR * 1.02, 2.2, d / LR * 0.55);
  lidGeo.computeVertexNormals();
  const lid = new THREE.Mesh(lidGeo, skinMat);
  lid.position.set(0, h * 0.94, -d * 0.35);
  lid.scale.y = 0;
  lid.castShadow = false;
  lid.userData.anim = true;
  holder.add(lid);

  return { holder, lid };
}
