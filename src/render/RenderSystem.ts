// Owns the frame draw (PostFX chain) and the deterministic capture hooks.

import { PostFX } from './PostFX';
import { SHOTS, type ShotPose } from './shots';
import type { Ctx, GameSystem } from '../core/Context';

declare global {
  interface Window {
    __READY__?: boolean;
    __SHOTS__?: Record<string, string>;
    __APPLY_SHOT__?: (name: string) => string;
    __RENDER_INFO__?: { calls: number; triangles: number; frameCalls: number; fps: number; programs: number };
  }
}

export class RenderSystem implements GameSystem {
  static id = 'render';
  static deps: string[] = [];

  fx!: PostFX;
  private ctx!: Ctx;
  private framesDrawn = 0;
  /** Fixed camera pose for aerial / portrait shots; player camera otherwise. */
  private pose: ShotPose | null = null;

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.fx = new PostFX(ctx.renderer, ctx.scene, ctx.camera, ctx.config.q);
    window.__SHOTS__ = Object.fromEntries(Object.entries(SHOTS).map(([k, s]) => [k, s.label]));
    window.__APPLY_SHOT__ = (name: string) => this.applyShot(name);
    return this;
  }

  applyShot(name: string): string {
    const shot = SHOTS[name];
    if (!shot) return `unknown shot '${name}'`;
    this.pose = shot.apply(this.ctx);
    return shot.label;
  }

  clearShot(): void {
    this.pose = null;
  }

  draw(dt: number): void {
    const nf = (this.ctx.scene.userData.nightFactor as number | undefined) ?? 0;
    this.fx.setLook(nf);
    if (this.pose) {
      const cam = this.ctx.camera;
      cam.position.copy(this.pose.position);
      cam.lookAt(this.pose.target);
      if (Math.abs(cam.fov - this.pose.fov) > 0.01) {
        cam.fov = this.pose.fov;
        cam.updateProjectionMatrix();
      }
    }
    this.fx.render(dt);

    this.framesDrawn++;
    if (this.framesDrawn === 3) window.__READY__ = true;
    if ((this.framesDrawn & 15) === 0) {
      const info = this.ctx.renderer.info;
      window.__RENDER_INFO__ = {
        calls: this.fx.sceneStats.calls,
        triangles: this.fx.sceneStats.triangles,
        frameCalls: this.fx.frameStats.calls,
        fps: Math.round(10 / Math.max(1e-3, this.ctx.time.dt)) / 10,
        programs: info.programs?.length ?? 0,
      };
    }
  }

  resize(w: number, h: number): void {
    this.fx.setSize(w, h);
  }

  dispose(): void {
    this.fx.dispose();
  }
}
