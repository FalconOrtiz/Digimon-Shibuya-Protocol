import * as THREE from 'three';
import { metaSurface, boxProjectedUV, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/CreatureMaterials';
import { makeRng, lerp, clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature } from './shared';
import { fixOutward, weldDecimate, markSculpt, ramp, buildEye, clawGeometry, type MarkField } from './sculpt-util';

/**
 * Flaremon — an upright little fire dinosaur (Agumon lineage).
 *
 * Reference: `references/partners/agumon01.png` — orange bipedal dinosaur,
 * big head with a wide jaw, small arms with white claws, stocky legs, and a
 * tapering tail. Green eyes. Everything reads from the silhouette first:
 * chunky rounded forms, no sharp edges, a soft cream belly field.
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const SKIN = 0xd07020;      // orange body (from reference dominant colours)
const SKIN_DARK = 0xa04010; // shadow-orange for the snout top
const BELLY = 0xf0d8a8;     // cream belly
const CLAW = 0xf4ead6;      // white claws
const IRIS = 0x1f8f4a;      // green eyes
const IRIS_EMISSIVE = 0x0e5a2c;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildFlaremon(): Creature {
  const rig = createRig();
  rig.root.name = 'Flaremon';

  /* ---- Materials --------------------------------------------------- */
  const skinC = new THREE.Color(SKIN);
  const bellyC = new THREE.Color(BELLY);

  const painted = creatureSkin({
    color: 0xffffff, subsurface: 0xd0561a, wrap: 0.06, rim: 0.018,
    roughness: 0.62, detail: 'none',
  });
  painted.vertexColors = true;
  painted.clearcoat = 0.05;
  painted.clearcoatRoughness = 0.72;
  painted.envMapIntensity = 0.06;
  painted.specularIntensity = 0.30;
  painted.specularColor = new THREE.Color(0xffc59a);
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
  painted.customProgramCacheKey = () => 'flaremon|marked';

  const plainSkin = creatureSkin({
    color: SKIN, subsurface: 0xd0561a, wrap: 0.06, rim: 0.018,
    roughness: 0.66, detail: 'none',
  });
  plainSkin.clearcoat = 0.05;
  plainSkin.envMapIntensity = 0.06;

  const clawMat = new THREE.MeshPhysicalMaterial({
    color: CLAW, roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.5, metalness: 0,
    sheen: 0.1, sheenRoughness: 0.9,
  });

  /* ---- Body -------------------------------------------------------- */
  // Stocky dino torso: chest, waist, belly, hips; short thick arms; bowed
  // legs with real feet; the tail leaves the hips and sweeps back.
  const bodyBalls: Ball[] = [
    { x: 0, y: 0.360, z: -0.004, r: 0.052, sy: 0.90 },                     // neck
    { x: 0, y: 0.312, z: 0.010, r: 0.098, sx: 1.02, sy: 0.92, sz: 0.90 },  // chest
    { x: 0, y: 0.262, z: 0.014, r: 0.082, sx: 0.94, sy: 0.86, sz: 0.92 },  // waist
    { x: 0, y: 0.212, z: 0.014, r: 0.100, sx: 1.00, sy: 0.90, sz: 0.98 },  // belly
    { x: 0, y: 0.156, z: -0.002, r: 0.096, sx: 1.08, sy: 0.78, sz: 0.96 }, // hips
    { x: 0, y: 0.170, z: -0.070, r: 0.058, sz: 1.10 },                     // tail root
    // waist pinch
    { x: 0.104, y: 0.264, z: 0.012, r: 0.052, sx: 0.90, sy: 1.25, sz: 1.05, strength: -0.54 },
    { x: -0.104, y: 0.264, z: 0.012, r: 0.052, sx: 0.90, sy: 1.25, sz: 1.05, strength: -0.54 },
    // neck notch
    { x: 0, y: 0.400, z: -0.020, r: 0.084, sy: 0.28, strength: -0.62 },

    // arms: short and chunky, posed slightly out and forward
    { x: 0.092, y: 0.304, z: 0.006, r: 0.046 },
    { x: -0.092, y: 0.304, z: 0.006, r: 0.046 },
    { x: 0.128, y: 0.282, z: 0.014, r: 0.038 },
    { x: -0.128, y: 0.282, z: 0.014, r: 0.038 },
    { x: 0.156, y: 0.262, z: 0.028, r: 0.034 },                            // elbow
    { x: -0.156, y: 0.262, z: 0.028, r: 0.034 },
    { x: 0.176, y: 0.248, z: 0.050, r: 0.031 },                            // forearm
    { x: -0.176, y: 0.248, z: 0.050, r: 0.031 },
    { x: 0.190, y: 0.240, z: 0.070, r: 0.028 },                            // wrist
    { x: -0.190, y: 0.240, z: 0.070, r: 0.028 },
    { x: 0.198, y: 0.234, z: 0.090, r: 0.034, sy: 0.76, sz: 0.94 },        // palm
    { x: -0.198, y: 0.234, z: 0.090, r: 0.034, sy: 0.76, sz: 0.94 },
    // shoulder notch
    { x: 0.086, y: 0.270, z: 0.014, r: 0.028, sx: 0.7, sy: 1.15, strength: -0.26 },
    { x: -0.086, y: 0.270, z: 0.014, r: 0.028, sx: 0.7, sy: 1.15, strength: -0.26 },

    // legs: thigh -> knee -> shin -> ankle -> foot
    { x: 0.078, y: 0.130, z: -0.002, r: 0.058, sy: 1.00 },
    { x: -0.078, y: 0.130, z: -0.002, r: 0.058, sy: 1.00 },
    { x: 0.081, y: 0.090, z: 0.014, r: 0.042 },                            // knee
    { x: -0.081, y: 0.090, z: 0.014, r: 0.042 },
    { x: 0.082, y: 0.084, z: 0.033, r: 0.023, strength: 0.58 },            // kneecap
    { x: -0.082, y: 0.084, z: 0.033, r: 0.023, strength: 0.58 },
    { x: 0.081, y: 0.062, z: 0.018, r: 0.034 },                            // shin
    { x: -0.081, y: 0.062, z: 0.018, r: 0.034 },
    { x: 0.082, y: 0.038, z: 0.012, r: 0.024 },                            // ankle
    { x: -0.082, y: 0.038, z: 0.012, r: 0.024 },
    // feet
    { x: 0.082, y: 0.017, z: -0.008, r: 0.028, sy: 0.58, sz: 0.84 },       // heel
    { x: -0.082, y: 0.017, z: -0.008, r: 0.028, sy: 0.58, sz: 0.84 },
    { x: 0.084, y: 0.016, z: 0.030, r: 0.032, sy: 0.50, sz: 1.00 },        // ball
    { x: -0.084, y: 0.016, z: 0.030, r: 0.032, sy: 0.50, sz: 1.00 },
    // ankle undercut + crotch notch
    { x: 0.082, y: 0.036, z: -0.026, r: 0.024, sy: 0.9, strength: -0.34 },
    { x: -0.082, y: 0.036, z: -0.026, r: 0.024, sy: 0.9, strength: -0.34 },
    { x: 0, y: 0.072, z: 0.008, r: 0.052, sx: 0.42, sz: 1.4, strength: -0.60 },
  ];

  // Toes with white claws.
  const toeTips: THREE.Vector3[] = [];
  for (const s of [1, -1]) {
    for (const off of [-1, 0, 1]) {
      const px = 0.084 + off * 0.021;
      bodyBalls.push({ x: s * px, y: 0.015, z: 0.058, r: 0.0150, sy: 0.66, sz: 1.20 });
      bodyBalls.push({ x: s * (px + off * 0.006), y: 0.014, z: 0.080, r: 0.0120, sy: 0.62 });
      toeTips.push(new THREE.Vector3(s * (px + off * 0.010), 0.016, 0.093));
      if (off < 1) {
        bodyBalls.push({
          x: s * (px + 0.0105), y: 0.015, z: 0.072, r: 0.013, sx: 0.40, sz: 1.6, strength: -0.46,
        });
      }
    }
  }

  const BODY_RES = 42;
  let bodyGeo = metaSurface(bodyBalls, { resolution: BODY_RES, smooth: 0.86, padding: 0.026 });
  fixOutward(bodyGeo, 'flaremon-body');
  bodyGeo = weldDecimate(bodyGeo, 0.0105);
  bodyGeo.setAttribute('uv', boxProjectedUV(bodyGeo, 17));

  // Cream belly field: angular about a per-height centre line, tapering to
  // zero at the throat and crotch (same technique as Charmander).
  const BODY_AXIS: [number, number][] = [
    [0.030, 0.004], [0.100, 0.000], [0.156, -0.002], [0.212, 0.014],
    [0.262, 0.014], [0.312, 0.010], [0.400, -0.004],
  ];
  const BODY_HALF: [number, number][] = [
    [0.030, 0.00], [0.066, 0.34], [0.112, 0.58], [0.158, 0.74],
    [0.206, 0.82], [0.252, 0.80], [0.298, 0.70], [0.344, 0.54],
    [0.390, 0.32], [0.428, 0.00],
  ];
  const bodyMark: MarkField = (x, y, z) =>
    ramp(BODY_HALF, y) - Math.abs(Math.atan2(x, z - ramp(BODY_AXIS, y)));
  markSculpt(bodyGeo, new THREE.Vector3(0, 0.22, 0), bodyMark, 0.22, 4);

  const body = new THREE.Mesh(bodyGeo, painted);
  body.castShadow = true;
  body.receiveShadow = true;
  rig.body.add(body);

  // Toe claws.
  const footClaw = clawGeometry(0.024, 0.0080);
  for (const p of toeTips) {
    const c = new THREE.Mesh(footClaw, clawMat);
    c.position.copy(p).add(new THREE.Vector3(0, 0.001, -0.009));
    c.rotation.set(Math.PI * 0.63, 0, 0);
    c.castShadow = true;
    rig.body.add(c);
  }

  /* ---- Head -------------------------------------------------------- */
  // Big rounded dino head: tall cranium, wide cheeks, short muzzle with a
  // broad jaw, and a subtle brow ridge so it reads as a reptile, not a bear.
  rig.head.position.set(0, 0.452, 0.002);

  const headBalls: Ball[] = [
    { x: 0, y: 0.026, z: 0.000, r: 0.088, sx: 1.08, sy: 1.02, sz: 0.84 },   // cranium
    { x: 0, y: 0.008, z: -0.040, r: 0.052, sy: 0.96, sz: 0.62 },            // occiput
    { x: 0.060, y: 0.016, z: -0.002, r: 0.050, sy: 0.96 },                  // temples
    { x: -0.060, y: 0.016, z: -0.002, r: 0.050, sy: 0.96 },
    { x: 0.052, y: -0.028, z: 0.016, r: 0.046, sz: 0.98 },                  // cheeks
    { x: -0.052, y: -0.028, z: 0.016, r: 0.046, sz: 0.98 },
    // Muzzle — slightly snouty, blends into the face
    { x: 0, y: -0.024, z: 0.048, r: 0.054, sx: 0.94, sy: 0.86, sz: 0.94 },  // muzzle root
    { x: 0, y: -0.020, z: 0.078, r: 0.043, sx: 0.86, sy: 0.78, sz: 0.92 },  // muzzle mid
    { x: 0, y: -0.010, z: 0.094, r: 0.034, sx: 0.82, sy: 0.74, sz: 0.72 },  // snout tip
    // Jaw — wide lower jaw
    { x: 0, y: -0.052, z: 0.024, r: 0.047, sx: 1.00, sy: 0.56, sz: 1.00 },  // jaw
    { x: 0, y: -0.046, z: 0.068, r: 0.031, sx: 0.84, sy: 0.48, sz: 0.90 },  // lower lip
    { x: 0, y: -0.042, z: 0.086, r: 0.019, sx: 0.64, sy: 0.42, sz: 0.66 },  // chin
    // back-of-skull carve + neck notch
    { x: 0, y: -0.014, z: -0.058, r: 0.052, sy: 1.20, sz: 0.85, strength: -0.62 },
    { x: 0, y: -0.055, z: -0.036, r: 0.082, sy: 0.28, strength: -0.62 },
  ];

  const HEAD_RES = 46;
  let headGeo = metaSurface(headBalls, { resolution: HEAD_RES, smooth: 0.92, padding: 0.024 });
  fixOutward(headGeo, 'flaremon-head');
  headGeo = weldDecimate(headGeo, 0.0080);
  headGeo.setAttribute('uv', boxProjectedUV(headGeo, 17));

  // The head keeps a warm cream chin patch — Agumon's jaw is lighter.
  const headMark: MarkField = (_x, y, _z, _nx, _ny, _nz) => {
    if (y < -0.036) return 1;      // chin is cream
    return -1;
  };
  markSculpt(headGeo, new THREE.Vector3(0, 0, 0.01), headMark, 0.20, 4);

  const head = new THREE.Mesh(headGeo, painted);
  head.castShadow = true;
  head.receiveShadow = true;
  rig.head.add(head);

  /* ---- Eyes -------------------------------------------------------- */
  // Big green eyes on the front of the face.
  const EYE_W = 0.0240;
  const EYE_H = 0.0350;
  for (const s of [1, -1]) {
    const { holder, lid } = buildEye(EYE_W, EYE_H, s, 0.30, plainSkin, IRIS, IRIS_EMISSIVE);
    holder.position.set(s * 0.0340, 0.0260, 0.0600);
    rig.head.add(holder);
    rig.eyes.push(holder);
    rig.eyelids.push(lid);
  }

  /* ---- Mouth: wide friendly grin ------------------------------------ */
  // A simple dark strip along the jaw line — Agumon's grin is broad and
  // upturned at the corners.
  const mouthGeo = new THREE.BufferGeometry();
  {
    const A = 1.25;
    const pos: number[] = [];
    const idx: number[] = [];
    const W = 18;
    const H = 3;
    const lipY = (a: number) => -0.036 + (1 - Math.cos(a)) * 0.026;
    const lipZ = (a: number) => 0.086 - Math.abs(Math.sin(a)) * 0.014;
    for (let j = 0; j <= H; j++) {
      for (let i = 0; i <= W; i++) {
        const a = lerp(-A, A, i / W);
        const t = j / H;
        pos.push(
          Math.sin(a) * 0.052,
          lipY(a) - t * 0.022,
          lipZ(a) - t * 0.030,
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
      color: 0x5a1d0d, roughness: 1.0, specularIntensity: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  mouth.castShadow = false;
  rig.head.add(mouth);

  // Two tiny nostril dots.
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x7a3410, roughness: 0.85 });
  for (const s of [1, -1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.0017, 8, 6), nostrilMat);
    n.position.set(s * 0.0100, 0.0020, 0.1080);
    n.scale.set(1, 0.8, 0.4);
    rig.head.add(n);
  }

  /* ---- Tail -------------------------------------------------------- */
  // Tapers back and slightly down, then curls up at the tip.
  const tail = new THREE.Group();
  tail.position.set(0, 0.170, -0.070);
  rig.body.add(tail);
  rig.tail = tail;

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.020, -0.030, -0.050),
    new THREE.Vector3(0.058, -0.048, -0.098),
    new THREE.Vector3(0.110, -0.030, -0.138),
    new THREE.Vector3(0.160, 0.020, -0.158),
    new THREE.Vector3(0.190, 0.080, -0.160),
  ]);
  const TAIL_SEG = 24;
  const TAIL_RAD = 11;
  const TAIL_R0 = 0.050;
  const TAIL_TIP = 0.30;
  const tailEase = (t: number): number => t ** 1.55;
  const tailGeo = new THREE.TubeGeometry(tailCurve, TAIL_SEG, TAIL_R0, TAIL_RAD, false);
  {
    // Reuse taperTube-style manual taper (imported via shared? no — inline).
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
  const anim = new IdleAnimator(rig, 33);
  const rnd = makeRng(404);
  let attention = 0;

  return {
    id: 'flaremon',
    name: 'Flaremon',
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);
      tail.rotation.y = Math.sin(elapsed * 0.82) * (0.09 + attention * 0.09);
      tail.rotation.x = Math.sin(elapsed * 1.1 + 0.6) * 0.045;
      // Tail flick — a little life even at rest.
      tail.rotation.z = Math.sin(elapsed * 1.7) * 0.04;
      // Body idle bob (independent of animator's squash).
      rig.body.position.y = Math.sin(elapsed * 1.3) * 0.004;
      // rnd is used to keep the rng "warm" — future anim hooks reuse it.
      void rnd;
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}
