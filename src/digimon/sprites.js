// src/digimon/sprites.js — digimons como billboards con las imágenes de referencia.
// En exploración se muestra el sprite (docs/referencias/assets de este repo);
// en batalla el sistema alterna al modelo 3D animado (models.js).

import * as THREE from 'three';

const SPRITE_MAP = {
  agumon: { url: '/assets/agumon-sprite.png', height: 1.55, yOff: 0.78 },
  patamon: { url: '/assets/patamon-sprite.png', height: 1.15, yOff: 0.58 }
};

const _textureCache = new Map();

function loadTexture(url) {
  if (_textureCache.has(url)) return _textureCache.get(url);
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  _textureCache.set(url, tex);
  return tex;
}

// crea un sprite billboard para una especie (o null si no hay imagen)
export function createDigimonSprite(speciesId) {
  const cfg = SPRITE_MAP[speciesId];
  if (!cfg) return null;
  const tex = loadTexture(cfg.url);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true
  });
  const sprite = new THREE.Sprite(mat);
  const aspect = tex.image ? tex.image.width / tex.image.height : 0.8;
  sprite.scale.set(cfg.height * aspect, cfg.height, 1);
  sprite.position.y = cfg.yOff;
  sprite.userData.species = speciesId;
  return sprite;
}

export function hasDigimonSprite(speciesId) {
  return !!SPRITE_MAP[speciesId];
}

// libera texturas (dispose)
export function disposeSprite(sprite) {
  if (sprite) {
    if (sprite.material) sprite.material.dispose();
  }
}
