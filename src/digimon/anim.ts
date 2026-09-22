import * as THREE from 'three';
import type { Creature } from './shared';

/**
 * Action layer over a sculpted Digimon. The creature's own IdleAnimator
 * breathes, blinks and sways; this drives whole-body actions on the `pose`
 * group (walk bob, attack lunge, hit recoil, faint, victory hop) and fires
 * `onDone` so battle timelines can chain on it.
 */

export type AnimState = 'idle' | 'walk' | 'attack' | 'hit' | 'death' | 'win';

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class DigimonAnimator {
  state: AnimState = 'idle';
  private t = 0;
  private duration = 1;
  private elapsed = 0;
  private onDone: (() => void) | null = null;
  private readonly pose: THREE.Object3D;
  private readonly creature: Creature;
  private readonly height: number;

  constructor(readonly model: THREE.Object3D) {
    this.pose = model.userData.pose as THREE.Object3D;
    this.creature = model.userData.creature as Creature;
    this.height = (model.userData.height as number) ?? 1;
  }

  play(state: AnimState, duration = 0.5, onDone: (() => void) | null = null): void {
    this.state = state;
    this.t = 0;
    this.duration = Math.max(0.1, duration);
    this.onDone = onDone;
    if (state === 'win') this.creature.celebrate();
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.t += dt;
    this.creature.update(dt, this.elapsed);
    const u = Math.min(1, this.t / this.duration);
    const p = this.pose;
    const h = this.height;
    p.position.set(0, 0, 0);
    p.rotation.set(0, 0, 0);
    p.scale.setScalar(1);

    switch (this.state) {
      case 'walk': {
        const ph = this.t * 9;
        p.position.y = Math.abs(Math.sin(ph)) * h * 0.05;
        p.rotation.z = Math.sin(ph) * 0.06;
        p.rotation.x = 0.05;
        break;
      }
      case 'attack': {
        const lunge = Math.sin(u * Math.PI);
        p.position.z = lunge * h * 0.45;
        p.rotation.x = lunge * 0.25;
        p.scale.set(1 + lunge * 0.06, 1 - lunge * 0.05, 1 + lunge * 0.06);
        break;
      }
      case 'hit': {
        const back = easeOut(u) * (1 - u) * 4;
        p.position.z = -back * h * 0.12;
        p.rotation.x = -back * 0.18;
        p.rotation.z = Math.sin(u * 42) * (1 - u) * 0.12;
        break;
      }
      case 'death': {
        const k = easeInOut(u);
        p.rotation.z = k * (Math.PI / 2.2);
        p.position.y = -k * h * 0.08;
        p.scale.setScalar(Math.max(0.01, 1 - u * 0.3));
        break;
      }
      case 'win': {
        const hop = Math.abs(Math.sin(this.t * 7)) * Math.max(0, 1 - u);
        p.position.y = hop * h * 0.18;
        p.rotation.y = Math.sin(this.t * 5) * 0.3 * (1 - u);
        break;
      }
      default:
        break;
    }

    if (u >= 1 && this.state !== 'idle' && this.state !== 'walk') {
      const cb = this.onDone;
      this.onDone = null;
      if (this.state !== 'death') this.state = 'idle';
      cb?.();
    }
  }
}
