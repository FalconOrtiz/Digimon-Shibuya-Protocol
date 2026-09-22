import * as THREE from 'three';
import { makeRng } from '../core/Noise';

/**
 * BattleFX — procedural attack and impact effects.
 *
 * Two pooled GPU particle systems (additive glow + normal-blend smoke) carry
 * every spark, ember, bubble and puff with per-particle colour, size-over-life
 * and shape, so a whole volley is two draw calls. Mesh effects (shockwaves,
 * flares, slashes, pillars, projectiles) are short-lived meshes on shared
 * shaders. No lights are created (Atmosphere owns lighting): brightness comes
 * from HDR colours the bloom picks up. All randomness is from the seeded rng
 * so a replayed battle renders the same frames. Positions are world space.
 */

const UP = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

const Shape = { Dot: 0, Star: 1, Puff: 2, Bubble: 3, Streak: 4 } as const;
type Shape = (typeof Shape)[keyof typeof Shape];

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  /** Size multiplier at the end of life (1 = constant). */
  grow: number;
  color: THREE.Color;
  shape: Shape;
  gravity: number;
  drag: number;
  orbit?: { center: THREE.Vector3; angVel: number };
  /** Called every step; used by projectiles to follow a path. */
  steer?: (p: Particle, dt: number) => void;
}

const PARTICLE_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aLife;
  attribute float aShape;
  uniform float uScale;
  varying vec3 vColor;
  varying float vLife;
  varying float vShape;
  void main() {
    vColor = aColor;
    vLife = aLife;
    vShape = aShape;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 256.0);
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform float uSmoke;
  varying vec3 vColor;
  varying float vLife;
  varying float vShape;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a;
    float core = 0.0;
    if (vShape < 0.5) {
      a = pow(1.0 - r, 1.6);
      core = smoothstep(0.45, 0.0, r);
    } else if (vShape < 1.5) {
      float rays = exp(-abs(p.x) * 14.0) * (1.0 - abs(p.y)) + exp(-abs(p.y) * 14.0) * (1.0 - abs(p.x));
      vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071;
      rays += 0.5 * (exp(-abs(q.x) * 18.0) * (1.0 - abs(q.y)) + exp(-abs(q.y) * 18.0) * (1.0 - abs(q.x)));
      a = clamp(rays + pow(1.0 - r, 3.0), 0.0, 1.0);
      core = smoothstep(0.3, 0.0, r);
    } else if (vShape < 2.5) {
      a = smoothstep(1.0, 0.15, r) * (0.75 + 0.25 * sin(p.x * 7.0 + p.y * 5.0));
    } else if (vShape < 3.5) {
      a = smoothstep(1.0, 0.82, r) * smoothstep(0.55, 0.85, r) + 0.12 * smoothstep(1.0, 0.0, r);
      a += smoothstep(0.22, 0.0, length(p - vec2(-0.35, 0.35))) * 0.9;
    } else {
      a = exp(-abs(p.x) * 7.0) * smoothstep(1.0, 0.2, abs(p.y));
      core = exp(-abs(p.x) * 16.0) * smoothstep(0.8, 0.0, abs(p.y));
    }
    float fade = smoothstep(0.0, 0.3, vLife);
    if (uSmoke > 0.5) {
      gl_FragColor = vec4(vColor, a * fade * 0.55);
      return;
    }
    // Hot white core early in life, the particle's own colour as it cools.
    vec3 col = vColor * a + vec3(1.0, 0.97, 0.9) * core * (0.4 + vLife) * 2.0;
    gl_FragColor = vec4(col * fade, a * fade);
  }
