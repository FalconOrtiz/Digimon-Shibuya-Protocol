// Gold shots (ART_DIRECTION §1). Each shot freezes the clock and poses the
// player / camera so captures are reproducible frame to frame.

import * as THREE from 'three';
import type { Ctx } from '../core/Context';

export interface ShotPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface Shot {
  label: string;
  /** Returns a fixed camera pose, or null to keep the player camera. */
  apply(ctx: Ctx): ShotPose | null;
}

export const GOLDEN_HOUR = 17.0;
export const NIGHT_HOUR = 21.5;

function setHour(ctx: Ctx, hour: number): void {
  const dn = ctx.scene.userData.dayNight as { setHour(h: number): void; freeze(on: boolean): void } | undefined;
  dn?.setHour(hour);
  dn?.freeze(true);
}

function posePlayer(ctx: Ctx, x: number, z: number, yaw: number, pitch: number, view: 'fps' | 'trainer'): void {
  const p = ctx.peek<any>('player');
  if (!p) return;
  p.pos.set(x, p.height ?? 1.7, z);
  p.vel.set(0, 0, 0);
  p.yaw = yaw;
  p.pitch = pitch;
  p.viewMode = view;
  if (p.mesh) p.mesh.visible = view === 'trainer';
  const digimon = ctx.peek<any>('digimon');
  digimon?.snapToPlayer?.();
}

function fixed(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov = 60): ShotPose {
  return { position: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz), fov };
}

export const SHOTS: Record<string, Shot> = {
  'golden-fps': {
    label: 'GOLDEN 17:00 — FPS desde la cebra sur mirando al norte',
    apply(ctx) {
      setHour(ctx, GOLDEN_HOUR);
      posePlayer(ctx, 2, 16, 0.12, -0.06, 'fps');
      return null;
    },
  },
  'golden-trainer': {
    label: 'GOLDEN 17:00 — tercera persona con partner',
    apply(ctx) {
      setHour(ctx, GOLDEN_HOUR);
      posePlayer(ctx, 0, 12, 0, -0.1, 'trainer');
      return null;
    },
  },
  'golden-top': {
    label: 'GOLDEN 17:00 — vista aérea del cruce en X',
    apply(ctx) {
      setHour(ctx, GOLDEN_HOUR);
      posePlayer(ctx, 0, 12, 0, 0, 'trainer');
      return fixed(34, 62, 58, 0, 0, -4, 55);
    },
  },
  'night-fps': {
    label: 'NIGHT 21:30 — FPS desde la cebra sur mirando al norte',
    apply(ctx) {
      setHour(ctx, NIGHT_HOUR);
      posePlayer(ctx, 2, 16, 0.12, -0.02, 'fps');
      return null;
    },
  },
  'night-trainer': {
    label: 'NIGHT 21:30 — tercera persona con partner',
    apply(ctx) {
      setHour(ctx, NIGHT_HOUR);
      posePlayer(ctx, 0, 12, 0, -0.1, 'trainer');
      return null;
    },
  },
  'partner-agumon': {
    label: 'GOLDEN 17:00 — retrato de Agumon',
    apply(ctx) {
      setHour(ctx, GOLDEN_HOUR);
      posePlayer(ctx, 0, 14, 0, 0, 'fps');
      const d = ctx.peek<any>('digimon');
      d?.showcase?.('agumon', new THREE.Vector3(0, 0.28, 6));
      return fixed(1.4, 1.2, 9.2, 0, 0.75, 6, 38);
    },
  },
  'partner-patamon': {
    label: 'GOLDEN 17:00 — retrato de Patamon',
    apply(ctx) {
      setHour(ctx, GOLDEN_HOUR);
      posePlayer(ctx, 0, 14, 0, 0, 'fps');
      const d = ctx.peek<any>('digimon');
      d?.showcase?.('patamon', new THREE.Vector3(0, 0.28, 6));
      return fixed(1.2, 1.1, 8.6, 0, 0.8, 6, 38);
    },
  },
};
