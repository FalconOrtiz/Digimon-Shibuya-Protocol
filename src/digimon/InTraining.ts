import * as THREE from 'three';
import { metaSurface, boxProjectedUV, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import { clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature, type InTrainingId } from './shared';
import { fixOutward, weldDecimate, markSculpt, buildEye } from './sculpt-util';

/**
 * The wild In-Training Digimon that patrol the crossing: Koromon, Nyaromon
 * and Bukamon. One-blob sculpts with appendages, faceted like the partners so
 * the whole cast shares one look.
 */

interface Spec {
  body: number;
  accent: number;
  iris: number;
  balls: Ball[];
  /** Appendages that sway: [pivot position, ball list in pivot space]. */
  parts: { at: [number, number, number]; balls: Ball[]; accent?: boolean }[];
  eyeY: number;
  eyeX: number;
  eyeZ: number;
}

const SPECS: Record<InTrainingId, Spec> = {
  koromon: {
    body: 0xf2a0a8,
    accent: 0xe07884,
    iris: 0xc8283a,
    balls: [
      { x: 0, y: 0.1, z: 0, r: 0.11, sx: 1.12, sy: 0.9, sz: 1.02 },
      { x: 0, y: 0.05, z: 0.02, r: 0.1, sx: 1.18, sy: 0.6 },
    ],
    parts: [
      { at: [0.05, 0.17, -0.01], balls: [{ x: 0.02, y: 0.04, z: 0, r: 0.03 }, { x: 0.05, y: 0.1, z: -0.01, r: 0.026, sy: 1.6 }, { x: 0.07, y: 0.16, z: -0.02, r: 0.02, sy: 1.4 }] },
      { at: [-0.05, 0.17, -0.01], balls: [{ x: -0.02, y: 0.04, z: 0, r: 0.03 }, { x: -0.05, y: 0.1, z: -0.01, r: 0.026, sy: 1.6 }, { x: -0.07, y: 0.16, z: -0.02, r: 0.02, sy: 1.4 }] },
    ],
    eyeX: 0.044,
    eyeY: 0.12,
    eyeZ: 0.09,
  },
  nyaromon: {
    body: 0xf4d27a,
    accent: 0xe0a848,
    iris: 0x2a9a4a,
    balls: [
      { x: 0, y: 0.1, z: 0, r: 0.105, sx: 1.08, sy: 0.94 },
      { x: 0, y: 0.045, z: 0.01, r: 0.09, sx: 1.14, sy: 0.55 },
      { x: 0.07, y: 0.18, z: -0.005, r: 0.03, sy: 1.5, sz: 0.6 },
      { x: -0.07, y: 0.18, z: -0.005, r: 0.03, sy: 1.5, sz: 0.6 },
      { x: 0.08, y: 0.215, z: -0.005, r: 0.018, sy: 1.4, sz: 0.6 },
      { x: -0.08, y: 0.215, z: -0.005, r: 0.018, sy: 1.4, sz: 0.6 },
    ],
    parts: [
      { at: [0, 0.08, -0.1], accent: true, balls: [{ x: 0, y: 0.02, z: -0.02, r: 0.022 }, { x: 0, y: 0.07, z: -0.05, r: 0.02 }, { x: 0, y: 0.12, z: -0.05, r: 0.026 }] },
    ],
    eyeX: 0.042,
    eyeY: 0.115,
    eyeZ: 0.086,
  },
  bukamon: {
    body: 0xe8eef4,
    accent: 0xf08a3a,
    iris: 0x1a3a6a,
    balls: [
      { x: 0, y: 0.1, z: 0.01, r: 0.1, sx: 1.02, sy: 0.96 },
      { x: 0, y: 0.06, z: -0.07, r: 0.075, sx: 0.9, sy: 0.7 },
      { x: 0, y: 0.05, z: -0.14, r: 0.05, sx: 0.8, sy: 0.6 },
      { x: 0.07, y: 0.035, z: 0.04, r: 0.035, sx: 1.3, sy: 0.5 },
      { x: -0.07, y: 0.035, z: 0.04, r: 0.035, sx: 1.3, sy: 0.5 },
    ],
    parts: [
      { at: [0, 0.19, 0], accent: true, balls: [{ x: 0, y: 0.02, z: 0.02, r: 0.03, sx: 0.5 }, { x: 0, y: 0.04, z: -0.02, r: 0.032, sx: 0.5 }, { x: 0, y: 0.03, z: -0.06, r: 0.026, sx: 0.5 }] },
      { at: [0, 0.06, -0.19], balls: [{ x: 0.03, y: 0.02, z: -0.02, r: 0.03, sy: 0.4, sx: 1.4 }, { x: -0.03, y: 0.02, z: -0.02, r: 0.03, sy: 0.4, sx: 1.4 }] },
    ],
    eyeX: 0.04,
    eyeY: 0.13,
    eyeZ: 0.085,
  },
};

function faceted(balls: Ball[], label: string, res: number): THREE.BufferGeometry {
  let g = metaSurface(balls, { resolution: res, smooth: 0.9, padding: 0.024 });
  fixOutward(g, label);
  g = weldDecimate(g, 0.013);
  g.setAttribute('uv', boxProjectedUV(g, 17));
  markSculpt(g, new THREE.Vector3(0, 0.08, 0), () => -1, 0.24, 1);
  return g;
}

export function buildInTraining(id: InTrainingId): Creature {
  const s = SPECS[id];
  const rig = createRig();
  rig.root.name = id;
  const mat = (hex: number) => {
    const m = creatureSkin({ color: hex, wrap: 0.08, rim: 0.03, roughness: 0.6, detail: 'none' });
    m.flatShading = true;
    m.vertexColors = true;
    m.envMapIntensity = 0.08;
    return m;
  };
  const skin = mat(s.body);
  const accent = mat(s.accent);

  const body = new THREE.Mesh(faceted(s.balls, `${id}-body`, 36), skin);
  body.castShadow = body.receiveShadow = true;
  rig.body.add(body);
  rig.head.position.set(0, 0, 0);

  const pivots: THREE.Group[] = [];
  s.parts.forEach((p, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(...p.at);
    const m = new THREE.Mesh(faceted(p.balls, `${id}-part${i}`, 26), p.accent ? accent : skin);
    m.castShadow = true;
    pivot.add(m);
    rig.body.add(pivot);
    pivots.push(pivot);
  });

  const lid = creatureSkin({ color: s.body, wrap: 0.08, rim: 0.03, roughness: 0.6, detail: 'none' });
  for (const side of [1, -1]) {
    const eye = buildEye(0.021, 0.028, side, 0.34, lid, s.iris, s.iris);
    eye.holder.position.set(side * s.eyeX, s.eyeY, s.eyeZ);
    rig.head.add(eye.holder);
    rig.eyes.push(eye.holder);
    rig.eyelids.push(eye.lid);
  }

  const anim = new IdleAnimator(rig, id.length * 7);
  let attention = 0;
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);
      pivots.forEach((p, i) => {
        p.rotation.z = Math.sin(elapsed * 2.1 + i * 2) * 0.12;
        p.rotation.x = Math.sin(elapsed * 1.6 + i) * 0.08;
      });
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}
