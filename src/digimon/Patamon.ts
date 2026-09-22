import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { metaSurface, boxProjectedUV, type Ball } from '../fx/Sculpt';
import { creatureSkin } from '../fx/materials/CreatureMaterials';
import { lerp, clamp } from '../core/Noise';
import { createRig, IdleAnimator, disposeCreature, type Creature } from './shared';
import { fixOutward, weldDecimate, markSculpt, buildEye, makeSurfaceProbe, type MarkField } from './sculpt-util';

/**
 * Patamon — the wind partner: a round fox-bat.
 *
 * Reference: `docs/referencias/assets/patamon01.png` — plump orange body, a
 * cream head framed by a spiky ruff and cheek tufts, orange patches around
 * wide blue eyes, two tall pointed ears, and separate orange bat wings with
 * finger struts. Faceted low-poly like the reference.
 */

const CREAM = 0xf2e2c4;
const ORANGE = 0xf08030;
const EAR_INNER = 0xf7b27a;
const STRUT = 0xc85a20;
const IRIS = 0x2a78d8;
const IRIS_EMISSIVE = 0x163e8a;
const BODY_FACET = 0.02;
const HEAD_FACET = 0.016;

function ear(h: number, r: number): THREE.BufferGeometry {
  const T = [0, 0.25, 0.55, 0.8, 0.94, 1];
  const R = [0.8, 1, 0.82, 0.5, 0.2, 0];
  const g = new THREE.LatheGeometry(T.map((t, i) => new THREE.Vector2(R[i] * r, t * h)), 6);
  g.scale(1, 1, 0.38);
  g.computeVertexNormals();
  return g;
}

/** Bat wing membrane in XY, root at the origin, reaching +X, scalloped trailing edge. */
function wingGeometry(span: number): { membrane: THREE.BufferGeometry; tips: THREE.Vector2[] } {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(span * 0.45, span * 0.42, span, span * 0.22);
  const tips = [new THREE.Vector2(span, span * 0.22), new THREE.Vector2(span * 0.72, -span * 0.06), new THREE.Vector2(span * 0.42, -span * 0.14)];
  s.quadraticCurveTo(span * 0.9, span * 0.0, tips[1].x, tips[1].y);
  s.quadraticCurveTo(span * 0.6, span * 0.02, tips[2].x, tips[2].y);
  s.quadraticCurveTo(span * 0.24, -span * 0.02, 0, -span * 0.08);
  s.lineTo(0, 0);
  const membrane = new THREE.ExtrudeGeometry(s, { depth: span * 0.012, bevelEnabled: false, curveSegments: 5 });
  membrane.translate(0, 0, -span * 0.006);
  return { membrane, tips };
}

