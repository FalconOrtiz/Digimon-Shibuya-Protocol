import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { metaSurface, bakeCavityAO } from './Sculpt';

/**
 * Chibi human kit shared by the scramble crowd and the player's trainer, so
 * both read as the same species of cartoon person (ART_DIRECTION §6: head
 * ≈ 40 % of the height, as in the cartoon crossing reference).
 *
 * Every part is authored in its own joint space (limbs hang from the origin)
 * and carries position/normal/color only, so the crowd can instance it and
 * the trainer can parent it without either needing special cases.
 */

export const CHIBI = {
  HIP: 0.42,
  LEG: 0.34,
  SHOULDER: 0.74,
  ARM: 0.28,
  HEAD_Y: 1.0,
  HEAD_R: 0.25,
  HIP_X: 0.085,
  SHOULDER_X: 0.19,
} as const;

export type HairStyle = 'short' | 'bun' | 'bob' | 'pony' | 'spiky' | 'hood';
export type TopStyle = 'tee' | 'hoodie';
export type ChibiSlot =
  | 'torso' | 'hips' | 'head' | 'hair' | 'face' | 'bag'
  | 'legL' | 'legR' | 'shoeL' | 'shoeR' | 'armL' | 'armR' | 'handL' | 'handR';

const cache = new Map<string, THREE.BufferGeometry>();
const once = (key: string, make: () => THREE.BufferGeometry) => {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
};

/** Normalises a part to the shared attribute set (non-indexed, no uv, colour). */
function finish(g: THREE.BufferGeometry, tint?: (x: number, y: number, z: number) => number | null): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute('uv');
  if (!out.attributes.normal) out.computeVertexNormals();
  const pos = out.attributes.position as THREE.BufferAttribute;
  if (!out.attributes.color) {
    out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  }
  if (tint) {
    const col = out.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const hex = tint(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (hex === null) continue;
      c.setHex(hex);
      col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
    }
  }
  out.userData.shared = true;
  return out;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

const gauss = (d2: number, w: number) => Math.exp(-d2 / (w * w));

/**
 * Head shell radius along a unit direction: a slightly wide skull with soft
 * cheeks and a small chin. Hair and face decals sample the same function so
 * they sit exactly on the skin.
 */
function headRadius(d: THREE.Vector3): number {
  const R = CHIBI.HEAD_R;
  let r = R * (1 + 0.04 * (1 - Math.abs(d.y)));
  for (const s of [-1, 1]) r += R * 0.07 * gauss((d.x - s * 0.5) ** 2 + (d.y + 0.35) ** 2 + (d.z - 0.75) ** 2, 0.3);
  r += R * 0.05 * gauss(d.x ** 2 + (d.y + 0.72) ** 2 + (d.z - 0.62) ** 2, 0.28);
  r -= R * 0.1 * gauss(d.x ** 2 + (d.y + 0.95) ** 2 + (d.z + 0.1) ** 2, 0.35);
  for (const s of [-1, 1]) r += R * 0.09 * gauss((d.x - s) ** 2 + (d.y + 0.05) ** 2 + d.z ** 2, 0.16);
  return r;
}

const onHead = (dir: THREE.Vector3, lift = 0): THREE.Vector3 => {
  const d = dir.clone().normalize();
  return d.multiplyScalar(headRadius(d) + lift);
};

export function headGeometry(): THREE.BufferGeometry {
  return once('head', () => {
    const g = new THREE.SphereGeometry(1, 24, 16);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      pos.setXYZ(i, d.x * headRadius(d), d.y * headRadius(d), d.z * headRadius(d));
    }
    g.computeVertexNormals();
    // Under-chin shade so the head separates from the collar.
    return finish(g, (_x, y, z) => (y < -0.14 && z < 0.12 ? 0xd8c8c0 : null));
  });
}