`;

class ParticlePool {
  readonly points: THREE.Points;
  readonly parts: Particle[] = [];
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private readonly size: THREE.BufferAttribute;
  private readonly life: THREE.BufferAttribute;
  private readonly shape: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(readonly capacity: number, smoke: boolean) {
    const f = (n: number) => new THREE.BufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    this.pos = f(3);
    this.col = f(3);
    this.size = f(1);
    this.life = f(1);
    this.shape = f(1);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('aColor', this.col);
    this.geo.setAttribute('aSize', this.size);
    this.geo.setAttribute('aLife', this.life);
    this.geo.setAttribute('aShape', this.shape);
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      name: smoke ? 'fx.smoke' : 'fx.glow',
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uScale: { value: 450 }, uSmoke: { value: smoke ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = smoke ? 1 : 2;
    const size = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, _s, camera) => {
      renderer.getDrawingBufferSize(size);
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
      this.material.uniforms.uScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    };
  }

  /** Drops the particle when full: effects spawn particles mid-update, so the list must only grow at the end. */
  add(p: Particle): void {
    if (this.parts.length < this.capacity) this.parts.push(p);
  }

  update(dt: number): void {
    let n = 0;
    const list = this.parts;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.steer) p.steer(p, dt);
      else if (p.orbit) {
        const ox = p.pos.x - p.orbit.center.x;
        const oz = p.pos.z - p.orbit.center.z;
        const a = p.orbit.angVel * dt;
        const c = Math.cos(a);
        const s = Math.sin(a);
        p.pos.set(p.orbit.center.x + ox * c - oz * s, p.pos.y + p.vel.y * dt, p.orbit.center.z + ox * s + oz * c);
      } else {
        p.vel.y += p.gravity * dt;
        if (p.drag > 0) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.pos.addScaledVector(p.vel, dt);
      }
      const k = p.life / p.maxLife;
      this.pos.setXYZ(n, p.pos.x, p.pos.y, p.pos.z);
      this.col.setXYZ(n, p.color.r, p.color.g, p.color.b);
      this.size.setX(n, p.size * (p.grow + (1 - p.grow) * k));
      this.life.setX(n, k);
      this.shape.setX(n, p.shape);
      list[n] = p;
      n++;
    }
    list.length = n;
    this.geo.setDrawRange(0, n);
    for (const a of [this.pos, this.col, this.size, this.life, this.shape]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  clear(): void {
    this.parts.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Mesh effects                                                        */
/* ------------------------------------------------------------------ */

interface MeshFx {
  obj: THREE.Object3D;
  life: number;
  maxLife: number;
  /** t runs 0 → 1 over the effect's life. */
  tick(t: number, dt: number): void;
  dispose(): void;
}

const SHOCK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uT;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float R = 1.0 - pow(1.0 - uT, 3.0);
    float w = mix(0.22, 0.04, uT);
    float ring = smoothstep(w, 0.0, abs(r - R));
    float fill = smoothstep(R, 0.0, r) * 0.25 * (1.0 - uT);
    float a = (ring + fill) * (1.0 - uT) * step(r, 1.0);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const SLASH_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uT;
  uniform float uArc;
  varying vec3 vLocal;
  void main() {
    float ang = atan(vLocal.y, vLocal.x) / uArc;
    float head = uT * 1.35;
    float body = smoothstep(head - 0.55, head, ang) * step(ang, head);
    float rad = length(vLocal.xy);
    float edge = smoothstep(0.0, 0.5, 1.0 - abs((rad - 0.8) / 0.12));
    float a = body * edge * (1.0 - smoothstep(0.7, 1.0, uT));
    vec3 col = mix(uColor, vec3(1.6), edge * edge * 0.6);
    gl_FragColor = vec4(col * a, a);
  }
`;

const PILLAR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uT;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.5);
    float stripes = 0.65 + 0.35 * sin(vUv.y * 30.0 - uTime * 18.0 + vUv.x * 12.566);
    float vert = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
    float life = smoothstep(0.0, 0.15, uT) * (1.0 - smoothstep(0.6, 1.0, uT));
    float a = (0.35 + fres) * stripes * vert * life;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const BASIC_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

function fxMaterial(frag: string, color: THREE.Color, extra: Record<string, THREE.IUniform> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BASIC_VERT,
    fragmentShader: frag,
    uniforms: { uColor: { value: color }, uT: { value: 0 }, ...extra },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

let flareTex: THREE.Texture | null = null;
function flareTexture(): THREE.Texture {
  if (flareTex) return flareTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.18, 'rgba(255,255,255,0.8)');
  rg.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (const [w, len, rot] of [[3, 0.5, 0], [3, 0.5, Math.PI / 2], [2, 0.32, Math.PI / 4], [2, 0.32, -Math.PI / 4]]) {
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(rot);
    const lg = g.createLinearGradient(-S * len, 0, S * len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(-S * len, -w / 2, S * len * 2, w);
    g.restore();
  }
  flareTex = new THREE.CanvasTexture(c);
  flareTex.colorSpace = THREE.SRGBColorSpace;
  return flareTex;
}

const hdr = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);

