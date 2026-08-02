// src/digimon/models.js — fábrica de digimons chibi procedurales.
// Low-poly construido con primitivas (sin esqueletos): cuerpo redondeado,
// cabeza grande, extremidades cortas. Las partes quedan referenciadas para
// animarlas por código (anim.js).
//
// Estilo: SD / chibi — cabeza ~40% del alto, ojos grandes, cola y orejas
// reconocibles por especie.

import * as THREE from 'three';

const SKIN = {
  agumon: {
    // Prompt: naranja brillante, OJOS VERDES grandes, hocico corto con dientes blancos,
    // garras blancas afiladas, cola corta y rechoncha
    body: 0xe08030, belly: 0xffe0b0, dark: 0xb06020,
    eyes: 0x2ec44a, eyeHighlight: 0xffffff,
    scale: 1.0, yOff: 0.55
  },
  patamon: {
    // Prompt: CREMA y naranja, OJOS AZULES grandes, orejas naranja tipo ala de
    // murciélago, manos y pies NEGROS pequeños, cola corta, flotando
    body: 0xf0e0c8, belly: 0xfff6e0, dark: 0xd07030,
    ears: 0xe08030, eyes: 0x3a7ad8, eyeHighlight: 0xffffff,
    limbs: 0x20242c,   // manos y pies negros
    scale: 0.95, yOff: 0.5
  }
};

function std(color, rough = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.0 });
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---- Agumon: dinosaurio naranja rechoncho ----
function buildAgumon(s = SKIN.agumon) {
  const g = new THREE.Group();
  const parts = {};
  const body = std(s.body), belly = std(s.belly), dark = std(s.dark), eyeM = std(s.eyes, 0.3);

  // cuerpo
  const torso = mesh(new THREE.SphereGeometry(0.55, 18, 14), body);
  torso.scale.set(1, 0.92, 0.95);
  g.add(torso);
  parts.torso = torso;

  // barriga crema
  const tum = mesh(new THREE.SphereGeometry(0.42, 14, 10), belly);
  tum.scale.set(0.95, 0.8, 0.6);
  tum.position.set(0, -0.05, 0.34);
  g.add(tum);

  // cabeza (grande, chibi)
  const head = mesh(new THREE.SphereGeometry(0.42, 18, 14), body);
  head.position.set(0, 0.75, 0.06);
  head.scale.set(1, 1.05, 0.95);
  g.add(head);
  parts.head = head;

  // cresta de Agumon (3 picos)
  const crestMat = std(s.body);
  for (let i = 0; i < 3; i++) {
    const spike = mesh(new THREE.ConeGeometry(0.09 + i * 0.015, 0.3, 6), crestMat);
    spike.position.set((i - 1) * 0.12, 1.16, -0.05 + i * 0.02);
    spike.rotation.x = 0.25;
    g.add(spike);
  }

  // hocico
  const snout = mesh(new THREE.SphereGeometry(0.2, 12, 10), body);
  snout.scale.set(1, 0.8, 1.1);
  snout.position.set(0, 0.66, 0.42);
  g.add(snout);

  // dientes
  const teeth = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.06), std(0xf5f5f0, 0.4));
  teeth.position.set(0, 0.58, 0.52);
  g.add(teeth);

  // ojos grandes (VERDES para Agumon, según prompt)
  const eyeGeo = new THREE.SphereGeometry(0.085, 10, 8);
  const eyeL = mesh(eyeGeo, eyeM); eyeL.position.set(-0.17, 0.82, 0.38); g.add(eyeL);
  const eyeR = mesh(eyeGeo.clone(), eyeM); eyeR.position.set(0.17, 0.82, 0.38); g.add(eyeR);
  // brillo
  const glint = std(s.eyeHighlight, 0.2);
  const gl = mesh(new THREE.SphereGeometry(0.028, 6, 6), glint);
  gl.position.set(-0.14, 0.85, 0.46); g.add(gl);
  const gr = mesh(new THREE.SphereGeometry(0.028, 6, 6), glint);
  gr.position.set(0.2, 0.85, 0.46); g.add(gr);

  // brazos cortos
  const armL = mesh(new THREE.SphereGeometry(0.16, 10, 8), body);
  armL.position.set(-0.55, 0.25, 0.1); g.add(armL);
  const armR = mesh(new THREE.SphereGeometry(0.16, 10, 8), body);
  armR.position.set(0.55, 0.25, 0.1); g.add(armR);
  // garras blancas afiladas (prompt)
  const clawL = mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), std(0xf8f8f2));
  clawL.position.set(-0.55, 0.11, 0.15); g.add(clawL);
  const clawR = mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), std(0xf8f8f2));
  clawR.position.set(0.55, 0.11, 0.15); g.add(clawR);
  parts.armL = armL; parts.armR = armR; parts.clawL = clawL; parts.clawR = clawR;

  // piernas
  const legGeo = new THREE.SphereGeometry(0.18, 10, 8);
  const legL = mesh(legGeo, body); legL.scale.set(1, 0.7, 1); legL.position.set(-0.24, -0.42, 0.08); g.add(legL);
  const legR = mesh(legGeo.clone(), body); legR.scale.set(1, 0.7, 1); legR.position.set(0.24, -0.42, 0.08); g.add(legR);
  parts.legL = legL; parts.legR = legR;

  // cola gruesa
  const tail = mesh(new THREE.SphereGeometry(0.14, 10, 8), dark);
  tail.scale.set(1.6, 1, 1);
  tail.position.set(0, 0.1, -0.62);
  g.add(tail);
  parts.tail = tail;

  g.scale.setScalar(s.scale);
  g.position.y = s.yOff;
  g.userData.parts = parts;
  return g;
}