/** Eyes with catchlights, brows, smile and blush in one vertex-coloured shell. */
export function faceGeometry(): THREE.BufferGeometry {
  return once('face', () => {
    const parts: THREE.BufferGeometry[] = [];
    const place = (geo: THREE.BufferGeometry, dir: THREE.Vector3, lift: number, hex: number, roll = 0) => {
      const p = onHead(dir, lift);
      const n = p.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      geo.rotateZ(roll);
      geo.applyQuaternion(q);
      geo.translate(p.x, p.y, p.z);
      parts.push(finish(geo, () => hex));
    };
    for (const s of [-1, 1]) {
      const eye = new THREE.SphereGeometry(1, 8, 6);
      eye.scale(0.034, 0.048, 0.012);
      place(eye, new THREE.Vector3(s * 0.34, -0.08, 0.94), 0.002, 0x1d1618);
      const glint = new THREE.SphereGeometry(1, 6, 4);
      glint.scale(0.012, 0.014, 0.006);
      place(glint, new THREE.Vector3(s * 0.34 - 0.04, -0.02, 0.94), 0.012, 0xffffff);
      const brow = new THREE.CapsuleGeometry(0.007, 0.042, 2, 6);
      brow.rotateZ(Math.PI / 2);
      place(brow, new THREE.Vector3(s * 0.34, 0.17, 0.92), 0.004, 0x3a2a24, -s * 0.12);
      const blush = new THREE.SphereGeometry(1, 6, 4);
      blush.scale(0.042, 0.022, 0.006);
      place(blush, new THREE.Vector3(s * 0.52, -0.3, 0.8), 0.001, 0xf29a94);
    }
    const smile = new THREE.TorusGeometry(0.03, 0.0065, 4, 10, Math.PI * 0.75);
    smile.rotateZ(Math.PI + Math.PI * 0.125);
    place(smile, new THREE.Vector3(0, -0.38, 0.92), 0.004, 0x7a3434);
    return merge(parts);
  });
}

/**
 * Hair is a shell around the skull whose vertices below the hairline sink
 * inside the head, so every style is one closed mesh with a shaped edge.
 */
export function hairGeometry(style: HairStyle): THREE.BufferGeometry {
  return once(`hair.${style}`, () => {
    const hairline: Record<HairStyle, { front: number; side: number; back: number; lift: number; locks: number }> = {
      short: { front: 0.42, side: 0.05, back: -0.35, lift: 0.028, locks: 0.012 },
      bun: { front: 0.5, side: 0.12, back: -0.2, lift: 0.022, locks: 0.006 },
      bob: { front: 0.3, side: -0.55, back: -0.6, lift: 0.034, locks: 0.01 },
      pony: { front: 0.46, side: 0.08, back: -0.25, lift: 0.024, locks: 0.006 },
      spiky: { front: 0.4, side: 0.1, back: -0.3, lift: 0.03, locks: 0.05 },
      hood: { front: -2, side: -0.9, back: -0.95, lift: 0.05, locks: 0 },
    };
    const h = hairline[style];
    const g = new THREE.SphereGeometry(1, 24, 16);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const az = Math.atan2(d.x, d.z);
      const front = Math.max(0, Math.cos(az));
      const back = Math.max(0, -Math.cos(az));
      const side = 1 - front - back;
      // Fringe: a gentle scallop so the edge reads as locks, not a helmet.
      const fringe = style === 'hood' ? 0 : Math.sin(az * 9) * 0.035 * front;
      let line = h.front * front + h.side * side + h.back * back + fringe;
      if (style === 'hood') {
        // Face opening: an oval hole in the front of the hood.
        const inOpening = d.z > 0.35 && (d.x / 0.72) ** 2 + ((d.y + 0.05) / 0.78) ** 2 < 1;
        line = inOpening ? 2 : -0.95;
      }
      const lock = h.locks * (Math.sin(az * 7 + d.y * 5) * 0.5 + 0.5) * Math.max(0, d.y + 0.2);
      const spike = style === 'spiky' ? 0.06 * Math.max(0, Math.sin(az * 5) * Math.sin(d.y * 9)) * Math.max(0, d.y) : 0;
      const r = d.y >= line ? headRadius(d) + h.lift + lock + spike : headRadius(d) * 0.92;
      pos.setXYZ(i, d.x * r, d.y * r, d.z * r);
    }
    g.computeVertexNormals();
    const parts = [finish(g, style === 'hood' ? () => 0x2e3f8a : undefined)];
    if (style === 'bun') {
      const bun = new THREE.SphereGeometry(0.1, 10, 8);
      bun.translate(0, 0.25, -0.14);
      parts.push(finish(bun));
    } else if (style === 'pony') {
      const tie = new THREE.SphereGeometry(0.05, 6, 5);
      tie.translate(0, 0.08, -0.27);
      const tail = metaSurface(
        [
          { x: 0, y: 0.04, z: -0.3, r: 0.07 },
          { x: 0, y: -0.08, z: -0.33, r: 0.075, sy: 1.3 },
          { x: 0, y: -0.2, z: -0.31, r: 0.05 },
        ],
        { resolution: 12, padding: 0.03 },
      );
      parts.push(finish(tie), finish(tail));
    } else if (style === 'hood') {
      const rim = new THREE.TorusGeometry(0.215, 0.036, 8, 28);
      rim.scale(1, 1.08, 1);
      rim.translate(0, -0.015, 0.205);
      parts.push(finish(rim, () => 0x6a4ab8));
    }
    return parts.length > 1 ? merge(parts) : parts[0];
  });
}

