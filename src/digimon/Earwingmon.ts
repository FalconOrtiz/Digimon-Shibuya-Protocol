import * as THREE from 'three';
import { metaSurface, boxProjectedUV, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/CreatureMaterials';
import { makeRng, lerp, clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature } from './shared';
import { fixOutward, weldDecimate, markSculpt, ramp, buildEye, type MarkField } from './sculpt-util';

/**
 * Earwingmon — a round cream mammal with enormous ear-wings (Patamon lineage).
 *
 * Reference: `references/partners/patamon01.png` — plump cream body, big
 * orange ear-wings that flank the head, tiny stub arms, wide blue eyes, a
 * short rounded tail. Reads as a plush toy: everything soft, no joints.
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const CREAM = 0xe0c9a4;     // body cream (from reference dominant colours)
const ORANGE = 0xd07030;    // ear-wings / accents
const DARK = 0x8a4a1a;      // dark orange shadow for markings
const IRIS = 0x2a6fd0;      // blue eyes
const IRIS_EMISSIVE = 0x1a3f8a;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildEarwingmon(): Creature {
  const rig = createRig();
  rig.root.name = 'Earwingmon';

  /* ---- Materials --------------------------------------------------- */
  const creamC = new THREE.Color(CREAM);
  const orangeC = new THREE.Color(ORANGE);

  const painted = creatureSkin({
    color: 0xffffff, subsurface: 0xc49a5a, wrap: 0.07, rim: 0.02,
    roughness: 0.60, detail: 'none',
  });
  painted.vertexColors = true;
  painted.clearcoat = 0.06;
  painted.clearcoatRoughness = 0.7;
  painted.envMapIntensity = 0.06;
  painted.specularIntensity = 0.28;
  painted.specularColor = new THREE.Color(0xffd9a0);
  painted.roughnessMap = null;

  const baseCompile = painted.onBeforeCompile;
  painted.onBeforeCompile = (shader, renderer) => {
    baseCompile?.call(painted, shader, renderer);
    shader.uniforms.uCream = { value: creamC };
    shader.uniforms.uOrange = { value: orangeC };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMark;\nvarying float vMark;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMark = aMark;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMark;\nuniform vec3 uCream;\nuniform vec3 uOrange;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          float w = fwidth(vMark) * 1.5 + 0.048;
          float m = smoothstep(-w, w, vMark);
          diffuseColor.rgb *= mix(uCream, uOrange, m);
        }
        `,
      );
  };
  painted.customProgramCacheKey = () => 'earwingmon|marked';

  const plainSkin = creatureSkin({
    color: CREAM, subsurface: 0xc49a5a, wrap: 0.07, rim: 0.02,
    roughness: 0.64, detail: 'none',
  });
  plainSkin.clearcoat = 0.06;
  plainSkin.envMapIntensity = 0.06;

  const orangeMat = creatureSkin({
    color: ORANGE, subsurface: 0xb05020, wrap: 0.06, rim: 0.015,
    roughness: 0.6, detail: 'none',
  });
  orangeMat.clearcoat = 0.05;
  orangeMat.envMapIntensity = 0.06;

  /* ---- Body -------------------------------------------------------- */
  // A plump teardrop pear: wide at the hips, softer at the shoulders. Stub
  // legs barely clear the ground; the body is the character.
  const bodyBalls: Ball[] = [
    { x: 0, y: 0.330, z: -0.002, r: 0.056, sy: 0.92 },                     // neck
    { x: 0, y: 0.270, z: 0.010, r: 0.105, sx: 0.96, sy: 0.94, sz: 0.88 },  // chest
    { x: 0, y: 0.200, z: 0.016, r: 0.112, sx: 1.02, sy: 0.92, sz: 0.94 },  // belly
    { x: 0, y: 0.130, z: 0.008, r: 0.104, sx: 1.08, sy: 0.82, sz: 0.98 },  // hips
    { x: 0, y: 0.075, z: -0.004, r: 0.084, sx: 1.02, sy: 0.62, sz: 0.92 }, // rump
    // tiny stub tail
    { x: 0, y: 0.140, z: -0.110, r: 0.030, sy: 0.9 },
    { x: 0, y: 0.150, z: -0.128, r: 0.022, sy: 0.85 },

    // arms: tiny rounded nubs on the chest sides
    { x: 0.100, y: 0.250, z: 0.030, r: 0.026 },
    { x: -0.100, y: 0.250, z: 0.030, r: 0.026 },
    { x: 0.114, y: 0.244, z: 0.048, r: 0.020 },
    { x: -0.114, y: 0.244, z: 0.048, r: 0.020 },

    // legs: short, chunky, mostly hidden under the belly
    { x: 0.060, y: 0.052, z: 0.006, r: 0.040, sy: 0.85 },
    { x: -0.060, y: 0.052, z: 0.006, r: 0.040, sy: 0.85 },
    { x: 0.062, y: 0.024, z: 0.012, r: 0.030, sy: 0.6 },
    { x: -0.062, y: 0.024, z: 0.012, r: 0.030, sy: 0.6 },
    { x: 0.066, y: 0.010, z: 0.028, r: 0.026, sy: 0.42, sz: 1.1 },         // foot
    { x: -0.066, y: 0.010, z: 0.028, r: 0.026, sy: 0.42, sz: 1.1 },
    // crotch notch
    { x: 0, y: 0.050, z: 0.010, r: 0.044, sx: 0.4, sz: 1.4, strength: -0.55 },
  ];

  const BODY_RES = 42;
  let bodyGeo = metaSurface(bodyBalls, { resolution: BODY_RES, smooth: 0.88, padding: 0.026 });
  fixOutward(bodyGeo, 'earwingmon-body');
  bodyGeo = weldDecimate(bodyGeo, 0.0105);
  bodyGeo.setAttribute('uv', boxProjectedUV(bodyGeo, 17));

  // Orange markings: a soft saddle across the back + a collar ring under the
  // head. Field is angular about a centre line, per-height.
  const SADDLE_AXIS: [number, number][] = [
    [0.05, 0.000], [0.12, 0.000], [0.18, 0.000], [0.24, 0.000],
    [0.30, 0.000], [0.36, 0.000],
  ];
  const SADDLE_HALF: [number, number][] = [
    [0.05, 0.00], [0.09, 0.30], [0.13, 0.52], [0.17, 0.66],
    [0.22, 0.74], [0.28, 0.68], [0.33, 0.46], [0.37, 0.00],
  ];
  const bodyMark: MarkField = (x, y, z, nx, _ny, nz) => {
    // Back saddle: behind the body centre line (negative z region of the
    // back) and below the neck.
    const behind = z < ramp(SADDLE_AXIS, y) ? 1 : -1;
    const saddle = behind * ramp(SADDLE_HALF, y);
    // Collar: a ring just under the neck joint.
    const collarY = 0.300;
    const collar = y > collarY - 0.03 && y < collarY + 0.03
      ? 1 - Math.abs(x) / 0.09
      : -1;
    return Math.max(saddle, collar);
  };
  markSculpt(bodyGeo, new THREE.Vector3(0, 0.20, 0), bodyMark, 0.22, 4);

  const body = new THREE.Mesh(bodyGeo, painted);
  body.castShadow = true;
  body.receiveShadow = true;
  rig.body.add(body);

  /* ---- Head -------------------------------------------------------- */
  // Round head, wide at the cheeks, tiny flat muzzle — a plush toy face.
  rig.head.position.set(0, 0.398, 0.004);

  const headBalls: Ball[] = [
    { x: 0, y: 0.020, z: 0.000, r: 0.084, sx: 1.06, sy: 0.98, sz: 0.86 },  // cranium
    { x: 0, y: 0.002, z: -0.036, r: 0.048, sy: 0.94, sz: 0.60 },           // occiput
    { x: 0.058, y: 0.010, z: -0.002, r: 0.048, sy: 0.94 },                 // temples
    { x: -0.058, y: 0.010, z: -0.002, r: 0.048, sy: 0.94 },
    { x: 0.052, y: -0.026, z: 0.018, r: 0.046, sz: 0.96 },                 // cheeks
    { x: -0.052, y: -0.026, z: 0.018, r: 0.046, sz: 0.96 },
    // tiny muzzle
    { x: 0, y: -0.020, z: 0.052, r: 0.040, sx: 0.92, sy: 0.80, sz: 0.90 },
    { x: 0, y: -0.014, z: 0.074, r: 0.030, sx: 0.84, sy: 0.72, sz: 0.80 },
    { x: 0, y: -0.008, z: 0.086, r: 0.024, sx: 0.80, sy: 0.70, sz: 0.68 },
    // chin
    { x: 0, y: -0.050, z: 0.020, r: 0.040, sx: 1.00, sy: 0.52, sz: 0.96 },
    // back carve + neck notch
    { x: 0, y: -0.012, z: -0.054, r: 0.050, sy: 1.20, sz: 0.85, strength: -0.60 },
    { x: 0, y: -0.052, z: -0.034, r: 0.078, sy: 0.28, strength: -0.60 },
  ];

  const HEAD_RES = 44;
  let headGeo = metaSurface(headBalls, { resolution: HEAD_RES, smooth: 0.92, padding: 0.024 });
  fixOutward(headGeo, 'earwingmon-head');
  headGeo = weldDecimate(headGeo, 0.0080);
  headGeo.setAttribute('uv', boxProjectedUV(headGeo, 17));

  // Head is cream all over — constant-negative marking.
  const headMark: MarkField = () => -1;
  markSculpt(headGeo, new THREE.Vector3(0, 0, 0.01), headMark, 0.20, 4);

  const head = new THREE.Mesh(headGeo, painted);
  head.castShadow = true;
  head.receiveShadow = true;
  rig.head.add(head);

  /* ---- Eyes -------------------------------------------------------- */
  // Wide-set big blue eyes — the face's dominant feature.
  const EYE_W = 0.0245;
  const EYE_H = 0.0360;
  for (const s of [1, -1]) {
    const { holder, lid } = buildEye(EYE_W, EYE_H, s, 0.32, plainSkin, IRIS, IRIS_EMISSIVE);
    holder.position.set(s * 0.0350, 0.0200, 0.0560);
    rig.head.add(holder);
    rig.eyes.push(holder);
    rig.eyelids.push(lid);
  }

  /* ---- Mouth: small happy smile ------------------------------------ */
  {
    const mouthGeo = new THREE.BufferGeometry();
    const A = 0.85;
    const pos: number[] = [];
    const idx: number[] = [];
    const W = 14;
    const H = 2;
    for (let j = 0; j <= H; j++) {
      for (let i = 0; i <= W; i++) {
        const a = lerp(-A, A, i / W);
        const t = j / H;
        pos.push(
          Math.sin(a) * 0.034,
          -0.036 + (1 - Math.cos(a)) * 0.020 - t * 0.016,
          0.082 - Math.abs(Math.sin(a)) * 0.010 - t * 0.022,
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
    const mouth = new THREE.Mesh(
      mouthGeo,
      new THREE.MeshPhysicalMaterial({
        color: 0x4a1d0d, roughness: 1.0, specularIntensity: 0.04,
        side: THREE.DoubleSide,
      }),
    );
    mouth.castShadow = false;
    rig.head.add(mouth);
  }

  // Tiny nose dot.
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x6a3410, roughness: 0.85 });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.0020, 8, 6), noseMat);
  nose.position.set(0, 0.000, 0.100);
  nose.scale.set(1, 0.75, 0.6);
  rig.head.add(nose);

  /* ---- Ear-wings --------------------------------------------------- */
  // The signature: two huge rounded wings flanking the head, cream inner,
  // orange outer. They are on their own pivots and flap gently.
  const EAR_R = 0.062;
  const earGeo = new THREE.SphereGeometry(EAR_R, 20, 14);
  earGeo.scale(1, 1.35, 0.42);
  earGeo.computeVertexNormals();

  const wingPivots: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.052, 0.030, 0.000);
    rig.head.add(pivot);
    wingPivots.push(pivot);

    const wing = new THREE.Group();
    wing.position.set(s * 0.036, -0.006, 0.000);
    pivot.add(wing);

    // Orange outer shell.
    const outer = new THREE.Mesh(earGeo, orangeMat);
    outer.castShadow = true;
    outer.receiveShadow = true;
    wing.add(outer);

    // Cream inner lobe, smaller and proud of the outer.
    const innerGeo = new THREE.SphereGeometry(EAR_R * 0.62, 18, 12);
    innerGeo.scale(1, 1.2, 0.5);
    innerGeo.computeVertexNormals();
    const inner = new THREE.Mesh(innerGeo, plainSkin);
    inner.position.set(0, 0.004, -EAR_R * 0.34);
    wing.add(inner);
  }

  /* ---- Performance ------------------------------------------------- */
  const anim = new IdleAnimator(rig, 44);
  const rnd = makeRng(505);
  let attention = 0;

  return {
    id: 'earwingmon',
    name: 'Earwingmon',
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);

      // Ear-wings: a slow gentle flap, faster when attentive; they also
      // splay outward when the creature is happy (celebrate handled by anim).
      const flap = Math.sin(elapsed * 1.4) * (0.10 + attention * 0.12);
      wingPivots.forEach((p, i) => {
        p.rotation.z = (i === 0 ? flap : -flap);
        p.rotation.y = Math.sin(elapsed * 0.9 + i) * 0.08;
      });

      // Body bob.
      rig.body.position.y = Math.sin(elapsed * 1.5) * 0.004;
      void rnd;
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}
