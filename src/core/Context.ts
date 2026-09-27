import type * as THREE from 'three';
import type { Events } from './Events';
import type { Rng } from './Rng';
import type { Input } from './Input';
import type { GameConfig } from './Config';

export interface GameTime {
  elapsed: number;
  raw: number;
  dt: number;
  fixed: number;
  alpha: number;
  frame: number;
  scale: number;
}

/** El contrato entre subsistemas (ARCHITECTURE.md). */
export interface Ctx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  config: GameConfig;
  events: Events;
  input: Input;
  time: GameTime;
  rng: Rng;
  get<T = any>(id: string): T;
  peek<T = any>(id: string): T | undefined;
  has(id: string): boolean;
}

export interface GameSystem {
  init(ctx: Ctx): unknown;
  fixedUpdate?(h: number, ctx: Ctx): void;
  update?(dt: number, ctx: Ctx): void;
  lateUpdate?(dt: number, ctx: Ctx): void;
  resize?(w: number, h: number, ctx: Ctx): void;
  dispose?(): void;
  /** Present on the render system: owns the frame draw. */
  draw?(dt: number): void;
}

export interface SystemClass {
  id: string;
  deps?: string[];
}
