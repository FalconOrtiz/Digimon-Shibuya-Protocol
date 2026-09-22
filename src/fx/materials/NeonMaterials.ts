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
const signCache = new Map<string, { material: THREE.MeshBasicMaterial; aspect: number }>();

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
export function neonSignMaterial(o: NeonSignOptions): { material: THREE.MeshBasicMaterial; aspect: number } {
  const key = `${o.text}|${o.color}|${o.vertical ? 'v' : 'h'}|${o.panel ?? 0}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  const chars = [...o.text];
  const cell = 96;
  const w = o.vertical ? cell * 1.3 : Math.max(2, chars.length) * cell * 0.72 + cell * 0.8;
  const h = o.vertical ? chars.length * cell + cell * 0.5 : cell * 1.5;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(h);
  const g = canvas.getContext('2d')!;
  g.fillStyle = css(o.panel ?? 0x16141c);
  g.fillRect(0, 0, w, h);
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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const material = registerEmissive(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0.95, 2.6);
  material.name = `neon.${o.text}`;
  const out = { material, aspect: w / h };
  signCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* LED screens                                                         */
/* ------------------------------------------------------------------ */

const screens: LedScreen[] = [];
let screenClock = 0;
const SCREEN_HZ = 12;

/** A self-lit LED screen. Brighter than neon by day: real screens fight the sun. */
export function ledScreenMaterial(o: LedScreenOptions): THREE.MeshBasicMaterial {
  const screen = ledScreenTexture(o);
  screens.push(screen);
  const m = registerEmissive(new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }), 1.0, 0.85);
  m.name = `led.${o.text ?? o.imageUrl ?? o.seed}`;
  return m;
}

/** Advances every LED screen, throttled to SCREEN_HZ. Called by the city system. */
export function updateScreens(dt: number, elapsed: number): void {
  screenClock += dt;
  if (screenClock < 1 / SCREEN_HZ) return;
  screenClock = 0;
  for (let i = 0; i < screens.length; i++) screens[i].update(elapsed);
}