export function buildPatamon(): Creature {
  const rig = createRig();
  rig.root.name = 'Patamon';

  const creamC = new THREE.Color(CREAM);
  const orangeC = new THREE.Color(ORANGE);

  const painted = creatureSkin({ color: 0xffffff, subsurface: 0xc4803a, wrap: 0.07, rim: 0.02, roughness: 0.62, detail: 'none' });
  painted.vertexColors = true;
  painted.flatShading = true;
  painted.clearcoat = 0.05;
  painted.clearcoatRoughness = 0.7;
  painted.envMapIntensity = 0.06;
  painted.specularIntensity = 0.28;
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
          diffuseColor.rgb *= mix(uCream, uOrange, smoothstep(-w, w, vMark));
        }
        `,
      );
  };
  painted.customProgramCacheKey = () => 'patamon|marked';

  const skin = (color: number, sub: number) => {
    const m = creatureSkin({ color, subsurface: sub, wrap: 0.06, rim: 0.02, roughness: 0.62, detail: 'none' });
    m.flatShading = true;
    m.clearcoat = 0.05;
    m.envMapIntensity = 0.06;
    return m;
  };
  const creamMat = skin(CREAM, 0xc49a5a);
  const orangeMat = skin(ORANGE, 0xb05020);
  const innerMat = skin(EAR_INNER, 0xc07040);
  const wingMat = skin(ORANGE, 0xb05020);
  wingMat.side = THREE.DoubleSide;
  const strutMat = skin(STRUT, 0x803010);

  /* ---- Body: orange pear, stub legs, fox tail ---------------------- */
  // Short round belly under a big head: the reference body is barely taller
  // than it is wide, with stub legs and tiny arm nubs.
  const bodyBalls: Ball[] = [
    { x: 0, y: 0.238, z: 0.006, r: 0.092, sx: 1.00, sy: 0.90, sz: 0.92 },
    { x: 0, y: 0.168, z: 0.016, r: 0.112, sx: 1.04, sy: 0.92, sz: 0.96 },
    { x: 0, y: 0.106, z: 0.004, r: 0.098, sx: 1.06, sy: 0.80, sz: 0.96 },
    { x: 0.098, y: 0.196, z: 0.034, r: 0.026 },
    { x: -0.098, y: 0.196, z: 0.034, r: 0.026 },
    { x: 0.110, y: 0.180, z: 0.052, r: 0.021 },
    { x: -0.110, y: 0.180, z: 0.052, r: 0.021 },
    { x: 0.058, y: 0.050, z: 0.010, r: 0.042, sy: 0.9 },
    { x: -0.058, y: 0.050, z: 0.010, r: 0.042, sy: 0.9 },
    { x: 0.062, y: 0.018, z: 0.026, r: 0.030, sy: 0.5, sz: 1.2 },
    { x: -0.062, y: 0.018, z: 0.026, r: 0.030, sy: 0.5, sz: 1.2 },
    { x: 0, y: 0.040, z: 0.012, r: 0.044, sx: 0.4, sz: 1.4, strength: -0.55 },
    // short fox tail sweeping back and up
    { x: 0, y: 0.100, z: -0.098, r: 0.030 },
    { x: 0, y: 0.114, z: -0.132, r: 0.027, sy: 0.9 },
    { x: 0, y: 0.138, z: -0.160, r: 0.021 },
    { x: 0, y: 0.164, z: -0.174, r: 0.014 },
  ];
  let bodyGeo = metaSurface(bodyBalls, { resolution: 40, smooth: 0.88, padding: 0.026 });
  fixOutward(bodyGeo, 'patamon-body');
  bodyGeo = weldDecimate(bodyGeo, BODY_FACET);
  bodyGeo.setAttribute('uv', boxProjectedUV(bodyGeo, 17));
  // Orange everywhere except the tail tip and the cream bib under the ruff.
  const bodyMark: MarkField = (_x, y, z) => {
    if (z < -0.15 && y > 0.145) return -1;
    return (0.25 - y) * 60 + Math.max(0, -z) * 30;
  };
  markSculpt(bodyGeo, new THREE.Vector3(0, 0.19, 0), bodyMark, 0.22, 3);
  const body = new THREE.Mesh(bodyGeo, painted);
  body.castShadow = body.receiveShadow = true;
  rig.body.add(body);

  /* ---- Head: cream, orange eye patches ------------------------------ */
  // The reference head is as wide as the body.
  rig.head.position.set(0, 0.338, 0.008);
  rig.head.scale.setScalar(1.42);
  const headBalls: Ball[] = [
    { x: 0, y: 0.020, z: 0.000, r: 0.088, sx: 1.08, sy: 0.96, sz: 0.88 },
    { x: 0, y: 0.002, z: -0.036, r: 0.050, sy: 0.94, sz: 0.60 },
    { x: 0.060, y: 0.008, z: -0.002, r: 0.050, sy: 0.94 },
    { x: -0.060, y: 0.008, z: -0.002, r: 0.050, sy: 0.94 },
    { x: 0.056, y: -0.028, z: 0.016, r: 0.048, sz: 0.96 },
    { x: -0.056, y: -0.028, z: 0.016, r: 0.048, sz: 0.96 },
    { x: 0, y: -0.022, z: 0.056, r: 0.038, sx: 0.9, sy: 0.78, sz: 0.9 },
    { x: 0, y: -0.018, z: 0.080, r: 0.026, sx: 0.8, sy: 0.7, sz: 0.8 },
    { x: 0, y: -0.050, z: 0.020, r: 0.040, sx: 1.0, sy: 0.52, sz: 0.96 },
    { x: 0, y: -0.012, z: -0.056, r: 0.050, sy: 1.2, sz: 0.85, strength: -0.6 },
    { x: 0, y: -0.054, z: -0.034, r: 0.078, sy: 0.28, strength: -0.6 },
  ];
  let headGeo = metaSurface(headBalls, { resolution: 42, smooth: 0.92, padding: 0.024 });
  fixOutward(headGeo, 'patamon-head');
  headGeo = weldDecimate(headGeo, HEAD_FACET);
  headGeo.setAttribute('uv', boxProjectedUV(headGeo, 17));
  const EYE_W = 0.029;
  const EYE_H = 0.037;
  const probeHead = makeSurfaceProbe(headGeo);
  const eyeAt = [1, -1].map((s) => {
    const hit = probeHead(new THREE.Vector3(s * 0.02, 0.018, 0), new THREE.Vector3(s * 0.42, 0, 1));
    return hit ? hit.point.addScaledVector(hit.normal, -EYE_W * 0.4) : new THREE.Vector3(s * 0.038, 0.018, 0.058);
  });
  // Orange patch ringing each eye, as on the sheet.
  const headMark: MarkField = (x, y, z) => {
    let best = -1;
    for (const e of eyeAt) {
      const d = Math.hypot((x - e.x) * 0.9, (y - e.y) * 0.8, z - e.z);
      best = Math.max(best, (0.036 - d) * 40);
    }
    return best;
  };
  markSculpt(headGeo, new THREE.Vector3(0, 0, 0.01), headMark, 0.18, 2);
  const head = new THREE.Mesh(headGeo, painted);
  head.castShadow = head.receiveShadow = true;
  rig.head.add(head);

  for (const [k, s] of [1, -1].entries()) {
    const { holder, lid } = buildEye(EYE_W, EYE_H, s, 0.34, creamMat, IRIS, IRIS_EMISSIVE);
    holder.position.copy(eyeAt[k]);
    rig.head.add(holder);
    rig.eyes.push(holder);
    rig.eyelids.push(lid);
  }

  // Small cat smile and a dark nose.
  {
    const pos: number[] = [];
    const idx: number[] = [];
    const W = 14;
    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= W; i++) {
        const a = lerp(-1, 1, i / W);
        const wv = Math.abs(Math.sin(a * Math.PI)) * 0.006;
        pos.push(a * 0.024, -0.034 - wv - j * 0.004, 0.090 - Math.abs(a) * 0.012 - j * 0.004);
      }
    }
    for (let i = 0; i < W; i++) idx.push(i, i + W + 1, i + 1, i + 1, i + W + 1, i + W + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    rig.head.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x4a1d0d, roughness: 1, side: THREE.DoubleSide })));
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.5 }));
  nose.position.set(0, -0.012, 0.100);
  nose.scale.set(1.3, 0.8, 0.8);
  rig.head.add(nose);

  /* ---- Ruff and cheek tufts: cream fur spikes ----------------------- */
  {
    const spikes: THREE.BufferGeometry[] = [];
    const spike = (len: number, r: number, pos: THREE.Vector3, dir: THREE.Vector3) => {
      const g = new THREE.ConeGeometry(r, len, 5, 1);
      g.translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      g.translate(pos.x, pos.y, pos.z);
      spikes.push(g.toNonIndexed());
    };
    // Ruff on the body: a thick two-row collar of fur tufts, fullest in front.
    for (const [row, n] of [[0, 18], [1, 14]] as const) {
      for (let i = 0; i < n; i++) {
        const a = ((i + row * 0.5) / n) * Math.PI * 2;
        const front = 0.5 + 0.5 * Math.cos(a);
        const rad = 0.094 - row * 0.012;
        const p = new THREE.Vector3(Math.sin(a) * rad, 0.268 - row * 0.022 - front * 0.01, Math.cos(a) * rad * 0.95 + 0.008);
        spike(0.042 + front * 0.022 - row * 0.01, 0.036 - row * 0.004, p,
          new THREE.Vector3(Math.sin(a), -0.35 - front * 0.25 - row * 0.2, Math.cos(a)));
      }
    }
    const ruff = new THREE.Mesh(mergeGeometries(spikes)!, creamMat);
    ruff.castShadow = true;
    rig.body.add(ruff);
    spikes.forEach((g) => g.dispose());
    spikes.length = 0;

    // Cheek and crown tufts on the head.
    for (const s of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const y = -0.04 + i * 0.022;
        spike(0.028, 0.013, new THREE.Vector3(s * 0.098, y, 0.006), new THREE.Vector3(s, -0.2 + i * 0.25, 0.1));
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.018;
      spike(0.024, 0.012, new THREE.Vector3(x, 0.098, 0.03), new THREE.Vector3(x * 3, 1, 0.5));
    }
    const tufts = new THREE.Mesh(mergeGeometries(spikes)!, creamMat);
    tufts.castShadow = true;
    rig.head.add(tufts);
    spikes.forEach((g) => g.dispose());
  }

  /* ---- Ears: tall, pointed, orange with a warm inner ---------------- */
  const earPivots: THREE.Group[] = [];
  const outerEar = ear(0.2, 0.076);
  const innerEar = ear(0.162, 0.054);
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.058, 0.066, -0.01);
    pivot.rotation.set(-0.12, 0, -s * 0.42);
    rig.head.add(pivot);
    earPivots.push(pivot);
    const o = new THREE.Mesh(outerEar, orangeMat);
    o.castShadow = true;
    pivot.add(o);
    const i = new THREE.Mesh(innerEar, innerMat);
    i.position.set(0, 0.016, 0.012);
    pivot.add(i);
  }

  /* ---- Wings: bat membranes with finger struts ---------------------- */
  const SPAN = 0.32;
  const { membrane, tips } = wingGeometry(SPAN);
  const struts: THREE.BufferGeometry[] = [];
  for (const t of tips) {
    const len = t.length();
    const g = new THREE.CylinderGeometry(0.0035, 0.006, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateZ(-Math.atan2(t.x, t.y));
    struts.push(g);
  }
  const strutGeo = mergeGeometries(struts)!;
  struts.forEach((g) => g.dispose());
  const wingPivots: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.07, 0.232, -0.05);
    pivot.rotation.y = s * -0.35;
    rig.body.add(pivot);
    wingPivots.push(pivot);
    const side = new THREE.Group();
    side.scale.x = s;
    pivot.add(side);
    const m = new THREE.Mesh(membrane, wingMat);
    m.castShadow = true;
    side.add(m);
    side.add(new THREE.Mesh(strutGeo, strutMat));
  }

  const anim = new IdleAnimator(rig, 44);
  let attention = 0;
  return {
    id: 'patamon',
    name: 'Patamon',
    group: rig.root,
    get attention() { return attention; },
    set attention(v: number) { attention = clamp(v, 0, 1); },
    update(dt, elapsed) {
      anim.update(dt, elapsed, attention);
      const flap = Math.sin(elapsed * 5.2) * (0.28 + attention * 0.12);
      wingPivots.forEach((p, i) => {
        p.rotation.z = (i === 0 ? 1 : -1) * (0.1 + flap);
      });
      earPivots.forEach((p, i) => {
        const s = i === 0 ? 1 : -1;
        p.rotation.z = -s * (0.42 + Math.sin(elapsed * 0.9 + i * 1.7) * 0.05);
      });
      rig.body.position.y = Math.sin(elapsed * 2.6) * 0.008;
    },
    celebrate: () => anim.celebrate(),
    dispose: () => disposeCreature(rig.root),
  };
}
