// src/render/index.js — owns the frame draw (raw or PostFX).
import { createPostFX } from './postfx.js';

export class RenderSystem {
  static id = 'render';
  static deps = [];

  init(ctx) {
    this.ctx = ctx;
    this.fx = createPostFX(ctx.renderer, ctx.scene, ctx.camera, ctx.config.q);
    ctx.draw = () => this.draw();
    return this;
  }

  draw() {
    if (this.fx) this.fx.render();
    else this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
  }

  resize(w, h) {
    if (this.fx) this.fx.setSize(w, h);
  }

  dispose() {
    if (this.fx) this.fx.dispose();
  }
}
