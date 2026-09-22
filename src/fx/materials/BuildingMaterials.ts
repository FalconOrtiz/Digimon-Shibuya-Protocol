import * as THREE from 'three';
import {
  facadeWindowGridMaps,
  glassCurtainMaps,
  concretePanelMaps,
  tileFacadeMaps,
  metalPanelMaps,
  type FacadeOptions,
  type MaterialMaps,
} from '../../core/TextureLab';
import { registerEmissive } from './NeonMaterials';

/**
 * Building materials. UVs are laid out by FacadeKit in tiles; `userData.tileU`
 * and `tileV` give the metres one repeat covers horizontally / vertically so
 * windows stay the same size on every tower.
 */

export type FacadeKind = 'punched' | 'ribbon' | 'curtain' | 'concrete' | 'tile';

export interface FacadeSpec {
  key: string;
  kind: FacadeKind;
  wall: number;
  /** Curtain spandrel colour / frame colour for punched windows. */
  accent?: number;
  glass?: number;
  lit?: number;
  seed?: number;
}

/** Metres covered by one texture repeat, per facade kind. */
export const FACADE_TILE: Record<FacadeKind, { u: number; v: number }> = {
  punched: { u: 12, v: 14 },
  ribbon: { u: 12, v: 17.5 },
  curtain: { u: 6, v: 10.5 },
  concrete: { u: 3, v: 3 },
  tile: { u: 1, v: 1 },
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

function fromMaps(maps: MaterialMaps, lit: boolean, physical = false): THREE.MeshStandardMaterial {
  const params: THREE.MeshPhysicalMaterialParameters = {
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    metalnessMap: maps.metalnessMap,
    roughness: 1,
    metalness: 1,
  };
  if (lit && maps.emissiveMap) {
    params.emissiveMap = maps.emissiveMap;
    params.emissive = new THREE.Color(0xffffff);
  }
  const m = physical ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: 0.6, clearcoatRoughness: 0.05 }) : new THREE.MeshStandardMaterial(params);
  if (lit && maps.emissiveMap) registerEmissive(m, 0.04, 2.2);
  return m;
}

export function facadeMaterial(spec: FacadeSpec, size = 512): THREE.MeshStandardMaterial {
  const hit = cache.get(spec.key);
  if (hit) return hit;
  let m: THREE.MeshStandardMaterial;
  switch (spec.kind) {
    case 'curtain':
      m = fromMaps(glassCurtainMaps(spec.key, spec.glass ?? 0x2a3a4e, spec.accent ?? 0x6a7080, size), true, true);
      m.envMapIntensity = 1.4;
      break;
    case 'concrete':
      m = fromMaps(concretePanelMaps(spec.key, spec.wall, size), false);
      break;
    case 'tile':
      m = fromMaps(tileFacadeMaps(spec.key, spec.wall, size), false);
      break;
    default: {
      const opts: FacadeOptions = {
        wall: spec.wall,
        frame: spec.accent,
        glass: spec.glass,
        style: spec.kind,
        rows: spec.kind === 'ribbon' ? 5 : 4,
        lit: spec.lit ?? 0.55,
        seed: spec.seed ?? 1,
      };
      m = fromMaps(facadeWindowGridMaps(spec.key, opts, size), true);
    }
  }
  m.name = `facade.${spec.key}`;
  m.userData.tileU = FACADE_TILE[spec.kind].u;
  m.userData.tileV = FACADE_TILE[spec.kind].v;
  cache.set(spec.key, m);
  return m;
}

/** Roof / parapet / plant-room concrete. */
export function roofMaterial(size = 256): THREE.MeshStandardMaterial {
  return facadeMaterial({ key: 'roof', kind: 'concrete', wall: 0x7a7c82 }, size);
}

/** Dark metal for storefront frames, cornices, signage cabinets. */
export function trimMaterial(): THREE.MeshStandardMaterial {
  const hit = cache.get('trim');
  if (hit) return hit;
  const maps = metalPanelMaps('trim', 0x2e323c, 'brushed', 256);
  const m = fromMaps(maps, false);
  m.name = 'building.trim';
  m.userData.tileU = m.userData.tileV = 1;
  cache.set('trim', m);
  return m;
}

/** Shop glazing at street level: warm interior glow, strong reflection. */
export function shopGlassMaterial(): THREE.MeshStandardMaterial {
  const hit = cache.get('shopglass');
  if (hit) return hit;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x3a4a5a,
    roughness: 0.06,
    metalness: 0.4,
    emissive: new THREE.Color(0xffc890),
    envMapIntensity: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
  });
  registerEmissive(m, 0.25, 1.1);
  m.name = 'building.shopglass';
  cache.set('shopglass', m);
  return m;
}
