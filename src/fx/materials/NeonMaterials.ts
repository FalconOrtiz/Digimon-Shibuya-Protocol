import * as THREE from 'three';
import { ledScreenTexture, type LedScreen, type LedScreenOptions } from '../../core/TextureLab';

/**
 * Emissive registry. Neon, LED screens, lit windows and lamp heads register
 * here with a day and a night strength; Atmosphere pushes the current
 * nightFactor once per sample and every registered material follows. Neon is
 * material, never a light (ART_DIRECTION §2.8).
 */

interface EmissiveEntry {
  material: THREE.Material & { emissiveIntensity?: number; color?: THREE.Color };
  day: number;
  night: number;
  /** MeshBasicMaterial has no emissive: scale its colour instead. */
  base?: THREE.Color;
}

const registry: EmissiveEntry[] = [];
let currentNight = 0;

export function registerEmissive<T extends THREE.Material>(material: T, day: number, night: number): T {
  const m = material as unknown as EmissiveEntry['material'];
  const entry: EmissiveEntry = { material: m, day, night };
  if (m.emissiveIntensity === undefined && m.color) entry.base = m.color.clone();
  registry.push(entry);
  applyOne(entry, currentNight);
  return material;
}

export function unregisterEmissive(material: THREE.Material): void {
  const i = registry.findIndex((e) => e.material === material);
  if (i >= 0) registry.splice(i, 1);
}

function applyOne(e: EmissiveEntry, nf: number): void {
  const k = e.day + (e.night - e.day) * nf;
  if (e.base && e.material.color) e.material.color.copy(e.base).multiplyScalar(k);
  else e.material.emissiveIntensity = k;
}

const hooks: ((nf: number) => void)[] = [];

/** Non-emissive materials that also change with the hour (e.g. asphalt gets wetter). */
export function onNightFactor(fn: (nf: number) => void): void {
  hooks.push(fn);
  fn(currentNight);
}

export function applyNightFactor(nf: number): void {
  currentNight = nf;
  for (let i = 0; i < registry.length; i++) applyOne(registry[i], nf);
  for (let i = 0; i < hooks.length; i++) hooks[i](nf);
}

export function currentNightFactor(): number {
  return currentNight;
}

/* ------------------------------------------------------------------ */
/* Neon signs                                                          */
/* ------------------------------------------------------------------ */

const css = (h: number) => `#${h.toString(16).padStart(6, '0')}`;

export interface NeonSign {
  material: THREE.MeshBasicMaterial;
  aspect: number;
  /** Sub-rect of the atlas page: [u0, v0, u1, v1]. */
  uv: [number, number, number, number];
}

const signCache = new Map<string, NeonSign>();

/**
 * Every sign face shares a few 2048² atlas pages, so the whole city's signage
 * is one material per page and merges into a handful of draw calls.
 */
const PAGE = 2048;
/** Gutter filled with the panel colour so mip levels never bleed a neighbour in. */
const GUTTER = 6;

interface AtlasPage {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  x: number;
  y: number;
  rowH: number;
}

const pages: AtlasPage[] = [];

