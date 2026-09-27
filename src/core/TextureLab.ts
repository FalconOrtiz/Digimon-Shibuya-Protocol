import * as THREE from 'three';
import { Simplex, tileableFbm, worley, clamp, smoothstep, lerp, withBakeResolution } from './Noise';

/**
 * Procedural texture bakery.
 *
 * The game ships no binary art assets — every albedo/normal/roughness map is
 * baked here into an OffscreenCanvas at load time. Working this way keeps the
 * whole world consistent (one noise basis, one palette) and lets materials be
 * authored as data rather than files.
 *
 * All maps are tileable. Normal maps are derived from a height field via Sobel
 * so albedo and normal always agree.
 */

export interface HeightFieldOptions {
  size: number;
  /** Returns height in [0,1] for tileable uv coordinates. */
  height: (u: number, v: number) => number;
}

const canvasCache = new Map<string, THREE.Texture>();

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
}

function finalize(
  canvas: HTMLCanvasElement,
  srgb: boolean,
  repeat: number,
  anisotropy: number,
): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Bakes a tileable normal map from a height callback using a Sobel operator
 * with wrap-around sampling.
 */
export function bakeNormalMap(opts: HeightFieldOptions, strength = 1.6): THREE.Texture {
  const { size, height } = opts;
  const heights = new Float32Array(size * size);
  withBakeResolution(size, () => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        heights[y * size + x] = height(x / size, y / size);
      }
    }
  });

  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const at = (x: number, y: number) => heights[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);

      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const nzn = nz / len;

      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nzn * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalize(canvas, false, 1, 8);
}

export interface ColorFieldOptions {
  size: number;
  /** Returns linear-ish sRGB triplet 0..1 for tileable uv. */
  color: (u: number, v: number) => [number, number, number];
  srgb?: boolean;
}

/** Bakes an arbitrary per-texel color field into a tileable texture. */
export function bakeColorMap(opts: ColorFieldOptions): THREE.Texture {
  const { size, color, srgb = true } = opts;
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const data = img.data;
  withBakeResolution(size, () => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [r, g, b] = color(x / size, y / size);
        const i = (y * size + x) * 4;
        data[i] = clamp(r, 0, 1) * 255;
        data[i + 1] = clamp(g, 0, 1) * 255;
        data[i + 2] = clamp(b, 0, 1) * 255;
        data[i + 3] = 255;
      }
    }
  });
  ctx.putImageData(img, 0, 0);
  return finalize(canvas, srgb, 1, 8);
}

/** Bakes a single-channel map (roughness / metalness / AO) as greyscale. */
export function bakeScalarMap(size: number, fn: (u: number, v: number) => number): THREE.Texture {
  return bakeColorMap({
    size,
    srgb: false,
    color: (u, v) => {
      const s = fn(u, v);
      return [s, s, s];
    },
  });
}

/** Memoised bake — identical keys reuse the same GPU texture. */
export function cached(key: string, build: () => THREE.Texture): THREE.Texture {
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const tex = build();
  canvasCache.set(key, tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* Shared noise bases                                                  */
/* ------------------------------------------------------------------ */

export const NOISE = {
  grass: new Simplex(9001),
  bark: new Simplex(4242),
  soil: new Simplex(777),
  fabric: new Simplex(31337),
  stone: new Simplex(60613),
  paint: new Simplex(112358),
  water: new Simplex(24680),
  cloud: new Simplex(13579),
};

/* ------------------------------------------------------------------ */
/* Colour helpers                                                      */
/* ------------------------------------------------------------------ */

/** Mixes two hex colours in linear space and returns an rgb triplet 0..1. */
export function mixHex(a: number, b: number, t: number): [number, number, number] {
  const ar = ((a >> 16) & 255) / 255;
  const ag = ((a >> 8) & 255) / 255;
  const ab = (a & 255) / 255;
  const br = ((b >> 16) & 255) / 255;
  const bg = ((b >> 8) & 255) / 255;
  const bb = (b & 255) / 255;
  return [lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t)];
}

export function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** HSV -> RGB, all channels 0..1. Handy for hue-jittering foliage. */
export function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

/* ------------------------------------------------------------------ */
/* Common material texture sets                                        */
/* ------------------------------------------------------------------ */

export interface MaterialMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap?: THREE.Texture;
  /** Urban presets pack roughness (G) and metalness (B) into one texture. */
  metalnessMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
}

/**
 * Short, dense, hand-painted-looking lawn grass.
 *
 * The blade detail is deliberately *anisotropic*. Isotropic fbm at blade
 * frequency reads as woven fabric — the eye finds the lattice immediately —
 * whereas real turf is a field of short strokes that all lean the same way
 * within a clump and change direction between clumps. `bladeField` builds that
 * by rotating the sample coordinates by a low-frequency angle field and then
 * stretching them, so each clump gets its own combed direction.
 */
/**
 * The comb-direction field, precomputed.
 *
 * It is only frequency 3, so evaluating fbm for it at every one of a million
 * texels is pure waste — and it doubled the terrain bake when done that way.
 * A 64x64 table with wrapped bilinear interpolation is indistinguishable at
 * this frequency and reduces the cost to a few multiplies per texel.
 */
const COMB_RES = 128;
/** Direction changes per unit — high enough that clumps stay small. */
const COMB_FREQ = 14;
let combTable: Float32Array | null = null;

