// Engine: renderer, fixed timestep, registro de sistemas y ctx compartido.

import * as THREE from 'three';
import { Events } from './Events';
import { Rng } from './Rng';
import { Input } from './Input';
import { defaultConfig, type GameConfig } from './Config';
import type { Ctx, GameSystem, GameTime, SystemClass } from './Context';

const FIXED_HZ = 120;
const FIXED_DT = 1 / FIXED_HZ;

function systemId(sys: GameSystem): string {
  const cls = sys.constructor as unknown as SystemClass;
  if (!cls.id) throw new Error(`System without a static id: ${sys.constructor.name}`);
  return cls.id;
}

function systemDeps(sys: GameSystem): string[] {
  return (sys.constructor as unknown as SystemClass).deps ?? [];
}

/**
 * Orders systems so every one initialises after its deps. Registration order
 * breaks ties, so the boot sequence stays deterministic.
 */
export function topoSort(systems: GameSystem[]): GameSystem[] {
  const byId = new Map<string, GameSystem>();
  for (const s of systems) byId.set(systemId(s), s);
  const out: GameSystem[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (sys: GameSystem, trail: string[]): void => {
    const id = systemId(sys);
    const st = state.get(id);
    if (st === 'done') return;
    if (st === 'visiting') throw new Error(`Dependency cycle: ${[...trail, id].join(' -> ')}`);
    state.set(id, 'visiting');
    for (const dep of systemDeps(sys)) {
      const d = byId.get(dep);
      if (!d) throw new Error(`System '${id}' depends on '${dep}', which is not registered`);
      visit(d, [...trail, id]);
    }
    state.set(id, 'done');
    out.push(sys);
  };
  for (const s of systems) visit(s, []);
  return out;
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly config: GameConfig;
  readonly events = new Events();
  readonly rng: Rng;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly time: GameTime = { elapsed: 0, raw: 0, dt: 0, fixed: FIXED_DT, alpha: 0, frame: 0, scale: 1 };
  readonly ctx: Ctx;

  private systems = new Map<string, GameSystem>();
  private order: GameSystem[] = [];
  private clock = new THREE.Clock();
  private acc = 0;
  private fpsWindow = 0;
  private fpsFrames = 0;
  measuredFps = 60;

  constructor(canvas: HTMLCanvasElement, userConfig: Partial<GameConfig> = {}) {
    this.canvas = canvas;
    this.config = Object.assign(defaultConfig(), userConfig);
    this.rng = new Rng(this.config.seed);
    const q = this.config.q;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA lives on the composer target + SMAA
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: new URLSearchParams(location.search).has('capture'),
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // PostFX's grade pass owns the single ACES conversion (ART_DIRECTION §2.11).
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;

    this.camera = new THREE.PerspectiveCamera(this.config.mouse.fov, window.innerWidth / window.innerHeight, 0.08, q.far);
    this.scene.add(this.camera);

    this.input = new Input(canvas, this.config);

    this.ctx = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      canvas,
      config: this.config,
      events: this.events,
      input: this.input,
      time: this.time,
      rng: this.rng,
      get: <T>(id: string) => {
        const s = this.systems.get(id);
        if (!s) throw new Error(`ctx.get('${id}'): sistema no registrado`);
        return s as T;
      },
      peek: <T>(id: string) => this.systems.get(id) as T | undefined,
      has: (id: string) => this.systems.has(id),
    };
  }

  register<T extends GameSystem>(system: T): T {
    if (!system || typeof system.init !== 'function') throw new Error('Invalid system: init(ctx) is required');
    const id = systemId(system);
    if (this.systems.has(id)) throw new Error(`Sistema duplicado: ${id}`);
    this.systems.set(id, system);
    this.order.push(system);
    return system;
  }

  async boot(): Promise<void> {
    this.order = topoSort(this.order);
    for (const sys of this.order) await sys.init(this.ctx);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.clock.start();
    this.renderer.setAnimationLoop(this.frame);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    for (const sys of this.order) sys.resize?.(w, h, this.ctx);
  };

  private frame = (): void => {
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.1) * this.time.scale;
    this.time.raw += raw;
    this.time.dt = dt;

    this.fpsWindow += raw;
    this.fpsFrames++;
    if (this.fpsWindow >= 0.5) {
      this.measuredFps = this.fpsFrames / this.fpsWindow;
      this.fpsWindow = 0;
      this.fpsFrames = 0;
    }

    this.acc += dt;
    while (this.acc >= FIXED_DT) {
      for (const sys of this.order) sys.fixedUpdate?.(FIXED_DT, this.ctx);
      this.acc -= FIXED_DT;
    }
    this.time.alpha = this.acc / FIXED_DT;

    for (const sys of this.order) sys.update?.(dt, this.ctx);
    for (const sys of this.order) sys.lateUpdate?.(dt, this.ctx);

    this.time.elapsed += dt;
    this.time.frame++;
    const render = this.systems.get('render');
    if (render?.draw) render.draw(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    for (const sys of [...this.order].reverse()) sys.dispose?.();
    this.renderer.dispose();
  }
}

export async function createEngine(canvas: HTMLCanvasElement, userConfig: Partial<GameConfig> = {}): Promise<Engine> {
  return new Engine(canvas, userConfig);
}
