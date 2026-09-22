import * as THREE from 'three';
import { metaSurface, boxProjectedUV, roundedBox, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import { makeRng, lerp, clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature } from './shared';
import { fixOutward, weldDecimate, markSculpt, ramp, buildEye, type MarkField } from './sculpt-util';

/**
 * MagnaAngemon — the Ultimate digivolution of Angemon.
 *
 * Angemon grown into a holy knight: white-gold armour plates over the robe,
 * a great golden sword (Excálibur) in hand, larger wings, a brighter halo.
 * Reads as "Angemon, ascended into a guardian knight".
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const ROBE = 0xf8f0dc;      // white robe
const ROBE_SHADOW = 0xc8b890; // shadow
const GOLD = 0xf0c040;      // bright gold armour
const GOLD_DARK = 0xb08820; // shadowed gold
const SKIN = 0xf0d8b8;      // face and hands
const HAIR = 0xd8a850;      // golden hair
const WING = 0xf8f2e0;      // feathers
const IRIS = 0x2a6fd0;      // blue eyes
const IRIS_EMISSIVE = 0x1a3f8a;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildMagnaAngemon(): Creature {
  const rig = createRig();
  rig.root.name = 'MagnaAngemon';
  rig.root.scale.setScalar(1.45); // Ultimate: tallest of the line

  /* ---- Materials --------------------------------------------------- */
  const robeC = new THREE.Color(ROBE);
  const shadowC = new THREE.Color(ROBE_SHADOW);

  const painted = creatureSkin({
    color: 0xffffff, subsurface: 0xd8c090, wrap: 0.07, rim: 0.02,
    roughness: 0.5, detail: 'none',
  });
  painted.vertexColors = true;
  painted.clearcoat = 0.12;
  painted.clearcoatRoughness = 0.6;
  painted.envMapIntensity = 0.12;
  painted.specularIntensity = 0.4;
  painted.specularColor = new THREE.Color(0xffe8b0);
  painted.roughnessMap = null;

  const baseCompile = painted.onBeforeCompile;
  painted.onBeforeCompile = (shader, renderer) => {
    baseCompile?.call(painted, shader, renderer);
    shader.uniforms.uRobe = { value: robeC };
    shader.uniforms.uShadow = { value: shadowC };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMark;\nvarying float vMark;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMark = aMark;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMark;\nuniform vec3 uRobe;\nuniform vec3 uShadow;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          float w = fwidth(vMark) * 1.5 + 0.048;
          float m = smoothstep(-w, w, vMark);
          diffuseColor.rgb *= mix(uRobe, uShadow, m);
        }
        `,
      );
  };
  painted.customProgramCacheKey = () => 'magnaangemon|marked';

  const plainSkin = creatureSkin({
    color: SKIN, subsurface: 0xd8b080, wrap: 0.06, rim: 0.018,
    roughness: 0.58, detail: 'none',
  });
  plainSkin.clearcoat = 0.1;
  plainSkin.envMapIntensity = 0.1;

  const goldMat = new THREE.MeshStandardMaterial({
    color: GOLD, roughness: 0.28, metalness: 0.6,
  });
  const goldDarkMat = new THREE.MeshStandardMaterial({
    color: GOLD_DARK, roughness: 0.35, metalness: 0.55,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: HAIR, roughness: 0.6, metalness: 0,
  });
  const featherMat = new THREE.MeshStandardMaterial({
    color: WING, roughness: 0.75, metalness: 0,
  });

  /* ---- Body: robed knight ------------------------------------------ */
  const bodyBalls: Ball[] = [
    { x: 0, y: 0.490, z: 0.000, r: 0.054, sy: 1.05 },                     // neck
    { x: 0, y: 0.440, z: 0.006, r: 0.076, sx: 1.05, sy: 0.95, sz: 0.86 },  // shoulders
    { x: 0, y: 0.390, z: 0.008, r: 0.070, sx: 0.92, sy: 0.94, sz: 0.88 },  // chest
    { x: 0, y: 0.320, z: 0.006, r: 0.062, sx: 0.80, sy: 1.00, sz: 0.84 },  // waist
    { x: 0, y: 0.240, z: 0.004, r: 0.072, sx: 1.05, sy: 0.96, sz: 0.94 },  // hips
    { x: 0, y: 0.160, z: 0.002, r: 0.062, sx: 1.10, sy: 0.86, sz: 0.98 },  // robe flare
    { x: 0, y: 0.080, z: -0.002, r: 0.052, sx: 1.16, sy: 0.82, sz: 1.00 }, // hem
    { x: 0, y: 0.320, z: 0.042, r: 0.032, sx: 0.5, sy: 1.4, strength: -0.5 },
    { x: 0, y: 0.490, z: 0.012, r: 0.036, sx: 0.9, sy: 0.5, sz: 0.9, strength: 0.55 },
  ];

  // Arms.
  for (const s of [1, -1]) {
    bodyBalls.push(
      { x: s * 0.082, y: 0.430, z: 0.010, r: 0.036 },
      { x: s * 0.104, y: 0.400, z: 0.016, r: 0.032 },
      { x: s * 0.118, y: 0.365, z: 0.022, r: 0.028 },   // elbow
      { x: s * 0.124, y: 0.330, z: 0.030, r: 0.024 },   // forearm
      { x: s * 0.126, y: 0.300, z: 0.038, r: 0.021, sy: 0.7 }, // hand
    );
  }

  // Legs / feet.
  for (const s of [1, -1]) {
    bodyBalls.push(
      { x: s * 0.032, y: 0.050, z: 0.002, r: 0.028 },
      { x: s * 0.036, y: 0.030, z: 0.022, r: 0.022, sy: 0.55, sz: 1.2 }, // foot
    );
  }

  const BODY_RES = 46;
  let bodyGeo = metaSurface(bodyBalls, { resolution: BODY_RES, smooth: 0.88, padding: 0.026 });
  fixOutward(bodyGeo, 'magnaangemon-body');
  bodyGeo = weldDecimate(bodyGeo, 0.010);
  bodyGeo.setAttribute('uv', boxProjectedUV(bodyGeo, 17));

  const bodyMark: MarkField = (_x, y, _z) => {
    if (y < 0.28) return 1;      // lower robe is shadow
    return -1;
  };
  markSculpt(bodyGeo, new THREE.Vector3(0, 0.28, 0), bodyMark, 0.20, 4);

  const body = new THREE.Mesh(bodyGeo, painted);
  body.castShadow = true;
  body.receiveShadow = true;
  rig.body.add(body);

  /* ---- Gold armour plates ------------------------------------------ */
  // Chest plate + shoulder pauldrons + belt.
  const chestPlate = new THREE.Mesh(roundedBox(0.11, 0.09, 0.05, 0.02, 2), goldMat);
  chestPlate.position.set(0, 0.40, 0.055);
  chestPlate.castShadow = true;
  rig.body.add(chestPlate);

  for (const s of [1, -1]) {
    const pauldron = new THREE.Mesh(roundedBox(0.07, 0.05, 0.09, 0.02, 2), goldDarkMat);
    pauldron.position.set(s * 0.075, 0.445, 0.01);
    pauldron.rotation.z = s * 0.3;
    pauldron.castShadow = true;
    rig.body.add(pauldron);
  }

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.01, 8, 16), goldMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.set(0, 0.305, 0.006);
  rig.body.add(belt);

  /* ---- Head -------------------------------------------------------- */
  rig.head.position.set(0, 0.540, 0.000);

  const headBalls: Ball[] = [
    { x: 0, y: 0.032, z: 0.000, r: 0.064, sx: 1.00, sy: 1.05, sz: 0.88 },  // cranium
    { x: 0, y: 0.000, z: 0.042, r: 0.050, sx: 0.94, sy: 0.92, sz: 0.94 },  // face
    { x: 0, y: -0.032, z: 0.032, r: 0.032, sx: 0.8, sy: 0.6, sz: 0.8 },    // jaw
    { x: 0, y: 0.012, z: -0.032, r: 0.046, sy: 1.05, sz: 0.8, strength: -0.4 }, // back
  ];

  const HEAD_RES = 44;
  let headGeo = metaSurface(headBalls, { resolution: HEAD_RES, smooth: 0.92, padding: 0.022 });
  fixOutward(headGeo, 'magnaangemon-head');
  headGeo = weldDecimate(headGeo, 0.008);
  headGeo.setAttribute('uv', boxProjectedUV(headGeo, 17));

  const head = new THREE.Mesh(headGeo, plainSkin);
  head.castShadow = true;
  head.receiveShadow = true;
  rig.head.add(head);

  // Gold circlet + hair.
  const hairGeo = new THREE.SphereGeometry(0.066, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.set(0, 0.042, -0.008);
  hair.scale.set(1.05, 1.0, 0.95);
  hair.castShadow = true;
  rig.head.add(hair);

  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.008, 8, 24), goldMat);
  circlet.position.set(0, 0.075, -0.004);
  circlet.rotation.x = 0.2;
  rig.head.add(circlet);

  // Halo — bigger and brighter than Angemon's.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 8, 24), goldMat);
  halo.position.set(0, 0.125, -0.002);
  halo.rotation.x = 0.25;
  rig.head.add(halo);

  /* ---- Eyes -------------------------------------------------------- */
  const EYE_W = 0.0210;
  const EYE_H = 0.0290;
  for (const s of [1, -1]) {
    const { holder, lid } = buildEye(EYE_W, EYE_H, s, 0.30, plainSkin, IRIS, IRIS_EMISSIVE);
    holder.position.set(s * 0.0270, 0.0210, 0.0520);
    rig.head.add(holder);
    rig.eyes.push(holder);
    rig.eyelids.push(lid);
  }

  /* ---- Wings ------------------------------------------------------- */
  const wing = (side: number): THREE.Group => {
    const g = new THREE.Group();
    const wingCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.11, 0.05, 0.02),
      new THREE.Vector3(side * 0.22, 0.12, -0.02),
      new THREE.Vector3(side * 0.31, 0.21, -0.06),
      new THREE.Vector3(side * 0.36, 0.30, -0.08),
    ]);
    const geo = new THREE.TubeGeometry(wingCurve, 14, 0.014, 6, false);
    const wingMesh = new THREE.Mesh(geo, featherMat);
    wingMesh.castShadow = true;
    g.add(wingMesh);

    for (let f = 0; f < 3; f++) {
      const a = 0.35 + f * 0.35;
      const fCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.07, 0.04, 0),
        new THREE.Vector3(side * (0.13 + f * 0.02), 0.07 + f * 0.03, a * 0.04 * side * 0.3),
        new THREE.Vector3(side * (0.22 + f * 0.03), 0.12 + f * 0.05, a * 0.06 * side * 0.3),
        new THREE.Vector3(side * (0.29 + f * 0.02), 0.16 + f * 0.08, a * 0.05 * side * 0.3),
      ]);
      const fGeo = new THREE.TubeGeometry(fCurve, 10, 0.010, 5, false);
      const fMesh = new THREE.Mesh(fGeo, featherMat);
      fMesh.castShadow = true;
      g.add(fMesh);
    }
    return g;
  };

  const wingL = wing(-1);
  wingL.position.set(-0.02, 0.45, -0.03);
  const wingR = wing(1);
  wingR.position.set(0.02, 0.45, -0.03);
  rig.body.add(wingL);
  rig.body.add(wingR);
  rig.extras.push(wingL, wingR);

  /* ---- Sword: Excálibur -------------------------------------------- */
  const sword = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xe8ecf4, roughness: 0.15, metalness: 0.9,
  });

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 0.006), bladeMat);
  blade.position.set(0.10, 0.16, 0.16);
  blade.rotation.z = 0.4;
  blade.castShadow = true;
  sword.add(blade);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 6), bladeMat);
  tip.position.set(0.178, 0.36, 0.16);
  tip.rotation.z = -0.4;
  tip.castShadow = true;
  sword.add(tip);

  const guard = new THREE.Mesh(roundedBox(0.09, 0.025, 0.02, 0.008, 2), goldMat);
  guard.position.set(0.085, 0.04, 0.16);
  guard.castShadow = true;
  sword.add(guard);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), goldDarkMat);
  grip.position.set(0.05, -0.01, 0.16);
  grip.rotation.z = 0.4;
  grip.castShadow = true;
  sword.add(grip);

  rig.body.add(sword);
  rig.extras.push(sword);

  /* ---- Performance ------------------------------------------------- */
  const anim = new IdleAnimator(rig, 110);
  const rnd = makeRng(808);
  let attention = 0;

  return {
    id: 'magnaangemon',
    name: 'MagnaAngemon',
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);
      const flap = Math.sin(elapsed * 0.9) * (0.05 + attention * 0.06);
      wingL.rotation.z = -0.25 + flap;
      wingR.rotation.z = 0.25 - flap;
      // Sword sways gently with the body.
      sword.rotation.z = Math.sin(elapsed * 0.7) * 0.02;
      rig.body.position.y = Math.sin(elapsed * 1.2) * 0.004;
      void rnd;
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}