function combAngle(u: number, v: number): number {
  if (!combTable) {
    combTable = new Float32Array(COMB_RES * COMB_RES);
    for (let y = 0; y < COMB_RES; y++) {
      for (let x = 0; x < COMB_RES; x++) {
        combTable[y * COMB_RES + x] =
          tileableFbm(NOISE.grass, x / COMB_RES, y / COMB_RES, COMB_FREQ, 2) * Math.PI;
      }
    }
  }
  const fx = u * COMB_RES;
  const fy = v * COMB_RES;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = ((x0 % COMB_RES) + COMB_RES) % COMB_RES;
  const ya = ((y0 % COMB_RES) + COMB_RES) % COMB_RES;
  const xb = (xa + 1) % COMB_RES;
  const yb = (ya + 1) % COMB_RES;
  const t = combTable;
  return lerp(
    lerp(t[ya * COMB_RES + xa], t[ya * COMB_RES + xb], tx),
    lerp(t[yb * COMB_RES + xa], t[yb * COMB_RES + xb], tx),
    ty,
  );
}

function bladeField(u: number, v: number, freq: number, octaves: number): number {
  const angle = combAngle(u, v);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Rotate into the clump's frame, then squash across the blade direction so
  // features become strokes rather than blobs. The squash is deliberately mild:
  // pushed harder (0.16 was tried) the strokes fuse into wood-grain whorls,
  // which is a worse artefact than the isotropic weave it replaced.
  const ru = u * cos - v * sin;
  const rv = (u * sin + v * cos) * 0.45;
  const streak = tileableFbm(NOISE.grass, ru + 5, rv, freq, octaves);
  // A little isotropic noise breaks up any residual directional banding.
  const speck = tileableFbm(NOISE.grass, u * 1.7 + 11, v * 1.7, freq * 1.6, 1);
  return streak * 0.72 + speck * 0.28;
}

export function grassTurfMaps(size = 1024): MaterialMaps {
  return {
    map: cached('turf.albedo', () =>
      bakeColorMap({
        size,
        color: (u, v) => {
          const n = tileableFbm(NOISE.grass, u, v, 26, 5);
          const blades = bladeField(u, v, 96, 2);
          const clump = tileableFbm(NOISE.grass, u, v, 6, 3);
          // Base green with warm/cool clumping and per-blade value break-up.
          const t = clamp(0.5 + n * 0.55 + blades * 0.26, 0, 1);
          const warm = clamp(0.5 + clump * 0.9, 0, 1);
          const a = mixHex(0x4f8f36, 0x7cc24a, t);
          const b = mixHex(0x3f7d3a, 0x93cf58, t);
          const c: [number, number, number] = [
            lerp(a[0], b[0], warm),
            lerp(a[1], b[1], warm),
            lerp(a[2], b[2], warm),
          ];
          // Sparse yellowed blades keep it from reading flat.
          const dry = smoothstep(0.72, 0.95, blades * 0.5 + 0.5);
          return [
            lerp(c[0], 0.78, dry * 0.5),
            lerp(c[1], 0.76, dry * 0.4),
            lerp(c[2], 0.36, dry * 0.5),
          ];
        },
      }),
    ),
    normalMap: cached('turf.normal', () =>
      bakeNormalMap(
        {
          size,
          height: (u, v) => {
            const blades = bladeField(u, v, 96, 2);
            const clump = tileableFbm(NOISE.grass, u, v, 14, 4);
            return 0.5 + blades * 0.35 + clump * 0.15;
          },
        },
        2.2,
      ),
    ),
    roughnessMap: cached('turf.rough', () =>
      bakeScalarMap(512, (u, v) => 0.78 + tileableFbm(NOISE.grass, u, v, 40, 3) * 0.12),
    ),
  };
}

/** Warm compacted dirt path with embedded pebbles. */
export function dirtPathMaps(size = 1024): MaterialMaps {
  const pebble = (u: number, v: number) => {
    const w = worley(u, v, 22, 3);
    return smoothstep(0.34, 0.02, w.f1);
  };
  return {
    map: cached('dirt.albedo', () =>
      bakeColorMap({
        size,
        color: (u, v) => {
          const n = tileableFbm(NOISE.soil, u, v, 18, 5);
          const fine = tileableFbm(NOISE.soil, u * 2 + 3, v * 2, 90, 3);
          const t = clamp(0.5 + n * 0.6 + fine * 0.25, 0, 1);
          const base = mixHex(0x9a6f45, 0xc9a173, t);
          const p = pebble(u, v);
          const stone = mixHex(0xa89c8c, 0xd6cec2, clamp(0.5 + fine, 0, 1));
          return [
            lerp(base[0], stone[0], p * 0.85),
            lerp(base[1], stone[1], p * 0.85),
            lerp(base[2], stone[2], p * 0.85),
          ];
        },
      }),
    ),
    normalMap: cached('dirt.normal', () =>
      bakeNormalMap(
        {
          size,
          height: (u, v) => {
            const n = tileableFbm(NOISE.soil, u, v, 18, 5) * 0.5 + 0.5;
            return clamp(n * 0.7 + pebble(u, v) * 0.5, 0, 1);
          },
        },
        1.9,
      ),
    ),
    roughnessMap: cached('dirt.rough', () =>
      bakeScalarMap(512, (u, v) => clamp(0.88 - pebble(u, v) * 0.22, 0, 1)),
    ),
  };
}