/* ------------------------------------------------------------------ */
/* BattleFX                                                            */
/* ------------------------------------------------------------------ */

export class BattleFX {
  readonly group = new THREE.Group();
  private glow = new ParticlePool(2400, false);
  private smoke = new ParticlePool(500, true);
  private meshes: MeshFx[] = [];
  private rng: () => number;
  private time = 0;

  constructor(parent: THREE.Object3D, seed = 1) {
    this.group.name = 'BattleFX';
    this.group.userData.noAO = true;
    this.rng = makeRng(seed >>> 0 || 1);
    this.group.add(this.smoke.points, this.glow.points);
    parent.add(this.group);
  }

  reseed(seed: number): void {
    this.rng = makeRng(seed >>> 0 || 1);
  }

  private r(a = 0, b = 1): number {
    return a + (b - a) * this.rng();
  }

  private spark(p: Partial<Particle> & { pos: THREE.Vector3; vel: THREE.Vector3; life: number; color: THREE.Color }): void {
    this.glow.add({ maxLife: p.life, size: 0.08, grow: 0.3, shape: Shape.Dot, gravity: 0, drag: 0, ...p });
  }

  private puff(p: Partial<Particle> & { pos: THREE.Vector3; vel: THREE.Vector3; life: number; color: THREE.Color }): void {
    this.smoke.add({ maxLife: p.life, size: 0.5, grow: 2.2, shape: Shape.Puff, gravity: 0.4, drag: 2.5, ...p });
  }

  private addMesh(fx: MeshFx): void {
    this.group.add(fx.obj);
    this.meshes.push(fx);
  }

  /* ---- Mesh primitives ------------------------------------------------ */

