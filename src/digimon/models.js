import * as THREE from 'three';
import { toon } from '../world/toon.js';
import { buildFlaremon } from './Flaremon';
import { buildEarwingmon } from './Earwingmon';

function eyes(g, x, y, z, iris, s = 0.09) {
  const W = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x333333 });
  const I = new THREE.MeshStandardMaterial({ color: iris, roughness: 0.25, emissive: iris, emissiveIntensity: 0.3 });
  const P = new THREE.MeshStandardMaterial({ color: 0x141414 });
  const H = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const k of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), W);
    e.position.set(k * x, y, z);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(s * 0.58, 10, 8), I);
    ir.position.set(k * x, y, z + s * 0.55);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(s * 0.28, 8, 6), P);
    pu.position.set(k * x, y - s * 0.03, z + s * 0.82);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(s * 0.14, 6, 6), H);
    gl.position.set(k * x - s * 0.18, y + s * 0.22, z + s * 0.92);
    g.add(e, ir, pu, gl);
  }
}

function buildAgumon() {
  const skin = toon(0xe08030, 0.1);
  const belly = toon(0xfff0d6, 0.06);
  const claw = toon(0xf4efe6, 0.04);
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), skin);
  torso.scale.set(1.15, 1.05, 0.95);
  torso.castShadow = true;
  g.add(torso);
  const tum = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), belly);
  tum.scale.set(0.95, 1.0, 0.5);
  tum.position.set(0, -0.02, 0.2);
  g.add(tum);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), skin);
  head.position.set(0, 0.4, 0.06);
  head.userData.baseY = 0.4;
  head.castShadow = true;
  g.add(head);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
  snout.scale.set(1.15, 0.7, 1.1);
  snout.position.set(0, 0.32, 0.28);
  g.add(snout);
  eyes(g, 0.1, 0.46, 0.26, 0x2ec44a, 0.075);
  const armG = new THREE.CapsuleGeometry(0.07, 0.1, 4, 6);
  const armL = new THREE.Mesh(armG, skin); armL.position.set(-0.32, 0.06, 0.05); armL.rotation.z = 0.4;
  const armR = new THREE.Mesh(armG.clone(), skin); armR.position.set(0.32, 0.06, 0.05); armR.rotation.z = -0.4;
  g.add(armL, armR);
  const legG = new THREE.CapsuleGeometry(0.085, 0.1, 4, 6);
  const legL = new THREE.Mesh(legG, skin); legL.position.set(-0.12, -0.34, 0.03);
  const legR = new THREE.Mesh(legG.clone(), skin); legR.position.set(0.12, -0.34, 0.03);
  g.add(legL, legR);
  const cg = new THREE.ConeGeometry(0.022, 0.08, 5);
  for (const [x, y, z] of [[-0.36, -0.08, 0.1], [0.36, -0.08, 0.1], [-0.12, -0.48, 0.12], [0.12, -0.48, 0.12]]) {
    const c = new THREE.Mesh(cg, claw);
    c.position.set(x, y, z); c.rotation.x = 1.05; g.add(c);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skin);
  tail.scale.set(0.75, 0.65, 1.55);
  tail.position.set(0, -0.04, -0.32);
  g.add(tail);
  g.scale.setScalar(1.05);
  g.position.y = 0.52;
  g.userData.parts = { torso, head, armL, armR, legL, legR, tail };
  return g;
}

function buildPatamon() {
  const cream = toon(0xf4e6cc, 0.08);
  const orange = toon(0xe88828, 0.1);
  const earM = toon(0xf07820, 0.08);
  earM.side = THREE.DoubleSide;
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), orange);
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), cream);
  head.position.set(0, 0.26, 0.06);
  head.userData.baseY = 0.26;
  g.add(head);
  eyes(g, 0.08, 0.3, 0.24, 0x3a7ad8, 0.07);
  const ear = new THREE.ConeGeometry(0.1, 0.28, 6);
  const earL = new THREE.Mesh(ear, earM); earL.position.set(-0.14, 0.42, 0); earL.rotation.z = 0.35;
  const earR = new THREE.Mesh(ear.clone(), earM); earR.position.set(0.14, 0.42, 0); earR.rotation.z = -0.35;
  g.add(earL, earR);
  const wing = new THREE.CircleGeometry(0.2, 6, 0, Math.PI);
  const wingL = new THREE.Mesh(wing, earM); wingL.position.set(-0.22, 0.06, -0.04); wingL.rotation.y = 0.6;
  const wingR = new THREE.Mesh(wing.clone(), earM); wingR.position.set(0.22, 0.06, -0.04); wingR.rotation.y = -0.6;
  g.add(wingL, wingR);
  const armL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), orange); armL.position.set(-0.22, 0, 0.08);
  const armR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), orange); armR.position.set(0.22, 0, 0.08);
  const legL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), orange); legL.position.set(-0.09, -0.24, 0.04);
  const legR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), orange); legR.position.set(0.09, -0.24, 0.04);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), orange); tail.position.set(0, -0.04, -0.26);
  g.add(armL, armR, legL, legR, tail);
  g.scale.setScalar(1.0);
  g.position.y = 0.72;
  g.userData.parts = { torso, head, armL, armR, legL, legR, tail, earL, earR, wingL, wingR };
  return g;
}

function buildWild(id) {
  const pal = { koromon: 0xffb0a0, nyaromon: 0xffd27a, bukamon: 0x7ac0ff }[id] || 0xcccccc;
  const m = toon(pal, 0.08);
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), m);
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m);
  head.position.set(0, 0.2, 0.05);
  head.userData.baseY = 0.2;
  g.add(head);
  eyes(g, 0.06, 0.22, 0.16, 0x222222, 0.05);
  const armL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), m); armL.position.set(-0.2, 0.02, 0.06);
  const armR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), m); armR.position.set(0.2, 0.02, 0.06);
  const legL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), m); legL.position.set(-0.08, -0.2, 0.03);
  const legR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), m); legR.position.set(0.08, -0.2, 0.03);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), m); tail.position.set(0, 0, -0.22);
  g.add(armL, armR, legL, legR, tail);
  g.position.y = 0.32;
  g.userData.parts = { torso, head, armL, armR, legL, legR, tail };
  return g;
}

function wrapGrounded(creature, scale) {
  const inner = creature.group;
  inner.scale.setScalar(scale);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  inner.position.y = -box.min.y;
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.userData.species = inner.name;
  wrap.userData.creature = creature;
  wrap.userData.parts = { torso: wrap, head: wrap };
  wrap.userData.grounded = true;
  return wrap;
}

export function buildDigimon(species) {
  if (species === 'agumon') {
    const model = wrapGrounded(buildFlaremon(), 2.8);
    model.userData.species = species;
    return model;
  }
  if (species === 'patamon') {
    const model = wrapGrounded(buildEarwingmon(), 2.4);
    model.userData.species = species;
    return model;
  }
  const model = buildWild(species);
  model.userData.species = species;
  return model;
}

export const DIGIMON_COLORS = {
  agumon: { body: 0xe08030, belly: 0xfff0d6, eyes: 0x2ec44a },
  patamon: { body: 0xf4e6cc, ears: 0xf07820, eyes: 0x3a7ad8 }
};