/** Painted timber cladding — shopfront panelling. */
export function paintedWoodMaps(
  key: string,
  tint: number,
  planks = 9,
  size = 1024,
): MaterialMaps {
  const seam = (v: number) => {
    const p = v * planks;
    const f = Math.abs(p - Math.floor(p) - 0.5) * 2;
    return smoothstep(0.86, 1.0, f);
  };
  return {
    map: cached(`wood.${key}.albedo`, () =>
      bakeColorMap({
        size,
        color: (u, v) => {
          const grain = tileableFbm(NOISE.bark, u * 0.4, v * 8, 40, 4);
          const wear = tileableFbm(NOISE.paint, u, v, 7, 4);
          const t = clamp(0.5 + grain * 0.18 + wear * 0.3, 0, 1);
          const c = mixHex(tint, 0xffffff, t * 0.22);
          const s = seam(v);
          return [c[0] * (1 - s * 0.42), c[1] * (1 - s * 0.42), c[2] * (1 - s * 0.42)];
        },
      }),
    ),
    normalMap: cached(`wood.${key}.normal`, () =>
      bakeNormalMap(
        {
          size,
          height: (u, v) => {
            const grain = tileableFbm(NOISE.bark, u * 0.4, v * 8, 40, 4) * 0.5 + 0.5;
            return clamp(0.6 + grain * 0.25 - seam(v) * 0.75, 0, 1);
          },
        },
        1.5,
      ),
    ),
    roughnessMap: cached(`wood.${key}.rough`, () =>
      bakeScalarMap(512, (u, v) => {
        const wear = tileableFbm(NOISE.paint, u, v, 12, 3) * 0.5 + 0.5;
        return clamp(0.52 + wear * 0.24 + seam(v) * 0.18, 0, 1);
      }),
    ),
  };
}

/** Clay roof tiles. */
export function roofTileMaps(key: string, tint: number, rows = 14, size = 1024): MaterialMaps {
  const tile = (u: number, v: number) => {
    const row = v * rows;
    const ri = Math.floor(row);
    const rf = row - ri;
    const offset = ri % 2 === 0 ? 0 : 0.5;
    const col = (u * rows + offset) % 1;
    const arch = Math.sin(rf * Math.PI);
    const side = smoothstep(0.0, 0.08, col) * smoothstep(1.0, 0.92, col);
    return { arch, side, ri, ci: Math.floor(u * rows + offset) };
  };
  return {
    map: cached(`roof.${key}.albedo`, () =>
      bakeColorMap({
        size,
        color: (u, v) => {
          const { arch, side, ri, ci } = tile(u, v);
          const jitter = ((Math.sin(ri * 12.9898 + ci * 78.233) * 43758.5453) % 1 + 1) % 1;
          const grime = tileableFbm(NOISE.stone, u, v, 20, 4) * 0.5 + 0.5;
          const c = mixHex(tint, 0x2a1c17, (1 - arch) * 0.45 + (1 - side) * 0.3);
          const j = 0.88 + jitter * 0.24;
          return [c[0] * j * (0.86 + grime * 0.2), c[1] * j * (0.86 + grime * 0.2), c[2] * j * (0.86 + grime * 0.2)];
        },
      }),
    ),
    normalMap: cached(`roof.${key}.normal`, () =>
      bakeNormalMap(
        {
          size,
          height: (u, v) => {
            const { arch, side } = tile(u, v);
            return clamp(arch * 0.75 * side + 0.15, 0, 1);
          },
        },
        2.6,
      ),
    ),
    roughnessMap: cached(`roof.${key}.rough`, () =>
      bakeScalarMap(512, (u, v) => 0.66 + (tileableFbm(NOISE.stone, u, v, 30, 3) * 0.5 + 0.5) * 0.2),
    ),
  };
}

/** Cobble / flagstone for the lab forecourt. */
export function cobbleMaps(size = 1024): MaterialMaps {
  const stone = (u: number, v: number) => {
    const w = worley(u, v, 9, 11);
    const edge = smoothstep(0.0, 0.09, w.f2 - w.f1);
    const jitter = ((w.id % 1000) / 1000) * 0.3;
    return { edge, jitter };
  };
  return {
    map: cached('cobble.albedo', () =>
      bakeColorMap({
        size,
        color: (u, v) => {
          const { edge, jitter } = stone(u, v);
          const n = tileableFbm(NOISE.stone, u, v, 44, 4) * 0.5 + 0.5;
          const c = mixHex(0x9d9a92, 0xcfccc3, clamp(n * 0.7 + jitter, 0, 1));
          const mortar = mixHex(0x6b6862, 0x827e77, n);
          return [
            lerp(mortar[0], c[0], edge),
            lerp(mortar[1], c[1], edge),
            lerp(mortar[2], c[2], edge),
          ];
        },
      }),
    ),
    normalMap: cached('cobble.normal', () =>
      bakeNormalMap(
        {
          size,
          height: (u, v) => {
            const { edge } = stone(u, v);
            const n = tileableFbm(NOISE.stone, u, v, 60, 3) * 0.5 + 0.5;
            return clamp(edge * 0.85 + n * 0.15, 0, 1);
          },
        },
        2.4,
      ),
    ),
    roughnessMap: cached('cobble.rough', () =>
      bakeScalarMap(512, (u, v) => {
        const { edge } = stone(u, v);
        return clamp(0.62 + (1 - edge) * 0.28, 0, 1);
      }),
    ),
  };
}

/** Tree bark. */
export function barkMaps(size = 1024): MaterialMaps {
  const h = (u: number, v: number) => {
    const stretch = tileableFbm(NOISE.bark, u * 3.2, v * 0.42, 16, 5);
    const fissure = Math.abs(tileableFbm(NOISE.bark, u * 3.0 + 9, v * 0.4, 8, 4));
    return clamp(0.55 + stretch * 0.3 - fissure * 0.55, 0, 1);
  };
  return {
    map: cached('bark.albedo', () =>
      bakeColorMap({
        size,
        color: (u, v) => {
          const t = h(u, v);
          const moss = smoothstep(0.35, 0.0, t) * smoothstep(0.4, 0.9, tileableFbm(NOISE.grass, u, v, 8, 3) * 0.5 + 0.5);
          const c = mixHex(0x4e392a, 0x9c7d5f, t);
          const m = hexToRgb(0x5f7a3c);
          return [lerp(c[0], m[0], moss * 0.5), lerp(c[1], m[1], moss * 0.5), lerp(c[2], m[2], moss * 0.5)];
        },
      }),
    ),
    normalMap: cached('bark.normal', () => bakeNormalMap({ size, height: h }, 2.8)),
    roughnessMap: cached('bark.rough', () => bakeScalarMap(512, (u, v) => clamp(0.94 - h(u, v) * 0.12, 0, 1))),
  };
}

