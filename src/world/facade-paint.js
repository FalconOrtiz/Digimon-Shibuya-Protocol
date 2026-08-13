// One unique 1024 canvas per landmark — shop / poster / a few windows. Not a tiled grid.
import * as THREE from 'three';

export function paintFacade({
  shop = '#6a4a3a',
  wall = '#e8d4b8',
  poster = '#ff5a8a',
  poster2 = '#4de1ff',
  label = 'SHIBUYA',
  windows = 8
} = {}) {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = wall;
  g.fillRect(0, 0, s, s);

  // shop band
  g.fillStyle = shop;
  g.fillRect(0, s * 0.72, s, s * 0.28);
  g.fillStyle = '#ffe8b0';
  g.fillRect(s * 0.08, s * 0.78, s * 0.38, s * 0.16);
  g.fillStyle = 'rgba(255,220,140,0.55)';
  g.fillRect(s * 0.52, s * 0.78, s * 0.38, s * 0.16);
  g.fillStyle = shop;
  g.fillRect(0, s * 0.70, s, s * 0.04);

  // two big posters
  g.fillStyle = poster;
  g.fillRect(s * 0.08, s * 0.22, s * 0.4, s * 0.42);
  g.fillStyle = poster2;
  g.fillRect(s * 0.54, s * 0.28, s * 0.38, s * 0.32);
  g.fillStyle = '#fff';
  g.font = 'bold 72px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, s * 0.28, s * 0.43, s * 0.36);

  // a few large windows
  const cols = Math.max(3, Math.ceil(windows / 2));
  for (let i = 0; i < cols; i++) {
    const x = s * (0.08 + i * (0.84 / cols));
    g.fillStyle = i % 2 ? '#f0d8a8' : '#8aa0b8';
    g.fillRect(x, s * 0.06, s * 0.1, s * 0.12);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}