export function torsoGeometry(top: TopStyle): THREE.BufferGeometry {
  return once(`torso.${top}`, () => {
    const H = CHIBI.SHOULDER - CHIBI.HIP;
    const hoodie = top === 'hoodie';
    const g = new THREE.SphereGeometry(1, 18, 12);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i);
      // Superellipse cross-section: a soft barrel, boxier than an egg.
      const k = Math.pow(Math.abs(d.x) ** 2.6 + Math.abs(d.z) ** 2.6, 1 / 2.6) || 1;
      const flat = Math.hypot(d.x, d.z) / k;
      let x = d.x * flat * 0.18;
      let z = d.z * flat * 0.135;
      const y = H * (0.48 + 0.58 * d.y);
      // Slight pear shape: wider belly, narrower shoulders.
      const w = 1 + 0.06 * (1 - d.y) * (d.y > 0 ? 1 : 0.4);
      x *= w;
      z *= w;
      let bump = 0;
      if (hoodie) {
        bump += 0.035 * gauss(d.x ** 2 + (d.y - 0.75) ** 2 + (d.z + 1) ** 2, 0.45);
        bump += 0.018 * gauss(d.x ** 2 * 0.5 + (d.y + 0.35) ** 2 + (d.z - 1) ** 2, 0.3);
      }
      const n = Math.hypot(x, z) || 1;
      pos.setXYZ(i, x + (x / n) * bump, y, z + (z / n) * bump);
    }
    g.computeVertexNormals();
    bakeCavityAO(g, new THREE.Vector3(0, H * 0.45, 0), 0.3);
    // Collar shade and a slightly darker hem band.
    return finish(g, (_x, y) => (y > H * 0.97 ? 0xd0d0d0 : y < H * 0.0 ? 0xc8c8c8 : null));
  });
}

export function hipsGeometry(): THREE.BufferGeometry {
  return once('hips', () => {
    const g = new THREE.SphereGeometry(1, 12, 8);
    g.scale(0.165, 0.11, 0.125);
    g.translate(0, -0.01, 0);
    return finish(g);
  });
}

/** Limb capsule hanging from its joint, tapered toward the end. */
function limb(radius: number, length: number, taper: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 3, 8);
  g.translate(0, -length / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, -pos.getY(i) / length));
    const s = 1 - (1 - taper) * t;
    pos.setX(i, pos.getX(i) * s);
    pos.setZ(i, pos.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

export function legGeometry(): THREE.BufferGeometry {
  return once('leg', () => finish(limb(0.068, CHIBI.LEG, 0.8)));
}

export function armGeometry(): THREE.BufferGeometry {
  return once('arm', () => finish(limb(0.056, CHIBI.ARM - 0.03, 0.82)));
}

export function handGeometry(): THREE.BufferGeometry {
  return once('hand', () => {
    const g = new THREE.SphereGeometry(0.058, 8, 6);
    g.scale(0.92, 1, 0.86);
    return finish(g);
  });
}

/** Rounded sneaker with a pale sole band; the instance colour tints the upper. */
export function shoeGeometry(): THREE.BufferGeometry {
  return once('shoe', () => {
    const g = new THREE.SphereGeometry(1, 10, 7);
    g.scale(0.068, 0.06, 0.11);
    g.translate(0, 0.04, 0.03);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0) pos.setY(i, 0);
      // Toe box: a little lower and rounder than the heel.
      if (pos.getZ(i) > 0.06) pos.setY(i, pos.getY(i) * 0.85);
    }
    g.computeVertexNormals();
    return finish(g, (_x, y) => (y < 0.022 ? 0xffffff : 0x9a9a9a));
  });
}

