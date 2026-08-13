import * as THREE from 'three';

let ramp = null;
export function toonRamp() {
  if (ramp) return ramp;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 1;
  const g = c.getContext('2d');
  const cols = ['#4a4038', '#8a7868', '#c8b8a0', '#fff4e0'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = cols[i];
    g.fillRect(i, 0, 1, 1);
  }
  ramp = new THREE.CanvasTexture(c);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  return ramp;
}

export function toon(color, emit = 0.06) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(),
    emissive: new THREE.Color(color).multiplyScalar(emit)
  });
}

export function outline(mesh, scale = 1.035, color = 0x2a2018) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const o = mesh.clone();
  o.material = mat;
  o.scale.multiplyScalar(scale);
  o.castShadow = false;
  return o;
}
