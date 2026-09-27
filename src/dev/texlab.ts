// Dev page (lab.html): bakes every urban preset and shows its maps side by side.

import * as THREE from 'three';
import {
  wetAsphaltMaps,
  zebraPaintMaps,
  sidewalkTileMaps,
  brickPaverMaps,
  concretePanelMaps,
  facadeWindowGridMaps,
  glassCurtainMaps,
  metalPanelMaps,
  tileFacadeMaps,
  foliageMaps,
  ledScreenTexture,
  type MaterialMaps,
} from '../core/TextureLab';

const root = document.getElementById('lab')!;

function show(name: string, maps: MaterialMaps): void {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('b');
  label.textContent = name;
  row.appendChild(label);
  const seen = new Set<THREE.Texture>();
  for (const t of [maps.map, maps.normalMap, maps.roughnessMap, maps.emissiveMap]) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    row.appendChild(t.image as HTMLCanvasElement);
  }
  root.appendChild(row);
}

const t0 = performance.now();
show('wetAsphalt', wetAsphaltMaps(512));
show('zebraPaint', zebraPaintMaps(256));
show('sidewalkTile', sidewalkTileMaps('warm', 0xc8bcac, 512));
show('brickPaver', brickPaverMaps(512));
show('concretePanel', concretePanelMaps('grey', 0x8a8e96, 512));
show('facade punched', facadeWindowGridMaps('lab-a', { wall: 0xd8d2c8, style: 'punched' }, 512));
show('facade ribbon', facadeWindowGridMaps('lab-b', { wall: 0xc87870, style: 'ribbon', rows: 5 }, 512));
show('glassCurtain', glassCurtainMaps('lab', 0x2a3a4e, 0x6a7080, 512));
show('metal corrugated', metalPanelMaps('shutter', 0x9aa0a8, 'corrugated'));
show('tileFacade', tileFacadeMaps('lab', 0xe0d0b8));
show('foliage', foliageMaps());
const ms = performance.now() - t0;

const led = ledScreenTexture({ width: 320, height: 180, seed: 3, palette: [0xff4dc8, 0x4de1ff, 0xffd24a], text: 'QFRONT' });
const row = document.createElement('div');
row.className = 'row';
row.innerHTML = `<b>ledScreen · bake ${ms.toFixed(0)} ms</b>`;
row.appendChild(led.texture.image as HTMLCanvasElement);
root.appendChild(row);
const tick = (t: number) => {
  led.update(t / 1000);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
(window as unknown as { __READY__: boolean }).__READY__ = true;
