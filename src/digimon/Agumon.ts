import * as THREE from 'three';
import { metaSurface, boxProjectedUV, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import { makeRng, clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature } from './shared';
import {
  fixOutward, weldDecimate, markSculpt, ramp, buildEye, clawGeometry, makeSurfaceProbe, type MarkField,
} from './sculpt-util';

/**
 * Agumon — upright little fire dinosaur, the fire partner.
 *
 * Reference: `D:/Digimon/references/partners/agumon01.png` — a big head that
 * sits straight on the shoulders (no neck), a long rounded snout that sticks
 * out past the belly in profile, heavy brow ridges over huge green eyes, a
 * pear-shaped body with a lighter belly, stubby arms and short thick legs
 * that each end in three white claws, and a thick tail. The reference is
 * faceted low-poly: the sculpt is welded coarse and flat-shaded so the
 * planes read.
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const SKIN = 0xee8a3a;      // orange body (reference dominant colour)
const BELLY = 0xf29c52;     // lighter orange belly, not cream
const CLAW = 0xf4f0ea;      // white claws
const IRIS = 0x3aa84a;      // green eyes
const IRIS_EMISSIVE = 0x16602a;
/** Weld cell sizes: coarse enough that the facets of the reference show. */
const BODY_FACET = 0.022;
const HEAD_FACET = 0.018;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildAgumon(): Creature {
  const rig = createRig();
  rig.root.name = 'Agumon';

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
  painted.flatShading = true;

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
  painted.customProgramCacheKey = () => 'agumon|marked';

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
  // Pear-shaped: narrow shoulders that the head swallows, a round belly
  // that is the widest point, broad hips, stubby arms hanging out and
  // forward, short thick legs on big three-toed feet.
  const bodyBalls: Ball[] = [
    { x: 0, y: 0.352, z: -0.006, r: 0.082, sx: 1.10, sy: 0.80, sz: 0.94 }, // shoulders
    { x: 0, y: 0.296, z: 0.006, r: 0.108, sx: 1.00, sy: 0.92, sz: 0.94 },  // chest
    { x: 0, y: 0.214, z: 0.020, r: 0.128, sx: 1.00, sy: 0.96, sz: 0.96 },  // belly
    { x: 0, y: 0.146, z: -0.006, r: 0.114, sx: 1.08, sy: 0.80, sz: 0.98 }, // hips
    { x: 0, y: 0.158, z: -0.092, r: 0.070, sy: 0.96, sz: 1.10 },           // tail root

    // arms: shoulder -> elbow -> hand, splayed out and a touch forward
    { x: 0.108, y: 0.318, z: 0.020, r: 0.044 },
    { x: -0.108, y: 0.318, z: 0.020, r: 0.044 },
    { x: 0.140, y: 0.284, z: 0.034, r: 0.038 },
    { x: -0.140, y: 0.284, z: 0.034, r: 0.038 },
    { x: 0.162, y: 0.248, z: 0.052, r: 0.033 },
    { x: -0.162, y: 0.248, z: 0.052, r: 0.033 },
    { x: 0.172, y: 0.222, z: 0.064, r: 0.032, sx: 0.90, sy: 0.84 },       // hand
    { x: -0.172, y: 0.222, z: 0.064, r: 0.032, sx: 0.90, sy: 0.84 },
    // armpit notch keeps the arms from fusing into the chest
    { x: 0.114, y: 0.262, z: 0.030, r: 0.030, sx: 0.8, sy: 1.2, strength: -0.30 },
    { x: -0.114, y: 0.262, z: 0.030, r: 0.030, sx: 0.8, sy: 1.2, strength: -0.30 },
  ];

  const BODY_RES = 44;
  let bodyGeo = metaSurface(bodyBalls, { resolution: BODY_RES, smooth: 0.86, padding: 0.03 });
  fixOutward(bodyGeo, 'agumon-body');
  bodyGeo = weldDecimate(bodyGeo, BODY_FACET);
  bodyGeo.setAttribute('uv', boxProjectedUV(bodyGeo, 17));

  // Lighter belly: an angular wedge about a per-height centre line, zero at
  // the throat and the crotch.
  const BODY_AXIS: [number, number][] = [
    [0.040, 0.010], [0.146, -0.006], [0.214, 0.020], [0.296, 0.006], [0.380, -0.006],
  ];
  const BODY_HALF: [number, number][] = [
    [0.060, 0.00], [0.100, 0.42], [0.150, 0.70], [0.210, 0.84],
    [0.270, 0.78], [0.320, 0.58], [0.360, 0.30], [0.390, 0.00],
  ];
  const bodyMark: MarkField = (x, y, z) =>
    ramp(BODY_HALF, y) - Math.abs(Math.atan2(x, z - ramp(BODY_AXIS, y)));
  markSculpt(bodyGeo, new THREE.Vector3(0, 0.21, 0), bodyMark, 0.22, 4);

  const body = new THREE.Mesh(bodyGeo, painted);
  body.castShadow = true;
  body.receiveShadow = true;
  rig.body.add(body);

  const clawAt = (
    probe: ReturnType<typeof makeSurfaceProbe>, parent: THREE.Object3D,
    geo: THREE.BufferGeometry, origin: THREE.Vector3, dir: THREE.Vector3, tilt: THREE.Euler,
  ) => {
    const hit = probe(origin, dir);
    if (!hit) return;
    const c = new THREE.Mesh(geo, clawMat);
    c.position.copy(hit.point).addScaledVector(hit.normal, -0.004);
    c.rotation.copy(tilt);
    c.castShadow = true;
    parent.add(c);
  };
  const probeBody = makeSurfaceProbe(bodyGeo);

  // Three finger claws per hand, pointing down and in.
  const handClaw = clawGeometry(0.026, 0.0085);
  for (const s of [1, -1]) {
    for (const off of [-1, 0, 1]) {
      clawAt(probeBody, rig.body, handClaw, new THREE.Vector3(s * 0.172, 0.222, 0.064 + off * 0.016), new THREE.Vector3(s * 0.25, -1, off * 0.35),
        new THREE.Euler(Math.PI * 0.94 - off * 0.25, 0, -s * 0.35));
    }
  }

  /* ---- Legs -------------------------------------------------------- */
  // Separate sculpts pivoting at the hip so the walk cycle can swing them.
  // The thigh ball is centred on the pivot, so the joint silhouette holds at
  // any angle. Coordinates are relative to the pivot.
  const HIP_Y = 0.100;
  const legs: THREE.Group[] = [];
  const footClaw = clawGeometry(0.030, 0.0105);
  for (const s of [1, -1]) {
    const legBalls: Ball[] = [
      { x: 0, y: 0, z: 0, r: 0.070 },                                        // thigh
      { x: s * 0.004, y: -0.044, z: 0.010, r: 0.052 },                       // shin
      { x: s * 0.006, y: -0.076, z: -0.004, r: 0.046, sy: 0.56, sz: 0.90 },  // heel
      { x: s * 0.008, y: -0.078, z: 0.040, r: 0.046, sy: 0.50, sz: 1.00 },   // ball of the foot
    ];
    let legGeo = metaSurface(legBalls, { resolution: 30, smooth: 0.86, padding: 0.03 });
    fixOutward(legGeo, 'agumon-leg');
    legGeo = weldDecimate(legGeo, BODY_FACET);
    legGeo.setAttribute('uv', boxProjectedUV(legGeo, 17));
    markSculpt(legGeo, new THREE.Vector3(0, -0.04, 0), () => -1, 0.22, 1);

    const leg = new THREE.Group();
    leg.name = s > 0 ? 'legL' : 'legR';
    leg.position.set(s * 0.078, HIP_Y, 0.004);
    const legMesh = new THREE.Mesh(legGeo, painted);
    legMesh.castShadow = true;
    legMesh.receiveShadow = true;
    leg.add(legMesh);
    rig.body.add(leg);
    legs.push(leg);

    // Three toe claws fanned across the front of the foot.
    const probeLeg = makeSurfaceProbe(legGeo);
    for (const off of [-1, 0, 1]) {
      clawAt(probeLeg, leg, footClaw, new THREE.Vector3(s * 0.008 + off * 0.026, -0.084, 0.02), new THREE.Vector3(off * 0.25, 0, 1),
        new THREE.Euler(Math.PI * 0.60, off * 0.25, 0));
    }
  }

  /* ---- Head -------------------------------------------------------- */
  // Big round cranium sat straight on the shoulders, a long rounded snout
  // that pushes well forward, heavy brow ridges and a wide jaw.
  rig.head.position.set(0, 0.392, 0.004);
  rig.head.scale.setScalar(1.14);

  const headBalls: Ball[] = [
    { x: 0, y: 0.036, z: -0.010, r: 0.108, sx: 1.04, sy: 0.96, sz: 0.96 }, // cranium
    { x: 0.056, y: 0.010, z: 0.012, r: 0.064 },                           // cheeks
    { x: -0.056, y: 0.010, z: 0.012, r: 0.064 },
    // snout: long and rounded, the upper jaw slightly over the lower
    { x: 0, y: -0.004, z: 0.070, r: 0.070, sx: 1.02, sy: 0.74, sz: 1.00 },
    { x: 0, y: -0.002, z: 0.118, r: 0.056, sx: 0.96, sy: 0.70, sz: 1.00 },
    { x: 0, y: 0.002, z: 0.152, r: 0.042, sx: 0.96, sy: 0.72, sz: 0.90 },
    { x: 0, y: -0.040, z: 0.070, r: 0.058, sx: 1.00, sy: 0.54, sz: 1.00 }, // lower jaw
    { x: 0, y: -0.036, z: 0.116, r: 0.042, sx: 0.90, sy: 0.50, sz: 0.94 },
    // brow ridges over the eyes
    { x: 0.050, y: 0.094, z: 0.050, r: 0.028, sx: 1.20, sy: 0.50, sz: 0.80 },
    { x: -0.050, y: 0.094, z: 0.050, r: 0.028, sx: 1.20, sy: 0.50, sz: 0.80 },
    // eye sockets so the big eyes sit into the face
    { x: 0.050, y: 0.054, z: 0.084, r: 0.030, sx: 1.05, sy: 1.10, strength: -0.22 },
    { x: -0.050, y: 0.054, z: 0.084, r: 0.030, sx: 1.05, sy: 1.10, strength: -0.22 },
    // mouth groove between the jaws
    { x: 0, y: -0.022, z: 0.104, r: 0.064, sx: 1.08, sy: 0.12, sz: 1.0, strength: -0.36 },
  ];

  const HEAD_RES = 48;
  let headGeo = metaSurface(headBalls, { resolution: HEAD_RES, smooth: 0.9, padding: 0.028 });
  fixOutward(headGeo, 'agumon-head');
  headGeo = weldDecimate(headGeo, HEAD_FACET);
  headGeo.setAttribute('uv', boxProjectedUV(headGeo, 17));

  // The reference head is one colour; only the belly field is lighter.
  markSculpt(headGeo, new THREE.Vector3(0, 0, 0.01), () => -1, 0.20, 1);

  const head = new THREE.Mesh(headGeo, painted);
  head.castShadow = true;
  head.receiveShadow = true;
  rig.head.add(head);
  const probeHead = makeSurfaceProbe(headGeo);

  /* ---- Eyes -------------------------------------------------------- */
  // Huge green eyes set into the sockets under the brow.
  const EYE_W = 0.044;
  const EYE_H = 0.052;
  for (const s of [1, -1]) {
    const { holder, lid } = buildEye(EYE_W, EYE_H, s, 0.36, plainSkin, IRIS, IRIS_EMISSIVE);
    const hit = probeHead(new THREE.Vector3(s * 0.030, 0.056, 0), new THREE.Vector3(s * 0.36, 0, 1));
    if (hit) holder.position.copy(hit.point).addScaledVector(hit.normal, -EYE_W * 0.30);
    else holder.position.set(s * 0.050, 0.056, 0.082);
    rig.head.add(holder);
    rig.eyes.push(holder);
    rig.eyelids.push(lid);
  }

  /* ---- Mouth: wide grin along the jaw line ------------------------ */
  // A thin dark strip projected onto the groove between the jaws, turned
  // up at the back corners.
  const mouthGeo = new THREE.BufferGeometry();
  {
    const W = 28;
    const pos: number[] = [];
    const idx: number[] = [];
    const A = 1.35;
    for (let i = 0; i <= W; i++) {
      const a = -A + (2 * A * i) / W;
      const y = -0.022 + (Math.abs(a) / A) ** 2.2 * 0.016;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a) * 1.6);
      const hit = probeHead(new THREE.Vector3(0, y, 0.06), dir);
      const p = hit ? hit.point.addScaledVector(hit.normal, 0.0015) : new THREE.Vector3(0, y, 0.15);
      const half = 0.0034 * (1 - (Math.abs(a) / A) ** 3 * 0.6);
      pos.push(p.x, p.y + half, p.z, p.x, p.y - half, p.z);
    }
    for (let i = 0; i < W; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    mouthGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mouthGeo.setIndex(idx);
    mouthGeo.computeVertexNormals();
  }
  const mouth = new THREE.Mesh(
    mouthGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0x4a160a, roughness: 1.0, specularIntensity: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  mouth.castShadow = false;
  rig.head.add(mouth);

  // Two nostrils on top of the snout tip.
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x7a3410, roughness: 0.85 });
  for (const s of [1, -1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 8, 6), nostrilMat);
    const hit = probeHead(new THREE.Vector3(s * 0.016, 0.005, 0.1), new THREE.Vector3(s * 0.15, 0.35, 1));
    if (hit) n.position.copy(hit.point);
    else n.position.set(s * 0.016, 0.014, 0.178);
    n.scale.set(1.2, 0.7, 0.5);
    rig.head.add(n);
  }

  /* ---- Tail -------------------------------------------------------- */
  // Thick at the root, sweeps back and down, then lifts slightly at the tip.
  const tail = new THREE.Group();
  tail.position.set(0, 0.158, -0.092);
  rig.body.add(tail);
  rig.tail = tail;

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.006, -0.040, -0.070),
    new THREE.Vector3(0.024, -0.072, -0.150),
    new THREE.Vector3(0.056, -0.074, -0.226),
    new THREE.Vector3(0.094, -0.046, -0.286),
    new THREE.Vector3(0.124, -0.006, -0.316),
  ]);
  const TAIL_SEG = 22;
  const TAIL_RAD = 9;
  const TAIL_R0 = 0.066;
  const TAIL_TIP = 0.22;
  const tailEase = (t: number): number => t ** 1.25;
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
  // `painted` needs colour + aMark attributes on every mesh it shades.
  markSculpt(tailGeo, new THREE.Vector3(0, 0, 0), () => -1, 0.12, 1);

  const tailMesh = new THREE.Mesh(tailGeo, painted);
  tailMesh.castShadow = true;
  tailMesh.receiveShadow = true;
  tail.add(tailMesh);

  /* ---- Performance ------------------------------------------------- */
  const anim = new IdleAnimator(rig, 33);
  const rnd = makeRng(404);
  let attention = 0;
  let gPhase = 0;
  let gWeight = 0;
  let gRun = 0;

  return {
    id: 'agumon',
    name: 'Agumon',
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    gait(phase, weight, run) {
      gPhase = phase;
      gWeight = weight;
      gRun = run;
    },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);
      const w = gWeight;
      const sin = Math.sin(gPhase);
      const cos = Math.cos(gPhase);
      const swing = (0.46 + gRun * 0.22) * sin * w;
      const lift = (0.020 + gRun * 0.014) * w;
      // Left leg swings forward while cos < 0, the right one on the other half.
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[0].position.y = HIP_Y + Math.max(0, -cos) * lift;
      legs[1].position.y = HIP_Y + Math.max(0, cos) * lift;
      // Drop the hips by exactly what the planted leg loses to its angle.
      const dip = HIP_Y * (1 - Math.cos(swing));
      rig.body.position.y = Math.sin(elapsed * 1.3) * 0.004 * (1 - w) - dip;
      rig.body.rotation.z += sin * 0.07 * w;
      rig.body.rotation.y = sin * 0.10 * w;
      tail.rotation.y = Math.sin(elapsed * 0.82) * (0.09 + attention * 0.09) * (1 - w) - sin * 0.22 * w;
      tail.rotation.x = Math.sin(elapsed * 1.1 + 0.6) * 0.045 + w * 0.08;
      tail.rotation.z = Math.sin(elapsed * 1.7) * 0.04;
      void rnd;
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}
