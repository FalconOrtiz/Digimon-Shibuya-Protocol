// verificación de escena: qué hay realmente en el mundo 3D
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

// cuenta de objetos por subsistema
const stats = await page.evaluate(() => {
  const g = window.__game;
  const scene = g.engine.scene;
  let meshes = 0, sprites = 0, lights = 0, tris = 0;
  const bySystem = {};
  scene.traverse((o) => {
    if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 | 0; }
    if (o.isSprite) sprites++;
    if (o.isLight) lights++;
  });
  // geometría por grupo raíz
  for (const child of scene.children) {
    if (!child.isGroup) continue;
    let n = 0;
    child.traverse(o => { if (o.isMesh) n++; });
    bySystem[child.type + ':' + (child.name || child.uuid.slice(0,4))] = n;
  }
  // muestreo de color del canvas (centro)
  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl2');
  const px = new Uint8Array(4);
  gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { meshes, sprites, lights, tris, centerPixel: [...px], bySystem };
});
console.log(JSON.stringify(stats, null, 2));

// screenshot aéreo: muevo la cámara arriba para ver el cruce
await page.evaluate(() => {
  const g = window.__game;
  const cam = g.engine.camera;
  cam.position.set(0, 60, 0.1);
  cam.lookAt(0, 0, 0);
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'D:/digimon-shibuya-protocol/docs/screenshot-top.png' });

// screenshot con cámara a ras de suelo mirando al cruce
await page.evaluate(() => {
  const g = window.__game;
  const cam = g.engine.camera;
  cam.position.set(0, 2.2, 30);
  cam.lookAt(0, 1.5, 0);
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'D:/digimon-shibuya-protocol/docs/screenshot-street.png' });
console.log('screenshots guardados');
await browser.close();