  /** Ground shockwave: an expanding ring with a soft fill. */
  shockwave(pos: THREE.Vector3, color = 0x4de1ff, radius = 1.6, life = 0.5, intensity = 2.4): void {
    const mat = fxMaterial(SHOCK_FRAG, hdr(color, intensity));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).setY(pos.y + 0.05);
    m.scale.setScalar(radius);
    m.renderOrder = 3;
    this.addMesh({
      obj: m, life, maxLife: life,
      tick: (t) => (mat.uniforms.uT.value = t),
      dispose: () => (m.geometry.dispose(), mat.dispose()),
    });
  }

  /** Camera-facing flare burst: the bright frame of a hit. */
  flash(pos: THREE.Vector3, color = 0xfff0c4, size = 1.4, life = 0.16): void {
    const mat = new THREE.SpriteMaterial({
      map: flareTexture(), color: hdr(color, 3.2), blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, transparent: true,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.renderOrder = 5;
    const rot = this.r(0, Math.PI);
    this.addMesh({
      obj: s, life, maxLife: life,
      tick: (t) => {
        const k = t < 0.2 ? t / 0.2 : 1;
        s.scale.setScalar(size * (0.4 + 0.8 * k));
        mat.rotation = rot + t * 0.6;
        mat.opacity = 1 - t * t;
      },
      dispose: () => mat.dispose(),
    });
  }

  /** Crescent claw slash sweeping across `pos`, facing `dir`. */
  slash(pos: THREE.Vector3, dir: THREE.Vector3, color = 0xffffff, scale = 0.9, tilt = 0.5, life = 0.26): void {
    const arc = Math.PI * 0.85;
    const mat = fxMaterial(SLASH_FRAG, hdr(color, 2.6), { uArc: { value: arc } });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.92, 40, 1, 0, arc), mat);
    const d = dir.clone().setY(0).normalize();
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    m.rotateZ(Math.PI * 0.62 + tilt);
    m.scale.setScalar(scale);
    m.renderOrder = 4;
    this.addMesh({
      obj: m, life, maxLife: life,
      tick: (t) => (mat.uniforms.uT.value = t),
      dispose: () => (m.geometry.dispose(), mat.dispose()),
    });
  }

  /** Column of light over a point (holy, digivolution, ULT). */
  pillar(pos: THREE.Vector3, color = 0xffe7a0, radius = 0.7, height = 5, life = 0.9): void {
    const mat = fxMaterial(PILLAR_FRAG, hdr(color, 2.2), { uTime: { value: 0 } });
    const geo = new THREE.CylinderGeometry(radius, radius * 1.25, height, 32, 1, true);
    geo.translate(0, height / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.renderOrder = 3;
    this.addMesh({
      obj: m, life, maxLife: life,
      tick: (t) => {
        mat.uniforms.uT.value = t;
        mat.uniforms.uTime.value = this.time;
        m.scale.set(0.6 + 0.5 * Math.min(1, t * 4), 1, 0.6 + 0.5 * Math.min(1, t * 4));
      },
      dispose: () => (geo.dispose(), mat.dispose()),
    });
  }

  /** Energy gathering into a point (windups, digivolution, ULT). */
  charge(pos: THREE.Vector3, color = 0x6ef0ff, dur = 0.8, count = 60): void {
    for (let i = 0; i < count; i++) {
      const d = new THREE.Vector3(this.r(-1, 1), this.r(-0.6, 1), this.r(-1, 1)).normalize();
      const r0 = this.r(0.9, 1.6);
      const life = dur * this.r(0.55, 1);
      const start = pos.clone().addScaledVector(d, r0);
      this.glow.add({
        pos: start.clone(), vel: new THREE.Vector3(), life, maxLife: life, size: this.r(0.05, 0.09), grow: 0.4,
        color: hdr(color, 2.6), shape: i % 4 === 0 ? Shape.Star : Shape.Streak, gravity: 0, drag: 0,
        steer: (p) => {
          const k = 1 - p.life / p.maxLife;
          p.pos.lerpVectors(start, pos, k * k);
        },
      });
    }
    this.flash(pos, color, 0.9, dur);
  }

  /* ---- Composite effects (public API used by BattleSystem) ---------- */

  /** Flat expanding ring of light (entrances, big hits). */
  ring(pos: THREE.Vector3, color = 0x4de1ff, growTo = 1.6, life = 0.45): void {
    this.shockwave(pos, color, growTo * 1.4, life + 0.1);
    const N = 48;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      this.spark({
        pos: pos.clone().add(new THREE.Vector3(0, 0.05, 0)).addScaledVector(dir, 0.15),
        vel: dir.multiplyScalar(growTo / Math.max(0.15, life)).add(new THREE.Vector3(0, this.r(0.2, 1.2), 0)),
        life, color: hdr(color, 2.4), size: 0.07, drag: 1.2,
      });
    }
  }

  /** Rising motes (partner materialising, defend success). */
  sparkles(pos: THREE.Vector3, color = 0x9fe8ff, count = 42): void {
    for (let i = 0; i < count; i++) {
      const a = this.r(0, Math.PI * 2);
      const r = this.r(0.3, 1.4);
      this.spark({
        pos: pos.clone().add(new THREE.Vector3(0, 0.05, 0)),
        vel: new THREE.Vector3(Math.cos(a) * r, this.r(0.6, 2.2), Math.sin(a) * r),
        life: this.r(0.5, 0.9), color: hdr(color, 2.4), size: this.r(0.04, 0.08),
        shape: i % 3 === 0 ? Shape.Star : Shape.Dot, gravity: -1.6, drag: 1.4, grow: 0.2,
      });
    }
  }

  /** Radial impact: flare, star sparks, embers, shock ring and dust. */
  impact(pos: THREE.Vector3, color = 0xffe9a8, strength = 1): void {
    const s = Math.min(2.4, strength);
    this.flash(pos, color, 1.1 + s * 0.6, 0.14 + s * 0.04);
    const count = Math.round(22 * s + 14);
    for (let i = 0; i < count; i++) {
      const a = this.r(0, Math.PI * 2);
      const b = this.r(-0.5, 0.9) * Math.PI * 0.5;
      const sp = this.r(2, 6) * s;
      this.spark({
        pos: pos.clone(),
        vel: new THREE.Vector3(Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp, Math.sin(a) * Math.cos(b) * sp),
        life: this.r(0.18, 0.42), color: hdr(color, 2.8 + s), size: this.r(0.035, 0.07) * (0.8 + s * 0.3),
        shape: i % 5 === 0 ? Shape.Star : Shape.Streak, drag: 4.5, gravity: -6, grow: 0.1,
      });
    }
    for (let i = 0; i < 10 * s; i++) {
      this.spark({
        pos: pos.clone(),
        vel: new THREE.Vector3(this.r(-1.5, 1.5), this.r(1, 3.5), this.r(-1.5, 1.5)),
        life: this.r(0.5, 0.9), color: hdr(0xffb060, 2.2), size: 0.035, gravity: -7, drag: 0.8, grow: 0.5,
      });
    }
    if (s >= 1) {
      const ground = pos.clone();
      ground.y = Math.max(0, pos.y - 0.6);
      this.shockwave(ground, color, 1 + s * 0.6, 0.4);
    }
    this.dust(pos.clone().setY(Math.max(0, pos.y - 0.6)), Math.round(6 * s));
  }

  /** Ground dust (falls, landings, dashes). */
  dust(pos: THREE.Vector3, count = 26): void {
    for (let i = 0; i < count; i++) {
      const a = this.r(0, Math.PI * 2);
      const sp = this.r(0.5, 1.8);
      this.puff({
        pos: pos.clone().add(new THREE.Vector3(0, 0.08, 0)),
        vel: new THREE.Vector3(Math.cos(a) * sp, this.r(0.3, 1), Math.sin(a) * sp),
        life: this.r(0.5, 1), color: new THREE.Color(0xb8ab94), size: this.r(0.25, 0.45),
      });
    }
  }

  /** Smoke column after fire / explosions. */
  smokePuffs(pos: THREE.Vector3, count = 12, color = 0x4a4450): void {
    for (let i = 0; i < count; i++) {
      this.puff({
        pos: pos.clone().add(new THREE.Vector3(this.r(-0.3, 0.3), this.r(-0.1, 0.3), this.r(-0.3, 0.3))),
        vel: new THREE.Vector3(this.r(-0.4, 0.4), this.r(0.6, 1.6), this.r(-0.4, 0.4)),
        life: this.r(0.7, 1.3), color: new THREE.Color(color), size: this.r(0.35, 0.6), gravity: 0.3, drag: 1.2, grow: 2.6,
      });
    }
  }

  /** Fire: a fireball on an arc with a flame trail; explodes on arrival. */
  fireArc(from: THREE.Vector3, to: THREE.Vector3, dur = 0.4): void {
    this.flash(from, 0xffa040, 0.9, 0.12);
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.55, 0));
    const at = (t: number, out: THREE.Vector3) => {
      const u = 1 - t;
      return out.set(0, 0, 0).addScaledVector(from, u * u).addScaledVector(mid, 2 * u * t).addScaledVector(to, t * t);
    };
    const tmp = new THREE.Vector3();
    const tail = 0.15;
    const travel = (p: { life: number; maxLife: number }) => Math.min(1, (p.maxLife - p.life) / dur);
    let emitAcc = 0;
    this.glow.add({
      pos: from.clone(), vel: new THREE.Vector3(), life: dur + tail, maxLife: dur + tail, size: 0.95, grow: 1.1,
      color: hdr(0xff8a30, 3.4), shape: Shape.Dot, gravity: 0, drag: 0,
      steer: (p, dt) => {
        at(travel(p), p.pos);
        emitAcc += dt;
        while (emitAcc > 1 / 160) {
          emitAcc -= 1 / 160;
          this.spark({
            pos: tmp.copy(p.pos).add(new THREE.Vector3(this.r(-0.08, 0.08), this.r(-0.08, 0.08), this.r(-0.08, 0.08))).clone(),
            vel: new THREE.Vector3(this.r(-0.6, 0.6), this.r(0.4, 1.4), this.r(-0.6, 0.6)),
            life: this.r(0.18, 0.36), color: hdr(this.rng() < 0.5 ? 0xff6a20 : 0xffc040, 3), size: this.r(0.12, 0.22),
            gravity: 1.5, drag: 1.5, grow: 0.15,
          });
        }
      },
    });
    this.glow.add({
      pos: from.clone(), vel: new THREE.Vector3(), life: dur + tail, maxLife: dur + tail, size: 0.42, grow: 1,
      color: hdr(0xfff0c0, 4), shape: Shape.Star, gravity: 0, drag: 0,
      steer: (p) => at(travel(p), p.pos),
    });
    this.delay(dur, () => {
      this.flash(to, 0xffb050, 2.2, 0.2);
      this.shockwave(to.clone().setY(Math.max(0, to.y - 0.6)), 0xff7a30, 2, 0.5, 2.8);
      for (let i = 0; i < 46; i++) {
        const d = new THREE.Vector3(this.r(-1, 1), this.r(-0.2, 1), this.r(-1, 1)).normalize();
        this.spark({
          pos: to.clone(), vel: d.multiplyScalar(this.r(1.5, 4.5)), life: this.r(0.3, 0.6),
          color: hdr(this.rng() < 0.5 ? 0xff5a18 : 0xffb030, 3), size: this.r(0.12, 0.26), drag: 3, gravity: 1, grow: 0.2,
        });
      }
      this.smokePuffs(to, 10);
    });
  }

  /** Bubbles: a wobbling stream of glossy bubbles that pop on the target. */
  bubbles(from: THREE.Vector3, to: THREE.Vector3, dur = 0.5): void {
    const count = 26;
    for (let i = 0; i < count; i++) {
      const delay = (i / count) * dur * 0.45;
      const life = dur * 0.75;
      const start = from.clone();
      const wob = this.r(0, Math.PI * 2);
      const amp = this.r(0.05, 0.22);
      const size = this.r(0.12, 0.26);
      this.delay(delay, () => {
        this.glow.add({
          pos: start.clone(), vel: new THREE.Vector3(), life, maxLife: life, size, grow: 1.1,
          color: hdr(0x9fdcff, 1.8), shape: Shape.Bubble, gravity: 0, drag: 0,
          steer: (p) => {
            const k = 1 - p.life / p.maxLife;
            p.pos.lerpVectors(start, to, k);
            p.pos.y += Math.sin(k * 9 + wob) * amp;
            p.pos.x += Math.cos(k * 7 + wob) * amp * 0.6;
          },
        });
      });
    }
    this.delay(dur * 0.8, () => {
      for (let i = 0; i < 30; i++) {
        const d = new THREE.Vector3(this.r(-1, 1), this.r(-0.5, 1), this.r(-1, 1)).normalize();
        this.spark({
          pos: to.clone(), vel: d.multiplyScalar(this.r(1, 3)), life: this.r(0.25, 0.45),
          color: hdr(0xc8f0ff, 2.4), size: this.r(0.03, 0.06), drag: 3, gravity: -4,
        });
      }
      this.shockwave(to.clone().setY(Math.max(0, to.y - 0.6)), 0x7ac0ff, 1.4, 0.4);
    });
  }

  /** Gust: a rising vortex of wind streaks around the target. */
  gust(center: THREE.Vector3, dur = 0.7): void {
    for (let i = 0; i < 90; i++) {
      const a = this.r(0, Math.PI * 2);
      const r = this.r(0.3, 0.9);
      this.glow.add({
        pos: new THREE.Vector3(center.x + Math.cos(a) * r, center.y + this.r(0, 0.4), center.z + Math.sin(a) * r),
        vel: new THREE.Vector3(0, this.r(1, 2.4), 0), life: dur * this.r(0.5, 1), maxLife: dur,
        size: this.r(0.08, 0.16), grow: 0.4, color: hdr(0xd8ecff, 1.6), shape: Shape.Streak, gravity: 0, drag: 0,
        orbit: { center: center.clone(), angVel: this.r(8, 12) },
      });
    }
    for (let i = 0; i < 3; i++) this.delay(i * 0.12, () => this.shockwave(center.clone().setY(center.y + i * 0.4), 0xd8ecff, 1.1 + i * 0.3, 0.45, 1.4));
    this.dust(center, 14);
  }

  /** Holy light: a golden pillar with falling motes and a ground halo. */
  holyBeam(center: THREE.Vector3, dur = 0.55): void {
    const ground = center.clone().setY(Math.max(0, center.y - 0.6));
    this.pillar(ground, 0xffe7a0, 0.75, 6, dur + 0.35);
    this.shockwave(ground, 0xffd870, 1.8, dur + 0.2, 2.6);
    for (let i = 0; i < 70; i++) {
      const a = this.r(0, Math.PI * 2);
      const r = this.r(0, 0.6);
      this.spark({
        pos: new THREE.Vector3(center.x + Math.cos(a) * r, center.y + this.r(1.5, 3.6), center.z + Math.sin(a) * r),
        vel: new THREE.Vector3(0, this.r(-7, -4), 0), life: dur * this.r(0.6, 1),
        color: hdr(0xffe7a0, 3.2), size: this.r(0.04, 0.09), shape: i % 3 === 0 ? Shape.Star : Shape.Streak, drag: 0.4,
      });
    }
    this.delay(dur * 0.7, () => this.flash(center, 0xfff2c0, 2.4, 0.22));
  }

  /** Charge trail along a dash line, with speed streaks and kicked-up dust. */
  dashStreak(from: THREE.Vector3, to: THREE.Vector3, color = 0xffffff): void {
    const dir = to.clone().sub(from).normalize();
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      this.spark({
        pos: from.clone().lerp(to, t).add(new THREE.Vector3(this.r(-0.25, 0.25), this.r(0.1, 0.6), this.r(-0.25, 0.25))),
        vel: dir.clone().multiplyScalar(this.r(2, 5)), life: 0.12 + t * 0.18,
        color: hdr(color, 1.6), size: this.r(0.08, 0.16), shape: Shape.Streak, drag: 6, grow: 0.2,
      });
    }
    this.dust(from.clone().setY(Math.max(0, from.y - 0.6)), 8);
  }

  /** Three claw slashes raked across the target. */
  claws(at: THREE.Vector3, facing: THREE.Vector3, color = 0xffffff): void {
    const side = new THREE.Vector3().crossVectors(facing, UP).normalize();
    for (let i = 0; i < 3; i++) {
      this.delay(i * 0.04, () => {
        const p = at.clone().addScaledVector(side, (i - 1) * 0.16).add(new THREE.Vector3(0, (1 - i) * 0.05, 0));
        this.slash(p, facing, color, 0.8, 0.35, 0.24);
      });
    }
  }

  /** Sonic rings toward the target (status moves, Air Shot). */
  sonicRings(from: THREE.Vector3, to: THREE.Vector3): void {
    const dir = to.clone().sub(from).normalize();
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const vUp = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let i = 0; i < 4; i++) {
      const N = 36;
      const life = 0.4 + i * 0.1;
      const origin = from.clone().addScaledVector(dir, 0.4 + i * 0.35).add(new THREE.Vector3(0, 0.3, 0));
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        const rad = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(vUp, Math.sin(a));
        this.spark({
          pos: origin.clone().addScaledVector(rad, 0.12),
          vel: rad.clone().multiplyScalar(1.1).addScaledVector(dir, 2),
          life, color: hdr(0xfff0c4, 1.8), size: 0.05, grow: 0.6,
        });
      }
    }
  }

  /* ---- Scheduling ------------------------------------------------------ */

  private timers: { at: number; fn: () => void }[] = [];

  /** Runs `fn` after `sec` of FX time, so effects follow the battle's time scale. */
  delay(sec: number, fn: () => void): void {
    if (sec <= 0) fn();
    else this.timers.push({ at: this.time + sec, fn });
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    for (let i = this.meshes.length - 1; i >= 0; i--) {
      const m = this.meshes[i];
      m.life -= dt;
      if (m.life <= 0) {
        this.group.remove(m.obj);
        m.dispose();
        this.meshes.splice(i, 1);
        continue;
      }
      m.tick(1 - m.life / m.maxLife, dt);
    }
  }

  clear(): void {
    this.glow.clear();
    this.smoke.clear();
    this.timers = [];
    for (const m of this.meshes) {
      this.group.remove(m.obj);
      m.dispose();
    }
    this.meshes = [];
  }

  dispose(): void {
    this.clear();
    this.glow.dispose();
    this.smoke.dispose();
    this.group.removeFromParent();
  }
}
