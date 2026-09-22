import * as THREE from 'three';
import { buildAgumon } from './Agumon';
import { buildPatamon } from './Patamon';
import { buildGreymon } from './Greymon';
import { buildAngemon } from './Angemon';
import { buildMetalGreymon } from './MetalGreymon';
import { buildMagnaAngemon } from './MagnaAngemon';
import { buildInTraining } from './InTraining';
import type { Creature, SpeciesId } from './shared';

/**
 * Single factory for every Digimon model. Returns a grounded wrapper:
 *   wrap (world placement, owned by the caller)
 *     └ pose (animation layer, owned by DigimonAnimator)
 *         └ creature.group (the sculpt and its own idle rig)
 */

const BUILDERS: Record<SpeciesId, () => Creature> = {
  agumon: buildAgumon,
  patamon: buildPatamon,
  greymon: buildGreymon,
  angemon: buildAngemon,
  metalgreymon: buildMetalGreymon,
  magnaangemon: buildMagnaAngemon,
  koromon: () => buildInTraining('koromon'),
  nyaromon: () => buildInTraining('nyaromon'),
  bukamon: () => buildInTraining('bukamon'),
};

/** Sculpts are authored at ~0.5 m; this brings each line to game scale. */
const SCALE: Record<SpeciesId, number> = {
  agumon: 2.8,
  greymon: 2.8,
  metalgreymon: 2.8,
  patamon: 2.4,
  angemon: 2.4,
  magnaangemon: 2.4,
  koromon: 2.6,
  nyaromon: 2.6,
  bukamon: 2.6,
};

/** Patamon flies: it idles this high above the ground (metres). */
const HOVER: Partial<Record<SpeciesId, number>> = { patamon: 0.35 };

export function isSpecies(id: string): id is SpeciesId {
  return id in BUILDERS;
}

export function buildDigimon(id: string): THREE.Group {
  const species: SpeciesId = isSpecies(id) ? id : 'koromon';
  const creature = BUILDERS[species]();
  const inner = creature.group;
  inner.scale.multiplyScalar(SCALE[species]);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  inner.position.y = -box.min.y + (HOVER[species] ?? 0);

  const pose = new THREE.Group();
  pose.name = 'pose';
  pose.add(inner);
  const wrap = new THREE.Group();
  wrap.name = `digimon:${species}`;
  wrap.add(pose);
  wrap.userData = { species, creature, pose, height: box.max.y - box.min.y };
  return wrap;
}

export function disposeDigimon(model: THREE.Object3D): void {
  model.parent?.remove(model);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
