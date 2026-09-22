import * as THREE from 'three';
import { makeRng } from '../core/Noise';

/**
 * BattleFX — efectos procedurales de ataque e impacto.
 *
 * Todo son Points aditivos: el prepass de GTAO los ignora, así que no dejan
 * oclusores fantasma en el AO. No crean luces (Atmosphere es el único dueño);
 * el brillo sale de colores HDR (>1) que el bloom recoge. Cada número
 * aleatorio viene del rng sembrado para que un combate repetido dé los mismos
 * frames. Las posiciones están en espacio de mundo.
 */

let dotTex: THREE.Texture | null = null;
function softDotTexture(): THREE.Texture {
  if (dotTex) return dotTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  dotTex = new THREE.CanvasTexture(canvas);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface Emitter {
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  parts: Particle[];
  gravity: number;
  drag: number;
  orbit?: { center: THREE.Vector3; angVel: number };
}

const UP = new THREE.Vector3(0, 1, 0);

export class BattleFX {
  readonly group = new THREE.Group();
  private emitters: Emitter[] = [];
  private rng: () => number;

  constructor(parent: THREE.Object3D, seed = 1) {
    this.group.name = 'BattleFX';
    this.rng = makeRng(seed >>> 0 || 1);
    parent.add(this.group);
  }

  reseed(seed: number): void {
    this.rng = makeRng(seed >>> 0 || 1);
  }

  private emitter(
    count: number,
    color: number,
    size: number,
    opts: { gravity?: number; drag?: number; orbit?: Emitter['orbit']; glow?: number; normal?: boolean; opacity?: number } = {},
  ): Emitter {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(color).multiplyScalar(opts.glow ?? 2.2),
      size,
      map: softDotTexture(),
      transparent: true,
      opacity: opts.opacity ?? 1,
      blending: opts.normal ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.group.add(points);
    const e: Emitter = { points, mat, parts: [], gravity: opts.gravity ?? 0, drag: opts.drag ?? 0, orbit: opts.orbit };
    this.emitters.push(e);
    return e;
  }

  /** Onda expansiva plana (entrada en escena, golpes grandes). */
  ring(pos: THREE.Vector3, color = 0x4de1ff, growTo = 1.6, life = 0.45): void {
    const N = 72;
    const e = this.emitter(N, color, 0.09, { glow: 2.6 });
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      e.parts.push({
        pos: pos.clone().add(new THREE.Vector3(0, 0.04, 0)).addScaledVector(dir, 0.12),
        vel: dir.multiplyScalar(growTo / Math.max(0.15, life)),
        life,
        maxLife: life,
      });
    }
  }

  /** Chispas ascendentes (materialización del partner). */
  sparkles(pos: THREE.Vector3, color = 0x9fe8ff, count = 42): void {
    const e = this.emitter(count, color, 0.04, { gravity: -1.6, drag: 1.4 });
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 0.3 + this.rng() * 1.1;
      e.parts.push({
        pos: pos.clone().add(new THREE.Vector3(0, 0.05, 0)),
        vel: new THREE.Vector3(Math.cos(a) * r, 0.6 + this.rng() * 1.6, Math.sin(a) * r),
        life: 0.5 + this.rng() * 0.35,
        maxLife: 0.85,
      });
    }
  }

  /** Estrella de impacto radial: el frame universal de "golpe". */
  impact(pos: THREE.Vector3, color = 0xffe9a8, strength = 1): void {
    const count = Math.round(26 * strength + 14);
    const e = this.emitter(count, color, 0.055 * Math.min(1.6, strength), { drag: 4.2, glow: 2.6 + strength });
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const b = (this.rng() - 0.5) * Math.PI;
      const sp = (1.6 + this.rng() * 3.4) * strength;
      e.parts.push({
        pos: pos.clone(),
        vel: new THREE.Vector3(Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp * 0.7, Math.sin(a) * Math.cos(b) * sp),
        life: 0.22 + this.rng() * 0.2,
        maxLife: 0.42,
      });
    }
  }

  /** Polvo de suelo (caídas, aterrizajes). */
  dust(pos: THREE.Vector3, count = 26): void {
    const e = this.emitter(count, 0x9a8f78, 0.1, { gravity: 0.6, drag: 2.6, glow: 1, normal: true, opacity: 0.55 });
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const sp = 0.5 + this.rng() * 1.2;
      e.parts.push({
        pos: pos.clone().add(new THREE.Vector3(0, 0.04, 0)),
        vel: new THREE.Vector3(Math.cos(a) * sp, 0.5 + this.rng() * 0.8, Math.sin(a) * sp),
        life: 0.45 + this.rng() * 0.35,
        maxLife: 0.8,
      });
    }
  }

  /** Fuego: volea en arco de chispas calientes de la boca al objetivo. */
  fireArc(from: THREE.Vector3, to: THREE.Vector3, dur = 0.4): void {
    const count = 56;
    const e = this.emitter(count, 0xff8a30, 0.065, { gravity: -3.4, drag: 0.15, glow: 3.2 });
    const flat = to.clone().sub(from);
    for (let i = 0; i < count; i++) {
      const t = dur * (0.75 + this.rng() * 0.45);
      const vel = flat.clone().multiplyScalar(1 / t).add(new THREE.Vector3(0, 0.5 * 3.4 * t + 0.4 + this.rng() * 0.5, 0));
      vel.x += (this.rng() - 0.5) * 0.8;
      vel.z += (this.rng() - 0.5) * 0.8;
      e.parts.push({
        pos: from.clone().add(new THREE.Vector3((this.rng() - 0.5) * 0.1, (this.rng() - 0.5) * 0.1, 0)),
        vel,
        life: t,
        maxLife: t,
      });
    }
  }

  /** Burbujas: chorro lento y ondulante. */
  bubbles(from: THREE.Vector3, to: THREE.Vector3, dur = 0.5): void {
    const count = 34;
    const e = this.emitter(count, 0x9fdcff, 0.11, { gravity: 0.4, drag: 0.2, glow: 1.6, opacity: 0.85 });
    const dir = to.clone().sub(from);
    for (let i = 0; i < count; i++) {
      const delay = (i / count) * dur * 0.5;
      const vel = dir.clone().multiplyScalar(1 / (dur * 0.7));
      vel.x += (this.rng() - 0.5) * 0.6;
      vel.y += (this.rng() - 0.5) * 0.4;
      vel.z += (this.rng() - 0.5) * 0.6;
      e.parts.push({ pos: from.clone().addScaledVector(vel, -delay), vel, life: dur * 0.7 + delay, maxLife: dur * 1.2 });
    }
  }

  /** Ráfaga: vórtice alrededor del objetivo. */
  gust(center: THREE.Vector3, dur = 0.7): void {
    const count = 80;
    const e = this.emitter(count, 0xd8ecff, 0.045, { orbit: { center: center.clone(), angVel: 9 }, opacity: 0.8 });
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 0.25 + this.rng() * 0.55;
      e.parts.push({
        pos: new THREE.Vector3(center.x + Math.cos(a) * r, center.y + this.rng() * 0.9, center.z + Math.sin(a) * r),
        vel: new THREE.Vector3(0, 0.8 + this.rng() * 0.9, 0),
        life: dur * (0.5 + this.rng() * 0.5),
        maxLife: dur,
      });
    }
  }

  /** Luz sagrada: columna dorada que cae sobre el objetivo. */
  holyBeam(center: THREE.Vector3, dur = 0.55): void {
    const count = 70;
    const e = this.emitter(count, 0xffe7a0, 0.06, { drag: 0.4, glow: 3.4 });
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = this.rng() * 0.35;
      e.parts.push({
        pos: new THREE.Vector3(center.x + Math.cos(a) * r, center.y + 2.2 + this.rng() * 1.2, center.z + Math.sin(a) * r),
        vel: new THREE.Vector3(0, -5 - this.rng() * 2, 0),
        life: dur * (0.6 + this.rng() * 0.4),
        maxLife: dur,
      });
    }
  }

  /** Estela de embestida a lo largo de la línea de carga. */
  dashStreak(from: THREE.Vector3, to: THREE.Vector3, color = 0xffffff): void {
    const count = 30;
    const e = this.emitter(count, color, 0.07, { drag: 6, opacity: 0.55 });
    for (let i = 0; i < count; i++) {
      const t = i / count;
      e.parts.push({
        pos: from.clone().lerp(to, t).add(new THREE.Vector3(0, 0.2 + this.rng() * 0.25, 0)),
        vel: new THREE.Vector3((this.rng() - 0.5) * 0.4, (this.rng() - 0.5) * 0.4, (this.rng() - 0.5) * 0.4),
        life: 0.12 + t * 0.14,
        maxLife: 0.26,
      });
    }
  }

  /** Anillos sónicos hacia el objetivo (moves de estado, Air Shot). */
  sonicRings(from: THREE.Vector3, to: THREE.Vector3): void {
    const dir = to.clone().sub(from).normalize();
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const vUp = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let i = 0; i < 3; i++) {
      const N = 36;
      const life = 0.4 + i * 0.12;
      const e = this.emitter(N, 0xfff0c4, 0.05, { opacity: 0.7 });
      const origin = from.clone().addScaledVector(dir, 0.4 + i * 0.4).add(new THREE.Vector3(0, 0.35, 0));
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        const rad = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(vUp, Math.sin(a));
        e.parts.push({
          pos: origin.clone().addScaledVector(rad, 0.12),
          vel: rad.clone().multiplyScalar(0.9).addScaledVector(dir, 1.6),
          life,
          maxLife: life,
        });
      }
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (let ei = this.emitters.length - 1; ei >= 0; ei--) {
      const e = this.emitters[ei];
      const posAttr = e.points.geometry.attributes.position as THREE.BufferAttribute;
      let alive = 0;
      let maxFrac = 0;
      for (const p of e.parts) {
        p.life -= dt;
        if (p.life <= 0) continue;
        if (e.orbit) {
          const ox = p.pos.x - e.orbit.center.x;
          const oz = p.pos.z - e.orbit.center.z;
          const a = e.orbit.angVel * dt;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          p.pos.set(e.orbit.center.x + ox * cos - oz * sin, p.pos.y + p.vel.y * dt, e.orbit.center.z + ox * sin + oz * cos);
        } else {
          p.vel.y += e.gravity * dt;
          if (e.drag > 0) p.vel.multiplyScalar(Math.max(0, 1 - e.drag * dt));
          p.pos.addScaledVector(p.vel, dt);
        }
        posAttr.setXYZ(alive, p.pos.x, p.pos.y, p.pos.z);
        maxFrac = Math.max(maxFrac, p.life / p.maxLife);
        alive++;
      }
      if (alive === 0) {
        this.group.remove(e.points);
        e.points.geometry.dispose();
        e.mat.dispose();
        this.emitters.splice(ei, 1);
        continue;
      }
      e.points.geometry.setDrawRange(0, alive);
      posAttr.needsUpdate = true;
      e.mat.opacity = Math.min(e.mat.opacity, 0.15 + maxFrac * 0.85);
    }
  }

  clear(): void {
    for (const e of this.emitters) {
      this.group.remove(e.points);
      e.points.geometry.dispose();
      e.mat.dispose();
    }
    this.emitters = [];
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
