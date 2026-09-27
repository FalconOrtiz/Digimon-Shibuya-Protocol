import * as THREE from 'three';
import { metaSurface, boxProjectedUV, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import { makeRng, lerp, clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature } from './shared';
import { fixOutward, weldDecimate, markSculpt, ramp, buildEye, type MarkField } from './sculpt-util';

/**
 * Angemon — the Champion digivolution of Patamon.
 *
 * From a plush toy to a warrior angel: a slim robed humanoid with two great
 * feathered wings, a golden halo, and a calm, stern face. Keeps the cream and
 * orange family colours but brighter — white robe, gold trim. The read must
 * be "Patamon, but grown into a guardian".
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const ROBE = 0xf4ecd8;      // white-cream robe
const ROBE_SHADOW = 0xc8b890; // shadow
const GOLD = 0xe8b830;      // gold trim / halo
const SKIN = 0xf0d8b8;      // face and hands
const HAIR = 0xd8a850;      // golden hair
const WING = 0xf8f2e0;      // feathers
const IRIS = 0x2a6fd0;      // blue eyes
const IRIS_EMISSIVE = 0x1a3f8a;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildAngemon(): Creature {
  const rig = createRig();
  rig.root.name = 'Angemon';
  rig.root.scale.setScalar(1.25); // Champion: taller than the Rookie

  /* ---- Materials --------------------------------------------------- */
  const robeC = new THREE.Color(ROBE);
  const shadowC = new THREE.Color(ROBE_SHADOW);

  const painted = creatureSkin({
    color: 0xffffff, subsurface: 0xd8c090, wrap: 0.07, rim: 0.02,
    roughness: 0.55, detail: 'none',
  });
  painted.vertexColors = true;
  painted.clearcoat = 0.1;
  painted.clearcoatRoughness = 0.65;
  painted.envMapIntensity = 0.1;
  painted.specularIntensity = 0.35;
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
  painted.customProgramCacheKey = () => 'angemon|marked';

  const plainSkin = creatureSkin({
    color: SKIN, subsurface: 0xd8b080, wrap: 0.06, rim: 0.018,
    roughness: 0.6, detail: 'none',
  });
  plainSkin.clearcoat = 0.08;
  plainSkin.envMapIntensity = 0.08;

  const goldMat = new THREE.MeshStandardMaterial({
    color: GOLD, roughness: 0.35, metalness: 0.35,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: HAIR, roughness: 0.6, metalness: 0,
  });
  const featherMat = new THREE.MeshStandardMaterial({
    color: WING, roughness: 0.75, metalness: 0,
  });

  /* ---- Body: robed humanoid ---------------------------------------- */
  // Robe tapers to a hem, chest and shoulders read through the cloth.
  const bodyBalls: Ball[] = [
    { x: 0, y: 0.470, z: 0.000, r: 0.052, sy: 1.05 },                     // neck
    { x: 0, y: 0.420, z: 0.006, r: 0.072, sx: 1.05, sy: 0.95, sz: 0.86 },  // shoulders
    { x: 0, y: 0.370, z: 0.008, r: 0.066, sx: 0.92, sy: 0.94, sz: 0.88 },  // chest
    { x: 0, y: 0.300, z: 0.006, r: 0.058, sx: 0.80, sy: 1.00, sz: 0.84 },  // waist
    { x: 0, y: 0.220, z: 0.004, r: 0.068, sx: 1.05, sy: 0.96, sz: 0.94 },  // hips
    { x: 0, y: 0.140, z: 0.002, r: 0.058, sx: 1.10, sy: 0.86, sz: 0.98 },  // robe flare
    { x: 0, y: 0.060, z: -0.002, r: 0.048, sx: 1.16, sy: 0.82, sz: 1.00 }, // hem
    // robe front split (dark shadow line)
    { x: 0, y: 0.300, z: 0.040, r: 0.030, sx: 0.5, sy: 1.4, strength: -0.5 },
    // collar
    { x: 0, y: 0.470, z: 0.012, r: 0.034, sx: 0.9, sy: 0.5, sz: 0.9, strength: 0.55 },
  ];

  // Arms: slender, robed sleeves, hands forward.
  for (const s of [1, -1]) {
    bodyBalls.push(
      { x: s * 0.078, y: 0.410, z: 0.010, r: 0.034 },
      { x: s * 0.098, y: 0.380, z: 0.016, r: 0.030 },
      { x: s * 0.110, y: 0.345, z: 0.022, r: 0.026 },   // elbow
      { x: s * 0.116, y: 0.310, z: 0.030, r: 0.022 },   // forearm
      { x: s * 0.118, y: 0.280, z: 0.038, r: 0.019, sy: 0.7 }, // hand
    );
  }

  // Legs: robe covers them; only feet peek out.
  for (const s of [1, -1]) {
    bodyBalls.push(
      { x: s * 0.030, y: 0.030, z: 0.002, r: 0.026 },
      { x: s * 0.034, y: 0.012, z: 0.020, r: 0.020, sy: 0.55, sz: 1.2 }, // foot
    );
  }

  const BODY_RES = 44;
  let bodyGeo = metaSurface(bodyBalls, { resolution: BODY_RES, smooth: 0.88, padding: 0.026 });
  fixOutward(bodyGeo, 'angemon-body');
  bodyGeo = weldDecimate(bodyGeo, 0.010);
  bodyGeo.setAttribute('uv', boxProjectedUV(bodyGeo, 17));

  // Robe shading: darken the lower robe and the front split.
  const bodyMark: MarkField = (_x, y, _z) => {
    if (y < 0.26) return 1;      // lower robe is shadow
    return -1;
  };
  markSculpt(bodyGeo, new THREE.Vector3(0, 0.26, 0), bodyMark, 0.20, 4);

  const body = new THREE.Mesh(bodyGeo, painted);
  body.castShadow = true;
  body.receiveShadow = true;
  rig.body.add(body);

  // Gold trim belt.
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.052, 0.008, 8, 16),
    goldMat,
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.set(0, 0.285, 0.006);
  rig.body.add(belt);

  /* ---- Head -------------------------------------------------------- */
  rig.head.position.set(0, 0.520, 0.000);

  const headBalls: Ball[] = [
    { x: 0, y: 0.030, z: 0.000, r: 0.062, sx: 1.00, sy: 1.05, sz: 0.88 },  // cranium
    { x: 0, y: 0.000, z: 0.040, r: 0.048, sx: 0.94, sy: 0.92, sz: 0.94 },  // face
    { x: 0, y: -0.030, z: 0.030, r: 0.030, sx: 0.8, sy: 0.6, sz: 0.8 },    // jaw
    { x: 0, y: 0.010, z: -0.030, r: 0.044, sy: 1.05, sz: 0.8, strength: -0.4 }, // back of head
  ];

  const HEAD_RES = 44;
  let headGeo = metaSurface(headBalls, { resolution: HEAD_RES, smooth: 0.92, padding: 0.022 });
  fixOutward(headGeo, 'angemon-head');
  headGeo = weldDecimate(headGeo, 0.008);
  headGeo.setAttribute('uv', boxProjectedUV(headGeo, 17));

  const head = new THREE.Mesh(headGeo, plainSkin);
  head.castShadow = true;
  head.receiveShadow = true;
  rig.head.add(head);

  /* ---- Hair -------------------------------------------------------- */
  // Golden helmet of hair.
  const hairGeo = new THREE.SphereGeometry(0.064, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.set(0, 0.040, -0.008);
  hair.scale.set(1.05, 1.0, 0.95);
  hair.castShadow = true;
  rig.head.add(hair);

  /* ---- Halo -------------------------------------------------------- */
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.007, 8, 24),
    goldMat,
  );
  halo.position.set(0, 0.115, -0.002);
  halo.rotation.x = 0.25;
  rig.head.add(halo);

  /* ---- Eyes -------------------------------------------------------- */
  const EYE_W = 0.0200;
  const EYE_H = 0.0280;
  for (const s of [1, -1]) {
    const { holder, lid } = buildEye(EYE_W, EYE_H, s, 0.30, plainSkin, IRIS, IRIS_EMISSIVE);
    holder.position.set(s * 0.0260, 0.0200, 0.0500);
    rig.head.add(holder);
    rig.eyes.push(holder);
    rig.eyelids.push(lid);
  }

  /* ---- Wings ------------------------------------------------------- */
  // Two great feathered wings on the back — larger, with five feather
  // "fingers" fanning out, so Angemon reads as a guardian angel (POLISH S7).
  const wing = (side: number): THREE.Group => {
    const g = new THREE.Group();
    const wingCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.12, 0.05, 0.02),
      new THREE.Vector3(side * 0.24, 0.12, -0.02),
      new THREE.Vector3(side * 0.34, 0.21, -0.06),
      new THREE.Vector3(side * 0.39, 0.30, -0.08),
    ]);
    const geo = new THREE.TubeGeometry(wingCurve, 16, 0.014, 6, false);
    const wingMesh = new THREE.Mesh(geo, featherMat);
    wingMesh.castShadow = true;
    g.add(wingMesh);

    // Five feather "fingers" fanning from the wing root (was three).
    for (let f = 0; f < 5; f++) {
      const a = 0.2 + f * 0.3;
      const fCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.07, 0.04, 0),
        new THREE.Vector3(side * (0.13 + f * 0.02), 0.07 + f * 0.03, a * 0.04 * side * 0.3),
        new THREE.Vector3(side * (0.23 + f * 0.03), 0.12 + f * 0.05, a * 0.06 * side * 0.3),
        new THREE.Vector3(side * (0.31 + f * 0.02), 0.17 + f * 0.07, a * 0.05 * side * 0.3),
      ]);
      const fGeo = new THREE.TubeGeometry(fCurve, 10, 0.010, 5, false);
      const fMesh = new THREE.Mesh(fGeo, featherMat);
      fMesh.castShadow = true;
      g.add(fMesh);
    }
    return g;
  };

  const wingL = wing(-1);
  wingL.position.set(-0.02, 0.43, -0.03);
  const wingR = wing(1);
  wingR.position.set(0.02, 0.43, -0.03);
  rig.body.add(wingL);
  rig.body.add(wingR);
  rig.extras.push(wingL, wingR);

  /* ---- Performance ------------------------------------------------- */
  const anim = new IdleAnimator(rig, 88);
  const rnd = makeRng(606);
  let attention = 0;

  return {
    id: 'angemon',
    name: 'Angemon',
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);
      // Gentle wing breathing.
      const flap = Math.sin(elapsed * 0.9) * (0.05 + attention * 0.06);
      wingL.rotation.z = -0.25 + flap;
      wingR.rotation.z = 0.25 - flap;
      rig.body.position.y = Math.sin(elapsed * 1.2) * 0.004;
      void rnd;
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}