// ---- Patamon: cría alada amarilla ----
function buildPatamon(s = SKIN.patamon) {
  const g = new THREE.Group();
  const parts = {};
  const body = std(s.body), belly = std(s.belly), dark = std(s.dark), eyeM = std(s.eyes, 0.3);

  // cuerpo (casi esfera)
  const torso = mesh(new THREE.SphereGeometry(0.52, 18, 14), body);
  torso.scale.set(1, 1.02, 0.96);
  g.add(torso);
  parts.torso = torso;

  // barriga
  const tum = mesh(new THREE.SphereGeometry(0.4, 14, 10), belly);
  tum.scale.set(0.9, 0.78, 0.55);
  tum.position.set(0, -0.08, 0.34);
  g.add(tum);

  // cabeza (fundida con el cuerpo, orejas arriba)
  const head = mesh(new THREE.SphereGeometry(0.36, 16, 12), body);
  head.position.set(0, 0.62, 0.1);
  g.add(head);
  parts.head = head;

  // orejas grandes naranja tipo ala de murciélago (prompt: Wing-Ear Mammal)
  const earGeo = new THREE.ConeGeometry(0.15, 0.48, 8);
  const earL = mesh(earGeo, std(s.ears));
  earL.position.set(-0.26, 1.02, -0.02);
  earL.rotation.z = 0.35;
  g.add(earL);
  const earR = mesh(earGeo.clone(), std(s.ears));
  earR.position.set(0.26, 1.02, -0.02);
  earR.rotation.z = -0.35;
  g.add(earR);
  parts.earL = earL; parts.earR = earR;

  // cara: ojos gigantes AZULES (prompt)
  const eyeGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const eyeL = mesh(eyeGeo, std(s.eyes, 0.2)); eyeL.position.set(-0.16, 0.68, 0.36); g.add(eyeL);
  const eyeR = mesh(eyeGeo.clone(), std(s.eyes, 0.2)); eyeR.position.set(0.16, 0.68, 0.36); g.add(eyeR);
  const glint = std(s.eyeHighlight, 0.2);
  const gl = mesh(new THREE.SphereGeometry(0.032, 6, 6), glint);
  gl.position.set(-0.12, 0.71, 0.44); g.add(gl);
  const gr = mesh(new THREE.SphereGeometry(0.032, 6, 6), glint);
  gr.position.set(0.2, 0.71, 0.44); g.add(gr);

  // pico/boca pequeña
  const mouth = mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), std(0xd94a3a, 0.5));
  mouth.position.set(0, 0.56, 0.42);
  g.add(mouth);

  // brazos cortitos NEGROS (prompt: tiny black hands)
  const limbMat = std(s.limbs);
  const armL = mesh(new THREE.SphereGeometry(0.13, 10, 8), limbMat);
  armL.position.set(-0.48, 0.18, 0.12); g.add(armL);
  const armR = mesh(new THREE.SphereGeometry(0.13, 10, 8), limbMat);
  armR.position.set(0.48, 0.18, 0.12); g.add(armR);
  parts.armL = armL; parts.armR = armR;

  // piernas NEGRAS pequeñas (prompt)
  const legGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const legL = mesh(legGeo, limbMat); legL.scale.set(1, 0.7, 1); legL.position.set(-0.2, -0.4, 0.1); g.add(legL);
  const legR = mesh(legGeo.clone(), limbMat); legR.scale.set(1, 0.7, 1); legR.position.set(0.2, -0.4, 0.1); g.add(legR);
  parts.legL = legL; parts.legR = legR;

  // cola corta (prompt)
  const tail = mesh(new THREE.SphereGeometry(0.09, 8, 6), std(s.dark));
  tail.scale.set(1.3, 1, 1);
  tail.position.set(0, 0.05, -0.55);
  g.add(tail);
  parts.tail = tail;

  g.scale.setScalar(s.scale);
  g.position.y = s.yOff;
  g.userData.parts = parts;
  return g;
}

// ---- factory ----
export function buildDigimon(species) {
  const model = species === 'agumon' ? buildAgumon(SKIN.agumon) : buildPatamon(SKIN.patamon);
  model.userData.species = species;
  return model;
}

export const DIGIMON_COLORS = SKIN;
