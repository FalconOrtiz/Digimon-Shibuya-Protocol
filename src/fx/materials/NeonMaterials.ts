import * as THREE from 'three';

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

export function applyNightFactor(nf: number): void {
  currentNight = nf;
  for (let i = 0; i < registry.length; i++) applyOne(registry[i], nf);
}

export function currentNightFactor(): number {
  return currentNight;
}
