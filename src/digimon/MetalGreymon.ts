import * as THREE from 'three';
import { metaSurface, boxProjectedUV, roundedBox, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import { makeRng, lerp, clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature } from './shared';
import { fixOutward, weldDecimate, markSculpt, ramp, buildEye, clawGeometry, type MarkField } from './sculpt-util';

/**
 * MetalGreymon — the Ultimate digivolution of Greymon.
 *
 * Greymon rebuilt with chrome: metal plates over the chest, a chrome jaw
 * brace, an arm cannon on the left arm, and a darker, bulkier frame. Reads
 * as "Greymon, armoured and upgraded" — the same silhouette, hardened.
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const SKIN = 0xa84a14;      // darker burnt orange
const SKIN_DARK = 0x6a2008; // shadow
const BELLY = 0x7a1408;     // deep red underbelly
const CLAW = 0xf4ead6;      // bone-white claws
const METAL = 0xb8bcc8;     // chrome steel
const METAL_DARK = 0x6a7078; // shadowed steel
const IRIS = 0x2fae4a;      // green eyes
const IRIS_EMISSIVE = 0x0e5a2c;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildMetalGreymon(): Creature {
  const rig = createRig();
  rig.root.name = 'MetalGreymon';
  rig.root.scale.setScalar(1.42); // Ultimate: the biggest of the line

  /* ---- Materials --------------------------------------------------- */
  const skinC = new THREE.Color(SKIN);
  const bellyC = new THREE.Color(BELLY);

  const painted = creatureSkin({
    color: 0xffffff, subsurface: 0x8a2008, wrap: 0.07, rim: 0.02,
    roughness: 0.5, detail: 'none',
  });
  painted.vertexColors = true;
  painted.clearcoat = 0.18;
  painted.clearcoatRoughness = 0.5;
  painted.envMapIntensity = 0.12;
  painted.specularIntensity = 0.45;
  painted.specularColor = new THREE.Color(0xff8a4a);
  painted.roughnessMap = null;

  const baseCompile = painted.onBeforeCompile;
  painted.onBeforeCompile = (shader, renderer) => {
    baseCompile?.call(painted, shader, renderer);
    shader.uniforms.uSkin = { value: skinC };
    shader.uniforms.uBelly = { value: bellyC };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMark;\nvarying float vMark;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMark = aMark;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMark;\nuniform vec3 uSkin;\nuniform vec3 uBelly;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          float w = fwidth(vMark) * 1.5 + 0.048;
          float m = smoothstep(-w, w, vMark);
          diffuseColor.rgb *= mix(uSkin, uBelly, m);
        }
        `,
      );
  };
  painted.customProgramCacheKey = () => 'metalgreymon|marked';

  const plainSkin = creatureSkin({
    color: SKIN, subsurface: 0x8a2008, wrap: 0.07, rim: 0.02,
    roughness: 0.52, detail: 'none',
  });
  plainSkin.clearcoat = 0.15;
  plainSkin.envMapIntensity = 0.12;

  const clawMat = new THREE.MeshPhysicalMaterial({
    color: CLAW, roughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.5, metalness: 0,
    sheen: 0.1, sheenRoughness: 0.9,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: METAL, roughness: 0.32, metalness: 0.85,
  });
  const metalDarkMat = new THREE.MeshStandardMaterial({
    color: METAL_DARK, roughness: 0.4, metalness: 0.8,
  });

  /* ---- Body -------------------------------------------------------- */
  // Bulkier than Greymon: wider chest, thicker thighs, heavier tail root.
  const bodyBalls: Ball[] = [
    { x: 0, y: 0.420, z: -0.012, r: 0.064, sy: 0.90 },                     // neck
    { x: 0, y: 0.360, z: 0.012, r: 0.120, sx: 1.10, sy: 0.96, sz: 0.88 },  // chest
    { x: 0, y: 0.298, z: 0.016, r: 0.100, sx: 0.98, sy: 0.90, sz: 0.92 },  // waist
    { x: 0, y: 0.240, z: 0.016, r: 0.118, sx: 1.04, sy: 0.94, sz: 0.98 },  // belly
    { x: 0, y: 0.170, z: -0.004, r: 0.116, sx: 1.14, sy: 0.82, sz: 0.96 }, // hips
    { x: 0, y: 0.188, z: -0.084, r: 0.072, sz: 1.14 },                     // tail root
    { x: 0.124, y: 0.300, z: 0.014, r: 0.062, sx: 0.90, sy: 1.25, sz: 1.05, strength: -0.54 },
    { x: -0.124, y: 0.300, z: 0.014, r: 0.062, sx: 0.90, sy: 1.25, sz: 1.05, strength: -0.54 },
    { x: 0, y: 0.462, z: -0.026, r: 0.100, sy: 0.28, strength: -0.62 },

    // arms: heavy, left one hosts the cannon
    { x: 0.110, y: 0.348, z: 0.008, r: 0.058 },
    { x: -0.110, y: 0.348, z: 0.008, r: 0.058 },
    { x: 0.152, y: 0.322, z: 0.016, r: 0.050 },
    { x: -0.152, y: 0.322, z: 0.016, r: 0.050 },
    { x: 0.186, y: 0.300, z: 0.034, r: 0.044 },                            // elbow
    { x: -0.186, y: 0.300, z: 0.034, r: 0.044 },
    { x: 0.212, y: 0.284, z: 0.058, r: 0.040 },                            // forearm
    { x: -0.212, y: 0.284, z: 0.058, r: 0.040 },
    { x: 0.230, y: 0.274, z: 0.082, r: 0.036 },                            // wrist
    { x: -0.230, y: 0.274, z: 0.082, r: 0.036 },
    { x: 0.240, y: 0.268, z: 0.106, r: 0.042, sy: 0.78, sz: 0.94 },        // palm
    { x: -0.240, y: 0.268, z: 0.106, r: 0.042, sy: 0.78, sz: 0.94 },
    { x: 0.104, y: 0.308, z: 0.016, r: 0.034, sx: 0.7, sy: 1.15, strength: -0.26 },
    { x: -0.104, y: 0.308, z: 0.016, r: 0.034, sx: 0.7, sy: 1.15, strength: -0.26 },

    // legs: powerful
    { x: 0.096, y: 0.142, z: -0.004, r: 0.072, sy: 1.02 },
    { x: -0.096, y: 0.142, z: -0.004, r: 0.072, sy: 1.02 },
    { x: 0.100, y: 0.096, z: 0.016, r: 0.054 },                            // knee
    { x: -0.100, y: 0.096, z: 0.016, r: 0.054 },
    { x: 0.102, y: 0.090, z: 0.040, r: 0.030, strength: 0.58 },            // kneecap
    { x: -0.102, y: 0.090, z: 0.040, r: 0.030, strength: 0.58 },
    { x: 0.100, y: 0.062, z: 0.020, r: 0.044 },                            // shin
    { x: -0.100, y: 0.062, z: 0.020, r: 0.044 },
    { x: 0.102, y: 0.038, z: 0.014, r: 0.030 },                            // ankle
    { x: -0.102, y: 0.038, z: 0.014, r: 0.030 },
    { x: 0.102, y: 0.016, z: -0.010, r: 0.034, sy: 0.58, sz: 0.84 },       // heel
    { x: -0.102, y: 0.016, z: -0.010, r: 0.034, sy: 0.58, sz: 0.84 },
    { x: 0.104, y: 0.015, z: 0.036, r: 0.038, sy: 0.50, sz: 1.00 },        // ball
    { x: -0.104, y: 0.015, z: 0.036, r: 0.038, sy: 0.50, sz: 1.00 },
    { x: 0.102, y: 0.034, z: -0.032, r: 0.030, sy: 0.9, strength: -0.34 },
    { x: -0.102, y: 0.034, z: -0.032, r: 0.030, sy: 0.9, strength: -0.34 },
    { x: 0, y: 0.078, z: 0.010, r: 0.062, sx: 0.42, sz: 1.4, strength: -0.60 },
  ];

  // Toes.
  const toeTips: THREE.Vector3[] = [];
  for (const s of [1, -1]) {
    for (const off of [-1, 0, 1]) {
      const px = 0.104 + off * 0.026;
      bodyBalls.push({ x: s * px, y: 0.014, z: 0.068, r: 0.018, sy: 0.66, sz: 1.20 });
      bodyBalls.push({ x: s * (px + off * 0.007), y: 0.013, z: 0.096, r: 0.015, sy: 0.62 });
      toeTips.push(new THREE.Vector3(s * (px + off * 0.012), 0.015, 0.112));
      if (off < 1) {
        bodyBalls.push({
          x: s * (px + 0.012), y: 0.014, z: 0.084, r: 0.016, sx: 0.40, sz: 1.6, strength: -0.46,
        });
      }
    }
  }

  const BODY_RES = 46;
  let bodyGeo = metaSurface(bodyBalls, { resolution: BODY_RES, smooth: 0.86, padding: 0.028 });
  fixOutward(bodyGeo, 'metalgreymon-body');
  bodyGeo = weldDecimate(bodyGeo, 0.011);
  bodyGeo.setAttribute('uv', boxProjectedUV(bodyGeo, 17));

  const BODY_AXIS: [number, number][] = [
    [0.034, 0.004], [0.114, 0.000], [0.178, -0.002], [0.240, 0.016],
    [0.298, 0.016], [0.360, 0.012], [0.462, -0.012],
  ];
  const BODY_HALF: [number, number][] = [
    [0.034, 0.00], [0.076, 0.34], [0.130, 0.58], [0.182, 0.74],
    [0.238, 0.82], [0.290, 0.80], [0.340, 0.70], [0.392, 0.54],
    [0.444, 0.32], [0.486, 0.00],
  ];
  const bodyMark: MarkField = (x, y, z) =>
    ramp(BODY_HALF, y) - Math.abs(Math.atan2(x, z - ramp(BODY_AXIS, y)));
  markSculpt(bodyGeo, new THREE.Vector3(0, 0.25, 0), bodyMark, 0.22, 4);

  const body = new THREE.Mesh(bodyGeo, painted);
  body.castShadow = true;
  body.receiveShadow = true;
  rig.body.add(body);

  // Toe claws.
  const footClaw = clawGeometry(0.032, 0.011);
  for (const p of toeTips) {
    const c = new THREE.Mesh(footClaw, clawMat);
    c.position.copy(p).add(new THREE.Vector3(0, 0.001, -0.011));
    c.rotation.set(Math.PI * 0.63, 0, 0);
    c.castShadow = true;
    rig.body.add(c);
  }

  /* ---- Chrome chest plate ------------------------------------------ */
  const chest = new THREE.Mesh(roundedBoxFor(0.16, 0.14, 0.1), metalMat);
  chest.position.set(0, 0.34, 0.075);
  chest.rotation.x = -0.15;
  chest.castShadow = true;
  rig.body.add(chest);

  const chestPlate = new THREE.Mesh(roundedBoxFor(0.13, 0.1, 0.02), metalDarkMat);
  chestPlate.position.set(0, 0.35, 0.135);
  chestPlate.castShadow = true;
  rig.body.add(chestPlate);

  /* ---- Left-arm cannon (the signature of MetalGreymon) -------------- */
  const cannon = new THREE.Group();
  const cannonBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.034, 0.16, 10),
    metalDarkMat,
  );
  cannonBarrel.rotation.z = Math.PI / 2;
  cannonBarrel.position.set(0.26, 0.30, 0.10);
  cannonBarrel.castShadow = true;
  cannon.add(cannonBarrel);
  const cannonMuzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 0.03, 10),
    metalMat,
  );
  cannonMuzzle.rotation.z = Math.PI / 2;
  cannonMuzzle.position.set(0.355, 0.30, 0.10);
  cannonMuzzle.castShadow = true;
  cannon.add(cannonMuzzle);
  rig.body.add(cannon);
  rig.extras.push(cannon);

  /* ---- Head -------------------------------------------------------- */
  // Angular, horned, chrome-jawed.
  rig.head.position.set(0, 0.512, 0.000);

  const headBalls: Ball[] = [
    { x: 0, y: 0.032, z: 0.000, r: 0.100, sx: 1.06, sy: 1.04, sz: 0.84 },   // cranium
    { x: 0, y: 0.012, z: -0.048, r: 0.060, sy: 0.96, sz: 0.62 },            // occiput
    { x: 0.068, y: 0.022, z: -0.002, r: 0.058, sy: 0.96 },                  // temples
    { x: -0.068, y: 0.022, z: -0.002, r: 0.058, sy: 0.96 },
    { x: 0.060, y: -0.032, z: 0.018, r: 0.054, sz: 0.98 },                  // cheeks
    { x: -0.060, y: -0.032, z: 0.018, r: 0.054, sz: 0.98 },
    { x: 0, y: -0.028, z: 0.056, r: 0.062, sx: 0.94, sy: 0.86, sz: 0.94 },  // muzzle root
    { x: 0, y: -0.024, z: 0.092, r: 0.050, sx: 0.86, sy: 0.78, sz: 0.92 },  // muzzle mid
    { x: 0, y: -0.010, z: 0.110, r: 0.040, sx: 0.82, sy: 0.74, sz: 0.72 },  // snout tip
    { x: 0, y: -0.058, z: 0.030, r: 0.055, sx: 1.00, sy: 0.56, sz: 1.00 },  // jaw
    { x: 0, y: -0.052, z: 0.080, r: 0.037, sx: 0.84, sy: 0.48, sz: 0.90 },  // lower lip
    { x: 0, y: -0.046, z: 0.100, r: 0.023, sx: 0.64, sy: 0.42, sz: 0.66 },  // chin
    { x: 0, y: -0.018, z: -0.066, r: 0.060, sy: 1.20, sz: 0.85, strength: -0.62 },
    { x: 0, y: -0.062, z: -0.042, r: 0.096, sy: 0.28, strength: -0.62 },
  ];

  const HEAD_RES = 48;
  let headGeo = metaSurface(headBalls, { resolution: HEAD_RES, smooth: 0.92, padding: 0.026 });
  fixOutward(headGeo, 'metalgreymon-head');
  headGeo = weldDecimate(headGeo, 0.0085);
  headGeo.setAttribute('uv', boxProjectedUV(headGeo, 17));

  const headMark: MarkField = (_x, y, _z, _nx, _ny, _nz) => {
    if (y < -0.042) return 1;      // jaw underside is red
    return -1;
  };
  markSculpt(headGeo, new THREE.Vector3(0, 0, 0.01), headMark, 0.20, 4);

  const head = new THREE.Mesh(headGeo, painted);
  head.castShadow = true;
  head.receiveShadow = true;
  rig.head.add(head);

  // Chrome jaw brace — the metal lower jaw.
  const jawBrace = new THREE.Mesh(roundedBoxFor(0.1, 0.035, 0.06), metalMat);
  jawBrace.position.set(0, -0.066, 0.06);
  jawBrace.castShadow = true;
  rig.head.add(jawBrace);

  // Horns.
  for (const s of [1, -1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.09, 8), metalDarkMat);
    horn.position.set(s * 0.044, 0.092, -0.030);
    horn.rotation.set(-0.5, 0, s * -0.35);
    horn.castShadow = true;
    rig.head.add(horn);
  }

  /* ---- Eyes -------------------------------------------------------- */
  const EYE_W = 0.0270;
  const EYE_H = 0.0380;
  for (const s of [1, -1]) {
    const { holder, lid } = buildEye(EYE_W, EYE_H, s, 0.30, plainSkin, IRIS, IRIS_EMISSIVE);
    holder.position.set(s * 0.0390, 0.0300, 0.0680);
    rig.head.add(holder);
    rig.eyes.push(holder);
    rig.eyelids.push(lid);
  }

  /* ---- Mouth: open jaw with teeth ---------------------------------- */
  const mouthGeo = new THREE.BufferGeometry();
  {
    const A = 1.35;
    const pos: number[] = [];
    const idx: number[] = [];
    const W = 18;
    const H = 3;
    const lipY = (a: number) => -0.042 + (1 - Math.cos(a)) * 0.032;
    const lipZ = (a: number) => 0.102 - Math.abs(Math.sin(a)) * 0.016;
    for (let j = 0; j <= H; j++) {
      for (let i = 0; i <= W; i++) {
        const a = lerp(-A, A, i / W);
        const t = j / H;
        pos.push(
          Math.sin(a) * 0.060,
          lipY(a) - t * 0.027,
          lipZ(a) - t * 0.035,
        );
      }
    }
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const r0 = j * (W + 1) + i;
        const r1 = r0 + W + 1;
        idx.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1);
      }
    }
    mouthGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mouthGeo.setIndex(idx);
    mouthGeo.computeVertexNormals();
  }
  const mouth = new THREE.Mesh(
    mouthGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0x3a0e04, roughness: 1.0, specularIntensity: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  mouth.castShadow = false;
  rig.head.add(mouth);

  // Fangs.
  const toothGeo = new THREE.ConeGeometry(0.008, 0.024, 6);
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xf8f0e0, roughness: 0.4 });
  for (const s of [-1, 1]) {
    for (const off of [-1, 0, 1]) {
      const tx = s * (0.017 + Math.abs(off) * 0.021);
      const up = new THREE.Mesh(toothGeo, toothMat);
      up.position.set(tx, -0.054, 0.092 + Math.abs(off) * 0.012);
      up.rotation.x = Math.PI;
      up.castShadow = true;
      rig.head.add(up);
      const low = new THREE.Mesh(toothGeo, toothMat);
      low.position.set(tx, -0.068, 0.088 + Math.abs(off) * 0.012);
      low.castShadow = true;
      rig.head.add(low);
    }
  }

  // Nostrils.
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x4a1806, roughness: 0.85 });
  for (const s of [1, -1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.0023, 8, 6), nostrilMat);
    n.position.set(s * 0.0125, 0.0000, 0.1240);
    n.scale.set(1, 0.8, 0.4);
    rig.head.add(n);
  }

  /* ---- Tail -------------------------------------------------------- */
  const tail = new THREE.Group();
  tail.position.set(0, 0.188, -0.084);
  rig.body.add(tail);
  rig.tail = tail;

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.026, -0.036, -0.062),
    new THREE.Vector3(0.070, -0.058, -0.120),
    new THREE.Vector3(0.132, -0.036, -0.168),
    new THREE.Vector3(0.192, 0.026, -0.194),
    new THREE.Vector3(0.230, 0.096, -0.196),
  ]);
  const TAIL_SEG = 24;
  const TAIL_RAD = 11;
  const TAIL_R0 = 0.062;
  const TAIL_TIP = 0.30;
  const tailEase = (t: number): number => t ** 1.55;
  const tailGeo = new THREE.TubeGeometry(tailCurve, TAIL_SEG, TAIL_R0, TAIL_RAD, false);
  {
    const pos = tailGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i <= TAIL_SEG; i++) {
      const t = i / TAIL_SEG;
      const s = 1.0 + (TAIL_TIP - 1.0) * tailEase(t);
      const c = tailCurve.getPoint(t);
      for (let j = 0; j <= TAIL_RAD; j++) {
        const idx = i * (TAIL_RAD + 1) + j;
        if (idx >= pos.count) break;
        pos.setXYZ(
          idx,
          c.x + (pos.getX(idx) - c.x) * s,
          c.y + (pos.getY(idx) - c.y) * s,
          c.z + (pos.getZ(idx) - c.z) * s,
        );
      }
    }
    tailGeo.computeVertexNormals();
  }
  tailGeo.setAttribute('uv', boxProjectedUV(tailGeo, 17));

  const tailMesh = new THREE.Mesh(tailGeo, painted);
  tailMesh.castShadow = true;
  tailMesh.receiveShadow = true;
  tail.add(tailMesh);

  /* ---- Performance ------------------------------------------------- */
  const anim = new IdleAnimator(rig, 99);
  const rnd = makeRng(707);
  let attention = 0;

  return {
    id: 'metalgreymon',
    name: 'MetalGreymon',
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);
      tail.rotation.y = Math.sin(elapsed * 0.7) * (0.08 + attention * 0.08);
      tail.rotation.x = Math.sin(elapsed * 1.0 + 0.6) * 0.04;
      tail.rotation.z = Math.sin(elapsed * 1.55) * 0.035;
      rig.body.position.y = Math.sin(elapsed * 1.2) * 0.004;
      void rnd;
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}

/** Rounded box helper (thin wrapper so the call sites read clearly). */
function roundedBoxFor(w: number, h: number, d: number): THREE.BufferGeometry {
  return roundedBox(w, h, d, Math.min(w, h, d) * 0.18, 2);
}