export function bagGeometry(): THREE.BufferGeometry {
  return once('bag', () => {
    const g = metaSurface(
      [
        { x: 0, y: 0, z: 0, r: 0.13, sx: 1.0, sy: 1.1, sz: 0.55 },
        { x: 0, y: -0.06, z: 0.03, r: 0.08, sx: 1.3, sy: 0.6, sz: 0.5 },
      ],
      { resolution: 11, padding: 0.03 },
    );
    bakeCavityAO(g, new THREE.Vector3(0, 0, 0.05), 0.3);
    return finish(g);
  });
}

/* ------------------------------------------------------------------ */
/* Walk pose                                                           */
/* ------------------------------------------------------------------ */

export interface ChibiPose {
  bob: number;
  leg: number;
  arm: number;
  tilt: number;
}

/** Walk cycle for a phase in radians; `amount` 0 = standing, 1 = full stride. */
export function chibiPose(phase: number, amount: number, out: ChibiPose = { bob: 0, leg: 0, arm: 0, tilt: 0 }): ChibiPose {
  out.leg = Math.sin(phase) * 0.55 * amount;
  out.arm = Math.sin(phase) * 0.6 * amount;
  out.bob = Math.abs(Math.cos(phase)) * 0.03 * amount;
  out.tilt = Math.sin(phase) * 0.05 * amount;
  return out;
}

const _t = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

function compose(out: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'XYZ');
  return out.compose(_v.set(x, y, z), _q.setFromEuler(_e), _one);
}

/** Local transform of one part for a pose, in the character's feet space (+Z forward). */
export function chibiPartMatrix(slot: ChibiSlot, p: ChibiPose, out: THREE.Matrix4): THREE.Matrix4 {
  const { HIP, LEG, SHOULDER, ARM, HEAD_Y, HIP_X, SHOULDER_X } = CHIBI;
  const y0 = p.bob;
  switch (slot) {
    case 'torso':
    case 'hips':
      return compose(out, 0, HIP + y0, 0, 0, 0, p.tilt * 0.3);
    case 'head':
    case 'hair':
    case 'face':
      return compose(out, 0, HEAD_Y + y0, 0, 0, p.tilt * 0.6, p.tilt);
    case 'bag':
      return compose(out, 0, HIP + y0 + 0.2, -0.17);
    case 'legL':
    case 'legR': {
      const s = slot === 'legL' ? 1 : -1;
      return compose(out, s * HIP_X, HIP + y0, 0, -p.leg * s);
    }
    case 'shoeL':
    case 'shoeR': {
      const s = slot === 'shoeL' ? 1 : -1;
      const a = -p.leg * s;
      const fy = HIP + y0 - LEG * Math.cos(a);
      const fz = -LEG * Math.sin(a);
      return compose(out, s * HIP_X, Math.max(0, fy - (HIP - LEG)), fz);
    }
    case 'armL':
    case 'armR': {
      const s = slot === 'armL' ? 1 : -1;
      return compose(out, s * SHOULDER_X, SHOULDER + y0, 0, p.arm * s, 0, s * 0.16);
    }
    case 'handL':
    case 'handR': {
      const s = slot === 'handL' ? 1 : -1;
      compose(out, s * SHOULDER_X, SHOULDER + y0, 0, p.arm * s, 0, s * 0.16);
      return out.multiply(_t.makeTranslation(0, -ARM, 0));
    }
  }
}