function newPage(): AtlasPage {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PAGE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#16141c';
  g.fillRect(0, 0, PAGE, PAGE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = registerEmissive(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 0.95, 2.6);
  material.name = `neon.atlas.${pages.length}`;
  const page = { canvas, g, texture, material, x: 0, y: 0, rowH: 0 };
  pages.push(page);
  return page;
}

/** Shelf packing: left to right, next row when full, next page when the page is. */
function allocate(w: number, h: number): { page: AtlasPage; x: number; y: number } {
  const W = w + GUTTER * 2;
  const H = h + GUTTER * 2;
  let page = pages[pages.length - 1] ?? newPage();
  if (page.x + W > PAGE) {
    page.x = 0;
    page.y += page.rowH;
    page.rowH = 0;
  }
  if (page.y + H > PAGE) page = newPage();
  const at = { page, x: page.x + GUTTER, y: page.y + GUTTER };
  page.x += W;
  page.rowH = Math.max(page.rowH, H);
  return at;
}

export interface NeonSignOptions {
  text: string;
  color: number;
  /** Stacked characters, Japanese tategaki style. */
  vertical?: boolean;
  /** Backing panel colour; the tube glows on top of it. */
  panel?: number;
}

/**
 * A neon sign face: dark cabinet, glowing tube lettering with a soft halo,
 * inner white core so the bloom reads as gas-filled glass. Returns the width /
 * height ratio so callers size the quad to the text.
 */
export function neonSignMaterial(o: NeonSignOptions): NeonSign {
  const key = `${o.text}|${o.color}|${o.vertical ? 'v' : 'h'}|${o.panel ?? 0}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  const chars = [...o.text];
  const cell = 96;
  const w = Math.ceil(o.vertical ? cell * 1.3 : Math.max(2, chars.length) * cell * 0.72 + cell * 0.8);
  const h = Math.ceil(o.vertical ? chars.length * cell + cell * 0.5 : cell * 1.5);
  const { page, x, y } = allocate(w, h);
  const g = page.g;
  g.save();
  g.fillStyle = css(o.panel ?? 0x16141c);
  g.fillRect(x - GUTTER, y - GUTTER, w + GUTTER * 2, h + GUTTER * 2);
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x, y);
  g.strokeStyle = css(o.color);
  g.globalAlpha = 0.5;
  g.lineWidth = 4;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.globalAlpha = 1;
  g.font = `900 ${Math.floor(cell * 0.78)}px "Arial Black", "Yu Gothic", Meiryo, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const draw = (blur: number, colour: string) => {
    g.shadowBlur = blur;
    g.shadowColor = css(o.color);
    g.fillStyle = colour;
    if (o.vertical) chars.forEach((c, i) => g.fillText(c, w / 2, cell * 0.75 + i * cell));
    else g.fillText(o.text, w / 2, h / 2 + 4, w - cell * 0.5);
  };
  draw(28, css(o.color));
  draw(10, css(o.color));
  draw(0, 'rgba(255,255,255,0.85)');
  g.restore();
  page.texture.needsUpdate = true;
  const out: NeonSign = {
    material: page.material,
    aspect: w / h,
    uv: [x / PAGE, 1 - (y + h) / PAGE, (x + w) / PAGE, 1 - y / PAGE],
  };
  signCache.set(key, out);
  return out;
}

/** Remaps a 0-1 quad's UVs into a sign's atlas rect. */
export function applySignUV(geo: THREE.BufferGeometry, uv: NeonSign['uv']): THREE.BufferGeometry {
  const a = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) {
    a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  }
  return geo;
}

/* ------------------------------------------------------------------ */
/* LED screens                                                         */
/* ------------------------------------------------------------------ */

const screens: LedScreen[] = [];
let screenClock = 0;
const SCREEN_HZ = 12;

/** A self-lit LED screen. Brighter than neon by day: real screens fight the sun. */
const screenCache = new Map<string, THREE.MeshBasicMaterial>();

export function ledScreenMaterial(o: LedScreenOptions): THREE.MeshBasicMaterial {
  const key = JSON.stringify([o.width, o.height, o.seed, o.text, o.imageUrl, o.palette]);
  const hit = screenCache.get(key);
  if (hit) return hit;
  const screen = ledScreenTexture(o);
  screens.push(screen);
  const m = registerEmissive(new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }), 1.0, 0.85);
  m.name = `led.${o.text ?? o.imageUrl ?? o.seed}`;
  screenCache.set(key, m);
  return m;
}

/** Advances every LED screen, throttled to SCREEN_HZ. Called by the city system. */
export function updateScreens(dt: number, elapsed: number): void {
  screenClock += dt;
  if (screenClock < 1 / SCREEN_HZ) return;
  screenClock = 0;
  for (let i = 0; i < screens.length; i++) screens[i].update(elapsed);
}