/** Applies the standard tiling + anisotropy settings to a whole map set. */
export function tile(maps: MaterialMaps, repeat: number, anisotropy = 16): MaterialMaps {
  const out: MaterialMaps = {
    map: maps.map.clone(),
    normalMap: maps.normalMap.clone(),
    roughnessMap: maps.roughnessMap.clone(),
  };
  if (maps.aoMap) out.aoMap = maps.aoMap.clone();
  if (maps.metalnessMap) out.metalnessMap = maps.metalnessMap === maps.roughnessMap ? out.roughnessMap : maps.metalnessMap.clone();
  if (maps.emissiveMap) out.emissiveMap = maps.emissiveMap.clone();
  for (const key of Object.keys(out) as (keyof MaterialMaps)[]) {
    const t = out[key];
    if (!t) continue;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Single-pass surface bake (urban presets)                            */
/* ------------------------------------------------------------------ */

/** One texel of a surface: albedo (sRGB 0..1), height, roughness, metalness, emissive. */
export interface SurfaceTexel {
  r: number;
  g: number;
  b: number;
  h: number;
  rough: number;
  metal: number;
  er: number;
  eg: number;
  eb: number;
}

export interface SurfaceOptions {
  size: number;
  normalStrength: number;
  emissive?: boolean;
}

const surfaceCache = new Map<string, MaterialMaps>();

/**
 * Bakes albedo, normal, roughness+metalness and optionally emissive from ONE
 * evaluation of the surface function per texel.
 *
 * The rural presets above call their noise once per map, which is fine at a
 * handful of materials. The city needs a dozen, and evaluating fbm three times
 * per texel for each would triple the load time for identical results. Here the
 * height lands in a float buffer and the normal is Sobel-derived from it, so
 * albedo, relief and roughness can never disagree.
 *
 * `v` runs top-to-bottom of the bitmap (canvas rows): on a flipY texture v = 0
 * is the TOP of the tile.
 */
export function bakeSurface(key: string, opts: SurfaceOptions, fn: (u: number, v: number, o: SurfaceTexel) => void): MaterialMaps {
  const fullKey = `${key}@${opts.size}`;
  const hit = surfaceCache.get(fullKey);
  if (hit) return hit;

  const { size } = opts;
  const heights = new Float32Array(size * size);
  const alb = makeCanvas(size);
  const orm = makeCanvas(size);
  const emi = opts.emissive ? makeCanvas(size) : null;
  const albImg = alb.ctx.createImageData(size, size);
  const ormImg = orm.ctx.createImageData(size, size);
  const emiImg = emi ? emi.ctx.createImageData(size, size) : null;
  const o: SurfaceTexel = { r: 0, g: 0, b: 0, h: 0, rough: 0, metal: 0, er: 0, eg: 0, eb: 0 };

  withBakeResolution(size, () => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        o.r = o.g = o.b = 0.5;
        o.h = 0.5;
        o.rough = 0.8;
        o.metal = 0;
        o.er = o.eg = o.eb = 0;
        fn(x / size, y / size, o);
        const idx = y * size + x;
        const i = idx * 4;
        heights[idx] = o.h;
        albImg.data[i] = clamp(o.r, 0, 1) * 255;
        albImg.data[i + 1] = clamp(o.g, 0, 1) * 255;
        albImg.data[i + 2] = clamp(o.b, 0, 1) * 255;
        albImg.data[i + 3] = 255;
        ormImg.data[i] = 255;
        ormImg.data[i + 1] = clamp(o.rough, 0.02, 1) * 255;
        ormImg.data[i + 2] = clamp(o.metal, 0, 1) * 255;
        ormImg.data[i + 3] = 255;
        if (emiImg) {
          emiImg.data[i] = clamp(o.er, 0, 1) * 255;
          emiImg.data[i + 1] = clamp(o.eg, 0, 1) * 255;
          emiImg.data[i + 2] = clamp(o.eb, 0, 1) * 255;
          emiImg.data[i + 3] = 255;
        }
      }
    }
  });

  alb.ctx.putImageData(albImg, 0, 0);
  orm.ctx.putImageData(ormImg, 0, 0);
  const ormTex = finalize(orm.canvas, false, 1, 8);
  const maps: MaterialMaps = {
    map: finalize(alb.canvas, true, 1, 8),
    normalMap: bakeNormalMap(
      { size, height: (u, v) => heights[Math.round(v * size) % size * size + (Math.round(u * size) % size)] },
      opts.normalStrength,
    ),
    roughnessMap: ormTex,
    metalnessMap: ormTex,
  };
  if (emi && emiImg) {
    emi.ctx.putImageData(emiImg, 0, 0);
    maps.emissiveMap = finalize(emi.canvas, true, 1, 8);
  }
  surfaceCache.set(fullKey, maps);
  return maps;
}

