// src/render/postfx.js — Paulius bloom/SMAA subset. High quality only.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createPostFX(renderer, scene, camera, q) {
  if (!q.bloom) return null;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.42,
    0.55,
    0.7
  );
  composer.addPass(bloom);
  composer.addPass(new SMAAPass());
  composer.addPass(new OutputPass());
  return {
    composer,
    bloom,
    setSize(w, h) { composer.setSize(w, h); },
    render() { composer.render(); },
    dispose() { composer.dispose(); }
  };
}
