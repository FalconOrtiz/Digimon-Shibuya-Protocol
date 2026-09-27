import * as THREE from 'three';
import { barkMaps, foliageMaps, metalPanelMaps, tile, type MaterialMaps } from '../../core/TextureLab';
import { registerEmissive } from './NeonMaterials';

/** Street furniture, trees and vehicles. Metals need the PMREM to read as metal. */

const cache = new Map<string, THREE.Material>();

function once<T extends THREE.Material>(key: string, build: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = build();
  m.name = `prop.${key}`;
  cache.set(key, m);
  return m;
}

function std(maps: MaterialMaps, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    metalnessMap: maps.metalnessMap,
    roughness: 1,
    metalness: 1,
    ...extra,
  });
}

/** Dark steel: lamp posts, signal poles, railings. */
export const steelMaterial = () => once('steel', () => std(metalPanelMaps('steel', 0x2e323c, 'brushed')));
/** Grey galvanised: bollards, guard rails. */
export const galvanisedMaterial = () => once('galv', () => std(metalPanelMaps('galv', 0x9aa0a8, 'brushed')));
/** Shop shutters. */
export const shutterMaterial = () => once('shutter', () => std(metalPanelMaps('shutter', 0x9aa0a8, 'corrugated')));

export function paintedMetal(key: string, hex: number): THREE.MeshStandardMaterial {
  return once(`painted.${key}`, () => std(metalPanelMaps(`p.${key}`, hex, 'painted')));
}

export const barkMaterial = () => once('bark', () => {
  const maps = tile(barkMaps(256), 1);
  return new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap, roughness: 1, metalness: 0 });
});

export const foliageMaterial = (tint = 0xffffff) =>
  once(`foliage.${tint.toString(16)}`, () => {
    const maps = foliageMaps(256);
    return new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: maps.roughnessMap,
      roughness: 1,
      metalness: 0,
      color: tint,
    });
  });

export const soilMaterial = () => once('soil', () => new THREE.MeshStandardMaterial({ color: 0x3a2e26, roughness: 1 }));
export const rubberMaterial = () => once('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.85 }));

export function carPaint(hex: number): THREE.MeshPhysicalMaterial {
  return once(`car.${hex.toString(16)}`, () =>
    new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 }),
  );
}

export const carGlass = () =>
  once('carglass', () => new THREE.MeshPhysicalMaterial({ color: 0x1e2a36, roughness: 0.05, metalness: 0.5, clearcoat: 1, envMapIntensity: 1.5 }));

/** Emissive heads: lamps, headlights, signals. Scaled by the hour via NeonMaterials. */
export function glowMaterial(key: string, hex: number, day: number, night: number): THREE.MeshBasicMaterial {
  return once(`glow.${key}`, () => registerEmissive(new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }), day, night));
}