/** Stable 0..1 hash for grid cells (windows, pavers, panels). */
export function cellHash(i: number, j: number, seed = 0): number {
  let h = (i * 374761393 + j * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function setRgb(o: SurfaceTexel, c: [number, number, number], k = 1): void {
  o.r = c[0] * k;
  o.g = c[1] * k;
  o.b = c[2] * k;
}

function mixInto(o: SurfaceTexel, c: [number, number, number], t: number): void {
  o.r = lerp(o.r, c[0], t);
  o.g = lerp(o.g, c[1], t);
  o.b = lerp(o.b, c[2], t);
}

/** Distance to the nearest grid line, 0 on the line, 0.5 mid-cell. */
function gridDist(x: number): number {
  const f = x - Math.floor(x);
  return Math.min(f, 1 - f);
}

/* ------------------------------------------------------------------ */
/* Urban presets                                                       */
/* ------------------------------------------------------------------ */

/**
 * Wet city asphalt. One tile = 8 m.
 *
 * Aggregate speckle + worley cracks + a low-frequency puddle mask. Puddles are
 * flat in the height field and drop to near-mirror roughness, so the PMREM sky
 * and every neon sign reflect in them — that reflection is most of what makes
 * the night shot read as Shibuya instead of a car park.
 */
export function wetAsphaltMaps(size = 512): MaterialMaps {
  const dry = hexToRgb(0x4a5560);
  const wet = hexToRgb(0x2c353f);
  const stone = hexToRgb(0x8a929a);
  const tar = hexToRgb(0x1c2228);
  return bakeSurface('asphalt.wet', { size, normalStrength: 2.2 }, (u, v, o) => {
    const patch = tileableFbm(NOISE.stone, u, v, 3, 3);
    const tone = tileableFbm(NOISE.stone, u + 7, v, 9, 2);
    const grain = tileableFbm(NOISE.stone, u, v, 90, 2);
    const w = worley(u, v, 110, 5);
    const pebble = smoothstep(0.42, 0.12, w.f1) * 0.8;
    const crackCell = worley(u, v, 3, 17);
    const crackMask = smoothstep(0.32, 0.52, tileableFbm(NOISE.paint, u, v, 4, 2));
    const crack = smoothstep(0.018, 0.0, crackCell.f2 - crackCell.f1) * crackMask;
    const puddle = smoothstep(0.2, 0.34, patch + tone * 0.18);
    const damp = smoothstep(-0.15, 0.2, patch);

    const t = clamp(0.5 + tone * 0.5 + grain * 0.3, 0, 1);
    setRgb(o, dry, 0.9 + t * 0.2);
    mixInto(o, wet, damp * 0.75);
    mixInto(o, stone, pebble * (1 - puddle) * 0.35);
    mixInto(o, tar, crack * 0.6);
    mixInto(o, wet, puddle * 0.5);

    o.h = puddle > 0.5 ? 0.42 : 0.5 + grain * 0.12 + pebble * 0.18 - crack * 0.35;
    o.rough = lerp(lerp(0.66 + grain * 0.08, 0.34, damp * 0.8), 0.05, puddle);
  });
}

/** Worn zebra paint. u runs along the stripe, v across its width (one stripe per tile). */
export function zebraPaintMaps(size = 256): MaterialMaps {
  const paint = hexToRgb(0xe8e4dc);
  const asphalt = hexToRgb(0x3a4450);
  const dirt = hexToRgb(0x8a847a);
  return bakeSurface('zebra.paint', { size, normalStrength: 1.6 }, (u, v, o) => {
    const wear = tileableFbm(NOISE.paint, u, v, 7, 4);
    const chip = tileableFbm(NOISE.paint, u + 3, v, 38, 2);
    const holes = smoothstep(0.32, 0.46, wear + chip * 0.35);
    const edge = 1 - smoothstep(0.0, 0.12, Math.min(v, 1 - v));
    const tyre = smoothstep(0.25, 0.6, tileableFbm(NOISE.stone, u * 0.3, v, 2, 2) + 0.2) * 0.35;
    setRgb(o, paint, 0.94 + chip * 0.08);
    mixInto(o, dirt, Math.max(edge * 0.55, tyre));
    mixInto(o, asphalt, holes);
    o.h = 0.62 - holes * 0.2 + chip * 0.04;
    o.rough = lerp(0.46, 0.7, holes) - tyre * 0.1;
  });
}

/**
 * Square sidewalk pavers with recessed grout. One tile = 2.4 m, 8×8 pavers.
 * Each paver has its own tone and a soft bevel so grazing sun catches edges.
 */
export function sidewalkTileMaps(key: string, tint: number, size = 512, pavers = 8): MaterialMaps {
  const base = hexToRgb(tint);
  const grout = hexToRgb(0x6a645c);
  const stain = hexToRgb(0x7a7068);
  return bakeSurface(`sidewalk.${key}`, { size, normalStrength: 2.6 }, (u, v, o) => {
    const x = u * pavers;
    const y = v * pavers;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const d = Math.min(gridDist(x), gridDist(y));
    const joint = smoothstep(0.035, 0.012, d);
    const bevel = smoothstep(0.012, 0.09, d);
    const jitter = cellHash(i % pavers, j % pavers, 3);
    const grain = tileableFbm(NOISE.stone, u, v, 70, 2);
    const blot = smoothstep(0.15, 0.45, tileableFbm(NOISE.soil, u, v, 5, 3));
    setRgb(o, base, 0.9 + jitter * 0.16 + grain * 0.08);
    mixInto(o, stain, blot * 0.35);
    mixInto(o, grout, joint);
    o.h = 0.3 + bevel * 0.5 + grain * 0.06;
    o.rough = 0.78 - blot * 0.18 + joint * 0.1;
  });
}

/** Running-bond red brick pavers (sidewalk strips in the golden reference). */
export function brickPaverMaps(size = 512): MaterialMaps {
  const brick = hexToRgb(0x9a5a48);
  const dark = hexToRgb(0x6a3a30);
  const grout = hexToRgb(0x8a8078);
  const rows = 16;
  const cols = 8;
  return bakeSurface('brick.paver', { size, normalStrength: 2.4 }, (u, v, o) => {
    const y = v * rows;
    const j = Math.floor(y);
    const x = u * cols + (j % 2) * 0.5;
    const i = Math.floor(x);
    const d = Math.min(gridDist(x) * 2, gridDist(y));
    const joint = smoothstep(0.06, 0.025, d);
    const bevel = smoothstep(0.025, 0.14, d);
    const jitter = cellHash(i % cols, j % rows, 9);
    const grain = tileableFbm(NOISE.stone, u, v, 60, 2);
    setRgb(o, brick, 0.85 + grain * 0.1);
    mixInto(o, dark, jitter * 0.5);
    mixInto(o, grout, joint);
    o.h = 0.3 + bevel * 0.5 + grain * 0.05;
    o.rough = 0.72 + joint * 0.12;
  });
}

/**
 * Precast concrete panels, 1.5 m × 1 m in a 3 m tile (2×3 panels), with
 * recessed joints, form-tie holes and vertical rain streaks.
 */
export function concretePanelMaps(key: string, tint: number, size = 512): MaterialMaps {
  const base = hexToRgb(tint);
  const streakC = hexToRgb(0x5a5c62);
  return bakeSurface(`concrete.${key}`, { size, normalStrength: 2.0 }, (u, v, o) => {
    const x = u * 2;
    const y = v * 3;
    const px = x - Math.floor(x);
    const py = y - Math.floor(y);
    const d = Math.min(gridDist(x), gridDist(y) * 0.66);
    const joint = smoothstep(0.018, 0.006, d);
    let tie = 0;
    for (const tx of [0.2, 0.8]) for (const ty of [0.25, 0.75]) tie = Math.max(tie, smoothstep(0.03, 0.012, Math.hypot((px - tx) * 1.5, py - ty)));
    const pore = tileableFbm(NOISE.stone, u, v, 80, 2);
    const streak = smoothstep(0.1, 0.55, tileableFbm(NOISE.water, u * 6, v * 0.35, 6, 3)) * (0.4 + py * 0.6);
    const panelTone = cellHash(Math.floor(x) % 2, Math.floor(y) % 3, 21);
    setRgb(o, base, 0.9 + panelTone * 0.12 + pore * 0.06);
    mixInto(o, streakC, streak * 0.4);
    mixInto(o, streakC, Math.max(joint, tie) * 0.8);
    o.h = 0.6 - joint * 0.5 - tie * 0.4 + pore * 0.05;
    o.rough = 0.84 - streak * 0.12;
  });
}

export type WindowStyle = 'punched' | 'ribbon';

export interface FacadeOptions {
  wall: number;
  frame?: number;
  glass?: number;
  /** Windows per tile horizontally / floors per tile. */
  cols?: number;
  rows?: number;
  /** Window size as a fraction of its cell. */
  winW?: number;
  winH?: number;
  style?: WindowStyle;
  /** Fraction of windows with lights on at night. */
  lit?: number;
  seed?: number;
}

const INTERIORS: [number, number, number][] = [
  hexToRgb(0xffd8a0),
  hexToRgb(0xffe8c8),
  hexToRgb(0xf0f4ff),
  hexToRgb(0xffc080),
  hexToRgb(0xd8e8ff),
];

/**
 * Window-grid facade module. One tile = `cols` windows × `rows` floors; UVs
 * are laid out in metres by the FacadeKit so a tile is ~3 m per window and
 * 3.5 m per floor.
 *
 * Every cell gets its own interior (warm / cool / off, blinds half down), so
 * repetition is broken per window rather than per tile. The emissive map holds
 * only the interior colour of lit cells; NeonMaterials scales it with the hour.
 */
export function facadeWindowGridMaps(key: string, f: FacadeOptions, size = 512): MaterialMaps {
  const cols = f.cols ?? 4;
  const rows = f.rows ?? 4;
  const winW = f.winW ?? 0.62;
  const winH = f.winH ?? 0.56;
  const style = f.style ?? 'punched';
  const lit = f.lit ?? 0.55;
  const seed = f.seed ?? 1;
  const wall = hexToRgb(f.wall);
  const frame = hexToRgb(f.frame ?? 0x3a3c44);
  const glass = hexToRgb(f.glass ?? 0x2a3a4e);
  const grime = hexToRgb(0x4a4a52);
  return bakeSurface(`facade.${key}`, { size, normalStrength: 2.4, emissive: true }, (u, v, o) => {
    const cx = u * cols;
    const cy = v * rows;
    const i = Math.floor(cx);
    const j = Math.floor(cy);
    const lx = cx - i;
    const ly = cy - j;
    const pore = tileableFbm(NOISE.stone, u, v, 60, 2);
    const stain = smoothstep(0.05, 0.5, tileableFbm(NOISE.water, u * 4, v * 0.5, 4, 3));

    setRgb(o, wall, 0.92 + pore * 0.08);
    mixInto(o, grime, stain * 0.22);
    o.h = 0.62 + pore * 0.04;
    o.rough = 0.82;

    // Floor slab line under each storey.
    const slab = smoothstep(0.035, 0.015, Math.abs(ly - 0.97));
    mixInto(o, grime, slab * 0.35);
    o.h -= slab * 0.12;

    const hw = style === 'ribbon' ? 0.49 : winW * 0.5;
    const hh = winH * 0.5;
    const dx = Math.abs(lx - 0.5);
    const dy = Math.abs(ly - 0.45);
    const inWin = dx < hw && dy < hh;
    const frameW = 0.035;
    const inFrame = dx < hw + frameW && dy < hh + frameW && !inWin;
    const sill = dx < hw + frameW * 1.6 && ly > 0.45 + hh + frameW && ly < 0.45 + hh + frameW * 2.4;

    if (sill) {
      setRgb(o, wall, 1.08);
      o.h = 0.85;
      o.rough = 0.6;
    }
    if (inFrame) {
      setRgb(o, frame);
      o.h = 0.5;
      o.rough = 0.38;
      o.metal = 0.7;
    }
    if (inWin) {
      const h = cellHash(i % cols, j % rows, seed);
      const h2 = cellHash(i % cols, j % rows, seed + 7);
      // Mullion splitting each window in two (or thirds on ribbon glazing).
      const mullions = style === 'ribbon' ? 3 : 2;
      const mx = ((lx - (0.5 - hw)) / (hw * 2)) * mullions;
      const mullion = smoothstep(0.03, 0.012, gridDist(mx)) * (mx > 0.05 && mx < mullions - 0.05 ? 1 : 0);
      const blind = ly - (0.45 - hh) < h2 * winH * 0.8;
      const sky = 1 - (ly - (0.45 - hh)) / (hh * 2);
      setRgb(o, glass, 0.85 + sky * 0.3);
      o.h = 0.2;
      o.rough = 0.06 + h2 * 0.06;
      o.metal = 0.55;
      if (h < lit) {
        const c = INTERIORS[Math.floor(h2 * INTERIORS.length) % INTERIORS.length];
        const k = blind ? 0.35 : 0.95;
        o.er = c[0] * k;
        o.eg = c[1] * k;
        o.eb = c[2] * k;
      }
      if (blind) {
        mixInto(o, hexToRgb(0xd8d0c0), 0.55);
        o.rough = 0.7;
        o.metal = 0;
      }
      if (mullion > 0) {
        setRgb(o, frame);
        o.h = 0.45;
        o.rough = 0.4;
        o.metal = 0.7;
        o.er = o.eg = o.eb = 0;
      }
    }
  });
}

/**
 * Glass curtain wall: 1.5 m panes, 3.5 m floors, opaque spandrel band at each
 * slab, ceiling-light strips glowing behind the glass. One tile = 4 panes × 3 floors.
 */
export function glassCurtainMaps(key: string, tint: number, spandrel: number, size = 512): MaterialMaps {
  const glass = hexToRgb(tint);
  const band = hexToRgb(spandrel);
  const mull = hexToRgb(0x4a505a);
  const cols = 4;
  const rows = 3;
  return bakeSurface(`curtain.${key}`, { size, normalStrength: 1.4, emissive: true }, (u, v, o) => {
    const cx = u * cols;
    const cy = v * rows;
    const i = Math.floor(cx);
    const j = Math.floor(cy);
    const ly = cy - j;
    const pane = cellHash(i % cols, j % rows, 31);
    setRgb(o, glass, 0.85 + pane * 0.25 + (1 - ly) * 0.12);
    o.h = 0.4;
    o.rough = 0.04 + pane * 0.07;
    o.metal = 0.75;
    const lights = pane > 0.25;
    if (lights) {
      const strip = smoothstep(0.06, 0.0, Math.abs(ly - 0.12)) * 0.9 + 0.18 * (1 - ly);
      const c = INTERIORS[Math.floor(pane * 97) % INTERIORS.length];
      o.er = c[0] * strip;
      o.eg = c[1] * strip;
      o.eb = c[2] * strip;
    }
    if (ly > 0.84) {
      setRgb(o, band, 0.95 + pane * 0.05);
      o.h = 0.55;
      o.rough = 0.5;
      o.metal = 0.2;
      o.er = o.eg = o.eb = 0;
    }
    const m = Math.min(gridDist(cx), gridDist(cy) * 0.5);
    if (m < 0.018) {
      setRgb(o, mull);
      o.h = 0.7;
      o.rough = 0.35;
      o.metal = 0.9;
      o.er = o.eg = o.eb = 0;
    }
  });
}

export type MetalFinish = 'brushed' | 'corrugated' | 'painted';

/** Metal panels for poles, shutters, vending machines, signal housings. One tile = 1 m. */
export function metalPanelMaps(key: string, tint: number, finish: MetalFinish = 'painted', size = 256): MaterialMaps {
  const base = hexToRgb(tint);
  const rust = hexToRgb(0x5a4a40);
  return bakeSurface(`metal.${key}.${finish}`, { size, normalStrength: finish === 'corrugated' ? 3.0 : 1.2 }, (u, v, o) => {
    const brush = tileableFbm(NOISE.stone, u * 0.2, v * 6, 30, 2);
    const scuff = smoothstep(0.2, 0.5, tileableFbm(NOISE.paint, u, v, 6, 3));
    const seam = smoothstep(0.012, 0.004, gridDist(v * 2));
    const rivet = smoothstep(0.02, 0.008, Math.hypot(gridDist(u * 4) * 0.5, gridDist(v * 2 + 0.06) * 0.5));
    setRgb(o, base, 0.94 + brush * 0.08);
    o.h = 0.5 + brush * 0.05 - seam * 0.3 + rivet * 0.3;
    o.metal = finish === 'painted' ? 0.25 : 0.85;
    o.rough = finish === 'brushed' ? 0.32 + brush * 0.08 : 0.45 + scuff * 0.2;
    if (finish === 'corrugated') {
      const wave = Math.sin(u * Math.PI * 2 * 24);
      o.h = 0.5 + wave * 0.35;
      setRgb(o, base, 0.92 + wave * 0.06);
    }
    mixInto(o, rust, scuff * (finish === 'brushed' ? 0.05 : 0.18));
  });
}

/** Small ceramic mosaic tiles (Japanese podium facade), glossy with dark grout. One tile = 1 m. */
export function tileFacadeMaps(key: string, tint: number, size = 512): MaterialMaps {
  const base = hexToRgb(tint);
  const grout = hexToRgb(0x5a5850);
  return bakeSurface(`tilefacade.${key}`, { size, normalStrength: 2.2 }, (u, v, o) => {
    const x = u * 10;
    const y = v * 20;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const d = Math.min(gridDist(x), gridDist(y) * 0.5);
    const joint = smoothstep(0.05, 0.02, d);
    const jitter = cellHash(i % 10, j % 20, 13);
    setRgb(o, base, 0.88 + jitter * 0.18);
    mixInto(o, grout, joint);
    o.h = 0.35 + smoothstep(0.02, 0.1, d) * 0.45;
    o.rough = lerp(0.22 + jitter * 0.12, 0.85, joint);
  });
}

/** Round leaf clumps for tree canopies. */
export function foliageMaps(size = 256): MaterialMaps {
  const dark = hexToRgb(0x2e6840);
  const light = hexToRgb(0x6aaa58);
  return bakeSurface('foliage', { size, normalStrength: 3.0 }, (u, v, o) => {
    const w = worley(u, v, 14, 41);
    const leaf = smoothstep(0.6, 0.1, w.f1);
    const tone = tileableFbm(NOISE.grass, u, v, 5, 3);
    const hue = (w.id % 1000) / 1000;
    setRgb(o, dark);
    mixInto(o, light, clamp(leaf * 0.7 + tone * 0.4 + hue * 0.2, 0, 1));
    o.h = leaf;
    o.rough = 0.7 - leaf * 0.15;
  });
}

/* ------------------------------------------------------------------ */
/* LED screens                                                         */
/* ------------------------------------------------------------------ */

export interface LedScreen {
  texture: THREE.CanvasTexture;
  /** Redraws the frame; call at the screen refresh rate (NeonMaterials throttles). */
  update(t: number): void;
}

export interface LedScreenOptions {
  width: number;
  height: number;
  seed: number;
  palette: number[];
  /** Big headline for procedural ads. */
  text?: string;
  /** Imagine still used as screen content (allowed by ART_DIRECTION §9). */
  imageUrl?: string;
}

const hexCss = (h: number) => `#${h.toString(16).padStart(6, '0')}`;

/**
 * Animated LED screen as a CanvasTexture. Content is a slow procedural ad
 * (colour fields + headline) or an Imagine still with a Ken Burns drift; both
 * get a sub-pixel grid and a travelling scan band so the screen reads as
 * diodes, not a poster.
 */
export function ledScreenTexture(opts: LedScreenOptions): LedScreen {
  const { width: w, height: h, palette, text, seed } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;

  const grid = document.createElement('canvas');
  grid.width = 4;
  grid.height = 4;
  const gg = grid.getContext('2d')!;
  gg.fillStyle = 'rgba(0,0,0,0.0)';
  gg.fillRect(0, 0, 4, 4);
  gg.fillStyle = 'rgba(0,0,0,0.42)';
  gg.fillRect(3, 0, 1, 4);
  gg.fillRect(0, 3, 4, 1);
  const gridPattern = g.createPattern(grid, 'repeat')!;

  let image: HTMLImageElement | null = null;
  if (opts.imageUrl) {
    const img = new Image();
    img.onload = () => (image = img);
    img.src = opts.imageUrl;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Mipmaps keep the 4px LED grid from aliasing into moiré on distant screens.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 8;

  const phase = (seed % 97) / 97;
  const update = (t: number) => {
    const tt = t * 0.25 + phase * 10;
    const slide = Math.floor(tt / 2.5);
    const c0 = palette[slide % palette.length];
    const c1 = palette[(slide + 1) % palette.length];
    if (image) {
      const s = 1.08 + Math.sin(tt * 0.6) * 0.04;
      const iw = image.width;
      const ih = image.height;
      const scale = Math.max(w / iw, h / ih) * s;
      const dw = iw * scale;
      const dh = ih * scale;
      g.drawImage(image, (w - dw) / 2 + Math.sin(tt * 0.4) * w * 0.03, (h - dh) / 2, dw, dh);
    } else {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, hexCss(c0));
      grad.addColorStop(1, hexCss(c1));
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 3; k++) {
        const bx = (Math.sin(tt * (0.7 + k * 0.3) + k * 2 + seed) * 0.5 + 0.5) * w;
        const by = (Math.cos(tt * (0.5 + k * 0.2) + k) * 0.5 + 0.5) * h;
        const rg = g.createRadialGradient(bx, by, 0, bx, by, h * 0.8);
        rg.addColorStop(0, 'rgba(255,255,255,0.55)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, w, h);
      }
      if (text) {
        let size = Math.floor(h * 0.46);
        g.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
        const fit = (w * 0.86) / Math.max(1, g.measureText(text).width);
        if (fit < 1) {
          size = Math.floor(size * fit);
          g.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
        }
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(10,10,20,0.35)';
        g.fillText(text, w / 2 + 3, h / 2 + 4);
        g.fillStyle = '#fffaf0';
        g.fillText(text, w / 2, h / 2);
      }
    }
    const band = ((t * 0.35 + phase) % 1) * (h + 40) - 20;
    const sg = g.createLinearGradient(0, band - 20, 0, band + 20);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg;
    g.fillRect(0, band - 20, w, 40);
    g.fillStyle = gridPattern;
    g.fillRect(0, 0, w, h);
    texture.needsUpdate = true;
  };
  update(0);
  return { texture, update };
}
