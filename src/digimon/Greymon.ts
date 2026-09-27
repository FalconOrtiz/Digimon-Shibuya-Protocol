import * as THREE from 'three';
import { metaSurface, boxProjectedUV, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import { makeRng, lerp, clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature } from './shared';
import { fixOutward, weldDecimate, markSculpt, ramp, buildEye, clawGeometry, type MarkField } from './sculpt-util';

/**
 * Greymon — the Champion digivolution of Agumon.
 *
 * Bigger, meaner, armoured: a heavy theropod silhouette with a horned crest,
 * a jaw full of teeth, thick claws and a muscular tail. Keeps the orange
 * family colours but darker, with a deep red underbelly and bone-white claws.
 * The read must be "Agumon, but grown up and dangerous".
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const SKIN = 0xc05a1a;      // darker burnt orange
const SKIN_DARK = 0x7a2c0a; // shadow
const BELLY = 0x8a1a0a;     // deep red underbelly
const CLAW = 0xf4ead6;      // bone-white claws
const HORN = 0xe8e0d0;      // horn/crest
const IRIS = 0x2fae4a;      // green eyes
const IRIS_EMISSIVE = 0x0e5a2c;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildGreymon(): Creature {
  const rig = createRig();
  rig.root.name = 'Greymon';
  rig.root.scale.setScalar(1.22); // Champion: clearly bigger than the Rookie

  /* ---- Materials --------------------------------------------------- */
  const skinC = new THREE.Color(SKIN);
  const bellyC = new THREE.Color(BELLY);

  const painted = creatureSkin({
    color: 0xffffff, subsurface: 0x9a2c0a, wrap: 0.07, rim: 0.02,
    roughness: 0.55, detail: 'none',
  });
  painted.vertexColors = true;
  painted.clearcoat = 0.12;
  painted.clearcoatRoughness = 0.6;
  painted.envMapIntensity = 0.08;
  painted.specularIntensity = 0.4;
  painted.specularColor = new THREE.Color(0xff9a5a);
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
  painted.customProgramCacheKey = () => 'greymon|marked';

  const plainSkin = creatureSkin({
    color: SKIN, subsurface: 0x9a2c0a, wrap: 0.07, rim: 0.02,
    roughness: 0.58, detail: 'none',
  });
  plainSkin.clearcoat = 0.1;
  plainSkin.envMapIntensity = 0.08;

  const clawMat = new THREE.MeshPhysicalMaterial({
    color: CLAW, roughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.5, metalness: 0,
    sheen: 0.1, sheenRoughness: 0.9,
  });
  const hornMat = new THREE.MeshStandardMaterial({
    color: HORN, roughness: 0.45, metalness: 0,
  });

  /* ---- Body -------------------------------------------------------- */
  // Heavy theropod: deep chest, thick hips, powerful thighs. Scale is 1.22
  // overall so the silhouette dwarfs the Rookie's.
  const bodyBalls: Ball[] = [
    { x: 0, y: 0.400, z: -0.010, r: 0.060, sy: 0.90 },                     // neck
    { x: 0, y: 0.340, z: 0.012, r: 0.112, sx: 1.06, sy: 0.94, sz: 0.88 },  // chest
    { x: 0, y: 0.282, z: 0.016, r: 0.094, sx: 0.96, sy: 0.88, sz: 0.92 },  // waist
    { x: 0, y: 0.226, z: 0.016, r: 0.112, sx: 1.02, sy: 0.92, sz: 0.98 },  // belly
    { x: 0, y: 0.160, z: -0.004, r: 0.110, sx: 1.12, sy: 0.80, sz: 0.96 }, // hips
    { x: 0, y: 0.178, z: -0.078, r: 0.068, sz: 1.14 },                     // tail root
    // waist pinch
    { x: 0.118, y: 0.284, z: 0.014, r: 0.058, sx: 0.90, sy: 1.25, sz: 1.05, strength: -0.54 },
    { x: -0.118, y: 0.284, z: 0.014, r: 0.058, sx: 0.90, sy: 1.25, sz: 1.05, strength: -0.54 },
    // neck notch
    { x: 0, y: 0.440, z: -0.024, r: 0.094, sy: 0.28, strength: -0.62 },

    // arms: heavier, clawed, posed forward
    { x: 0.104, y: 0.330, z: 0.008, r: 0.054 },
    { x: -0.104, y: 0.330, z: 0.008, r: 0.054 },
    { x: 0.144, y: 0.306, z: 0.016, r: 0.046 },
    { x: -0.144, y: 0.306, z: 0.016, r: 0.046 },
    { x: 0.176, y: 0.284, z: 0.032, r: 0.040 },                            // elbow
    { x: -0.176, y: 0.284, z: 0.032, r: 0.040 },
    { x: 0.200, y: 0.268, z: 0.056, r: 0.036 },                            // forearm
    { x: -0.200, y: 0.268, z: 0.056, r: 0.036 },
    { x: 0.216, y: 0.258, z: 0.078, r: 0.032 },                            // wrist
    { x: -0.216, y: 0.258, z: 0.078, r: 0.032 },
    { x: 0.226, y: 0.252, z: 0.100, r: 0.038, sy: 0.78, sz: 0.94 },        // palm
    { x: -0.226, y: 0.252, z: 0.100, r: 0.038, sy: 0.78, sz: 0.94 },
    { x: 0.098, y: 0.292, z: 0.016, r: 0.032, sx: 0.7, sy: 1.15, strength: -0.26 }, // shoulder notch
    { x: -0.098, y: 0.292, z: 0.016, r: 0.032, sx: 0.7, sy: 1.15, strength: -0.26 },

    // legs: powerful thighs -> knee -> shin -> foot
    { x: 0.090, y: 0.136, z: -0.004, r: 0.068, sy: 1.02 },
    { x: -0.090, y: 0.136, z: -0.004, r: 0.068, sy: 1.02 },
    { x: 0.094, y: 0.092, z: 0.016, r: 0.050 },                            // knee
    { x: -0.094, y: 0.092, z: 0.016, r: 0.050 },
    { x: 0.096, y: 0.086, z: 0.038, r: 0.028, strength: 0.58 },            // kneecap
    { x: -0.096, y: 0.086, z: 0.038, r: 0.028, strength: 0.58 },
    { x: 0.094, y: 0.060, z: 0.020, r: 0.040 },                            // shin
    { x: -0.094, y: 0.060, z: 0.020, r: 0.040 },
    { x: 0.096, y: 0.036, z: 0.014, r: 0.028 },                            // ankle
    { x: -0.096, y: 0.036, z: 0.014, r: 0.028 },
    { x: 0.096, y: 0.016, z: -0.010, r: 0.032, sy: 0.58, sz: 0.84 },       // heel
    { x: -0.096, y: 0.016, z: -0.010, r: 0.032, sy: 0.58, sz: 0.84 },
    { x: 0.098, y: 0.015, z: 0.034, r: 0.036, sy: 0.50, sz: 1.00 },        // ball
    { x: -0.098, y: 0.015, z: 0.034, r: 0.036, sy: 0.50, sz: 1.00 },
    { x: 0.096, y: 0.034, z: -0.030, r: 0.028, sy: 0.9, strength: -0.34 },
    { x: -0.096, y: 0.034, z: -0.030, r: 0.028, sy: 0.9, strength: -0.34 },
    { x: 0, y: 0.074, z: 0.010, r: 0.058, sx: 0.42, sz: 1.4, strength: -0.60 },
  ];

  // Toes with bone claws.
  const toeTips: THREE.Vector3[] = [];
  for (const s of [1, -1]) {
    for (const off of [-1, 0, 1]) {
      const px = 0.098 + off * 0.024;
      bodyBalls.push({ x: s * px, y: 0.014, z: 0.064, r: 0.017, sy: 0.66, sz: 1.20 });
      bodyBalls.push({ x: s * (px + off * 0.007), y: 0.013, z: 0.090, r: 0.014, sy: 0.62 });
      toeTips.push(new THREE.Vector3(s * (px + off * 0.012), 0.015, 0.105));
      if (off < 1) {
        bodyBalls.push({
          x: s * (px + 0.012), y: 0.014, z: 0.080, r: 0.015, sx: 0.40, sz: 1.6, strength: -0.46,
        });
      }
    }
  }

  const BODY_RES = 44;
  let bodyGeo = metaSurface(bodyBalls, { resolution: BODY_RES, smooth: 0.86, padding: 0.028 });
  fixOutward(bodyGeo, 'greymon-body');
  bodyGeo = weldDecimate(bodyGeo, 0.011);
  bodyGeo.setAttribute('uv', boxProjectedUV(bodyGeo, 17));

  // Deep red underbelly field.
  const BODY_AXIS: [number, number][] = [
    [0.032, 0.004], [0.108, 0.000], [0.168, -0.002], [0.226, 0.016],
    [0.282, 0.016], [0.340, 0.012], [0.440, -0.010],
  ];
  const BODY_HALF: [number, number][] = [
    [0.032, 0.00], [0.072, 0.34], [0.122, 0.58], [0.172, 0.74],
    [0.224, 0.82], [0.274, 0.80], [0.322, 0.70], [0.370, 0.54],
    [0.420, 0.32], [0.462, 0.00],
  ];
  const bodyMark: MarkField = (x, y, z) =>
    ramp(BODY_HALF, y) - Math.abs(Math.atan2(x, z - ramp(BODY_AXIS, y)));
  markSculpt(bodyGeo, new THREE.Vector3(0, 0.24, 0), bodyMark, 0.22, 4);

  const body = new THREE.Mesh(bodyGeo, painted);
  body.castShadow = true;
  body.receiveShadow = true;
  rig.body.add(body);

  // Toe claws.
  const footClaw = clawGeometry(0.030, 0.010);
  for (const p of toeTips) {
    const c = new THREE.Mesh(footClaw, clawMat);
    c.position.copy(p).add(new THREE.Vector3(0, 0.001, -0.010));
    c.rotation.set(Math.PI * 0.63, 0, 0);
    c.castShadow = true;
    rig.body.add(c);
  }

  /* ---- Back plates (signature ridges) ------------------------------- */
  // Three bone plates running down the spine — the Greymon read: a crest of
  // plating from neck to tail, distinct from Agumon's smooth back.
  const plateMat = new THREE.MeshStandardMaterial({
    color: HORN, roughness: 0.5, metalness: 0.05,
  });
  const plate = (y: number, z: number, w: number, h: number) => {
    const p = new THREE.Mesh(
      new THREE.ConeGeometry(w, h, 6),
      plateMat,
    );
    p.position.set(0, y, z);
    p.rotation.x = -0.35;
    p.castShadow = true;
    rig.body.add(p);
  };
  plate(0.46, -0.02, 0.028, 0.09);   // neck
  plate(0.40, -0.06, 0.026, 0.08);   // upper back
  plate(0.33, -0.10, 0.024, 0.075);  // mid back
  plate(0.26, -0.12, 0.022, 0.065);  // lower back
  plate(0.19, -0.13, 0.020, 0.055);  // tail base

  /* ---- Head -------------------------------------------------------- */
  // Angular, horned, aggressive: tall crest, wide cheeks, strong jaw.
  rig.head.position.set(0, 0.492, 0.000);

  const headBalls: Ball[] = [
    { x: 0, y: 0.030, z: 0.000, r: 0.096, sx: 1.06, sy: 1.04, sz: 0.84 },   // cranium
    { x: 0, y: 0.010, z: -0.046, r: 0.058, sy: 0.96, sz: 0.62 },            // occiput
    { x: 0.066, y: 0.020, z: -0.002, r: 0.056, sy: 0.96 },                  // temples
    { x: -0.066, y: 0.020, z: -0.002, r: 0.056, sy: 0.96 },
    { x: 0.058, y: -0.030, z: 0.018, r: 0.052, sz: 0.98 },                  // cheeks
    { x: -0.058, y: -0.030, z: 0.018, r: 0.052, sz: 0.98 },
    // Snout — longer and stronger than the Rookie's
    { x: 0, y: -0.026, z: 0.054, r: 0.060, sx: 0.94, sy: 0.86, sz: 0.94 },  // muzzle root
    { x: 0, y: -0.022, z: 0.088, r: 0.048, sx: 0.86, sy: 0.78, sz: 0.92 },  // muzzle mid
    { x: 0, y: -0.010, z: 0.106, r: 0.038, sx: 0.82, sy: 0.74, sz: 0.72 },  // snout tip
    // Jaw — broad and heavy
    { x: 0, y: -0.056, z: 0.028, r: 0.053, sx: 1.00, sy: 0.56, sz: 1.00 },  // jaw
    { x: 0, y: -0.050, z: 0.076, r: 0.035, sx: 0.84, sy: 0.48, sz: 0.90 },  // lower lip
    { x: 0, y: -0.044, z: 0.096, r: 0.022, sx: 0.64, sy: 0.42, sz: 0.66 },  // chin
    // back-of-skull carve + neck notch
    { x: 0, y: -0.016, z: -0.064, r: 0.058, sy: 1.20, sz: 0.85, strength: -0.62 },
    { x: 0, y: -0.060, z: -0.040, r: 0.092, sy: 0.28, strength: -0.62 },
  ];

  const HEAD_RES = 48;
  let headGeo = metaSurface(headBalls, { resolution: HEAD_RES, smooth: 0.92, padding: 0.026 });
  fixOutward(headGeo, 'greymon-head');
  headGeo = weldDecimate(headGeo, 0.0085);
  headGeo.setAttribute('uv', boxProjectedUV(headGeo, 17));

  const headMark: MarkField = (_x, y, _z, _nx, _ny, _nz) => {
    if (y < -0.040) return 1;      // jaw underside is red
    return -1;
  };
  markSculpt(headGeo, new THREE.Vector3(0, 0, 0.01), headMark, 0.20, 4);

  const head = new THREE.Mesh(headGeo, painted);
  head.castShadow = true;
  head.receiveShadow = true;
  rig.head.add(head);

  /* ---- Horns ------------------------------------------------------- */
  // Greymon's badge: two long swept-back horns plus a smaller brow pair,
  // giving the silhouette real horns instead of Agumon's stubs.
  for (const s of [1, -1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.14, 8), hornMat);
    horn.position.set(s * 0.052, 0.095, -0.030);
    horn.rotation.set(-0.65, 0, s * -0.4);
    horn.castShadow = true;
    rig.head.add(horn);
    // Secondary brow horn, shorter and forward-leaning.
    const brow = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.07, 8), hornMat);
    brow.position.set(s * 0.036, 0.058, -0.008);
    brow.rotation.set(0.25, 0, s * -0.22);
    brow.castShadow = true;
    rig.head.add(brow);
  }
  // Nasal ridge — a single crest horn on the snout for the aggressive read.
  const nasal = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.06, 8), hornMat);
  nasal.position.set(0, 0.028, 0.052);
  nasal.rotation.set(0.9, 0, 0);
  nasal.castShadow = true;
  rig.head.add(nasal);

  /* ---- Eyes -------------------------------------------------------- */
  const EYE_W = 0.0260;
  const EYE_H = 0.0370;
  for (const s of [1, -1]) {
    const { holder, lid } = buildEye(EYE_W, EYE_H, s, 0.30, plainSkin, IRIS, IRIS_EMISSIVE);
    holder.position.set(s * 0.0380, 0.0280, 0.0660);
    rig.head.add(holder);
    rig.eyes.push(holder);
    rig.eyelids.push(lid);
  }

  /* ---- Mouth: open jaw with teeth ---------------------------------- */
  // A dark open mouth with white fangs — reads "predator".
  const mouthGeo = new THREE.BufferGeometry();
  {
    const A = 1.35;
    const pos: number[] = [];
    const idx: number[] = [];
    const W = 18;
    const H = 3;
    const lipY = (a: number) => -0.040 + (1 - Math.cos(a)) * 0.030;
    const lipZ = (a: number) => 0.098 - Math.abs(Math.sin(a)) * 0.016;
    for (let j = 0; j <= H; j++) {
      for (let i = 0; i <= W; i++) {
        const a = lerp(-A, A, i / W);
        const t = j / H;
        pos.push(
          Math.sin(a) * 0.058,
          lipY(a) - t * 0.026,
          lipZ(a) - t * 0.034,
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
      color: 0x4a1206, roughness: 1.0, specularIntensity: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  mouth.castShadow = false;
  rig.head.add(mouth);

  // Upper and lower fangs.
  const toothGeo = new THREE.ConeGeometry(0.008, 0.022, 6);
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xf8f0e0, roughness: 0.4 });
  for (const s of [-1, 1]) {
    for (const off of [-1, 0, 1]) {
      const tx = s * (0.016 + Math.abs(off) * 0.020);
      const up = new THREE.Mesh(toothGeo, toothMat);
      up.position.set(tx, -0.052, 0.088 + Math.abs(off) * 0.012);
      up.rotation.x = Math.PI;
      up.castShadow = true;
      rig.head.add(up);
      const low = new THREE.Mesh(toothGeo, toothMat);
      low.position.set(tx, -0.066, 0.084 + Math.abs(off) * 0.012);
      low.castShadow = true;
      rig.head.add(low);
    }
  }

  // Nostrils.
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x5a2008, roughness: 0.85 });
  for (const s of [1, -1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), nostrilMat);
    n.position.set(s * 0.0120, 0.0000, 0.1200);
    n.scale.set(1, 0.8, 0.4);
    rig.head.add(n);
  }

  /* ---- Tail -------------------------------------------------------- */
  const tail = new THREE.Group();
  tail.position.set(0, 0.178, -0.078);
  rig.body.add(tail);
  rig.tail = tail;

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.024, -0.034, -0.058),
    new THREE.Vector3(0.066, -0.054, -0.112),
    new THREE.Vector3(0.124, -0.034, -0.158),
    new THREE.Vector3(0.180, 0.024, -0.182),
    new THREE.Vector3(0.216, 0.090, -0.184),
  ]);
  const TAIL_SEG = 24;
  const TAIL_RAD = 11;
  const TAIL_R0 = 0.058;
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
  const anim = new IdleAnimator(rig, 77);
  const rnd = makeRng(505);
  let attention = 0;

  return {
    id: 'greymon',
    name: 'Greymon',
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);
      tail.rotation.y = Math.sin(elapsed * 0.72) * (0.08 + attention * 0.08);
      tail.rotation.x = Math.sin(elapsed * 1.05 + 0.6) * 0.04;
      tail.rotation.z = Math.sin(elapsed * 1.6) * 0.035;
      rig.body.position.y = Math.sin(elapsed * 1.25) * 0.004;
      void rnd;
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}
