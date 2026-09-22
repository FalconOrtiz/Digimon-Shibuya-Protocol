import * as THREE from 'three';
import {
  wetAsphaltMaps,
  zebraPaintMaps,
  sidewalkTileMaps,
  brickPaverMaps,
  concretePanelMaps,
  metalPanelMaps,
  type MaterialMaps,
} from '../../core/TextureLab';
import { onNightFactor } from './NeonMaterials';

/**
 * Ground materials (ART_DIRECTION §5). Every material expects UVs in TILES:
 * `userData.tile` is the world size of one texture repeat in metres, and the
 * world code divides its metre coordinates by it.
 */

export const TILE = {
  asphalt: 8,
  sidewalk: 2.4,
  brick: 1.6,
  curb: 1,
} as const;

const cache = new Map<string, THREE.Material>();

function once<T extends THREE.Material>(key: string, build: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = build();
  m.name = key;
  cache.set(key, m);
  return m;
}

function standard(maps: MaterialMaps, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
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

/**
 * Wet asphalt. Physical so the clearcoat layer gives puddles and damp patches
 * the second, sharper reflection that wet tarmac has on top of its rough base.
 */
export function asphaltMaterial(size = 512): THREE.MeshPhysicalMaterial {
  return once('terrain.asphalt', () => {
    const maps = wetAsphaltMaps(size);
    const m = new THREE.MeshPhysicalMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: maps.roughnessMap,
      metalnessMap: maps.metalnessMap,
      roughness: 1,
      metalness: 1,
      clearcoat: 0.35,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.25,
    });
    m.userData.tile = TILE.asphalt;
    // The night gold shot is after rain: the clearcoat sharpens into a mirror film.
    onNightFactor((nf) => {
      m.clearcoat = 0.35 + nf * 0.6;
      m.clearcoatRoughness = 0.12 - nf * 0.09;
      m.envMapIntensity = 1.25 + nf * 1.2;
    });
    return m;
  });
}

/** Zebra and lane paint. Offset in depth so it never fights the asphalt. */
export function roadPaintMaterial(size = 256, tint = 0xffffff): THREE.MeshPhysicalMaterial {
  return once(`terrain.paint.${tint.toString(16)}`, () => {
    const maps = zebraPaintMaps(size);
    return new THREE.MeshPhysicalMaterial({
      color: tint,
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: 1,
      metalness: 0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  });
}

export type SidewalkKind = 'warm' | 'grey';

export function sidewalkMaterial(kind: SidewalkKind = 'warm', size = 512): THREE.MeshStandardMaterial {
  return once(`terrain.sidewalk.${kind}`, () => {
    const m = standard(sidewalkTileMaps(kind, kind === 'warm' ? 0xc8bcac : 0xa8a8a4, size), { metalness: 0 });
    m.userData.tile = TILE.sidewalk;
    return m;
  });
}

export function brickPaverMaterial(size = 512): THREE.MeshStandardMaterial {
  return once('terrain.brick', () => {
    const m = standard(brickPaverMaps(size), { metalness: 0 });
    m.userData.tile = TILE.brick;
    return m;
  });
}

export function curbMaterial(size = 256): THREE.MeshStandardMaterial {
  return once('terrain.curb', () => {
    const m = standard(concretePanelMaps('curb', 0x9a9892, size), { metalness: 0 });
    m.userData.tile = TILE.curb;
    return m;
  });
}

/** Yellow tactile paving strip. */
export function tactileMaterial(): THREE.MeshStandardMaterial {
  return once('terrain.tactile', () => {
    const maps = metalPanelMaps('tactile', 0xd8b030, 'painted', 128);
    return standard(maps, { metalness: 0, roughness: 0.9, color: 0xffffff });
  });
}
