import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

const isLeaf = (o: THREE.Object3D): o is THREE.Mesh =>
  (o as THREE.Mesh).isMesh && o.children.length === 0 && !o.userData.anim && !Array.isArray((o as THREE.Mesh).material);

function flipWinding(g: THREE.BufferGeometry): void {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    g.index.needsUpdate = true;
    return;
  }
  for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) {
    const s = attr.itemSize;
    const a = attr.array;
    for (let t = 0; t < attr.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const i1 = (t + 1) * s + k;
        const i2 = (t + 2) * s + k;
        [a[i1], a[i2]] = [a[i2], a[i1]];
      }
    }
    attr.needsUpdate = true;
  }
}

const attrSignature = (g: THREE.BufferGeometry): string =>
  Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : '');

/**
 * Cuts draw calls without touching the rig: meshes inside `userData.static`
 * holders are hoisted into the holder's parent, then leaf siblings that share
 * a material instance are merged into one mesh.
 */
function compact(root: THREE.Object3D): void {
  const holders: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.userData.static && o.parent) holders.push(o); });
  for (const h of holders) {
    h.updateMatrix();
    for (const c of [...h.children]) {
      if (!isLeaf(c)) continue;
      c.updateMatrix();
      c.matrix.premultiply(h.matrix);
      c.matrix.decompose(c.position, c.quaternion, c.scale);
      h.parent!.add(c);
    }
  }

  const parents: THREE.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  for (const p of parents) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const c of p.children) {
      if (!isLeaf(c)) continue;
      const key = `${(c.material as THREE.Material).uuid}|${c.castShadow}|${c.receiveShadow}|${attrSignature(c.geometry)}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = m.geometry.clone().applyMatrix4(m.matrix);
        if (m.matrix.determinant() < 0) flipWinding(g);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const out = new THREE.Mesh(merged, list[0].material);
      out.castShadow = list[0].castShadow;
      out.receiveShadow = list[0].receiveShadow;
      out.name = list[0].name;
      for (const m of list) {
        p.remove(m);
        m.geometry.dispose();
      }
      p.add(out);
    }
  }
}

export function buildDigimon(id: string): THREE.Group {
  const species: SpeciesId = isSpecies(id) ? id : 'koromon';
  const creature = BUILDERS[species]();
  const inner = creature.group;
  compact(inner);
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
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) if (!x.userData.shared) x.dispose();
  });
}
