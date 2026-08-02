// prueba de iluminación: fuerza mediodía y noche, compara brillo
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

async function shot(hour, name) {
  await page.evaluate((h) => {
    const g = window.__game;
    g.engine.ctx.get('daynight').hour = h;
    const cam = g.engine.camera;
    cam.position.set(0, 3.5, 34);
    cam.lookAt(0, 1.5, 0);
    cam.rotation.z = 0;
  }, hour);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `D:/digimon-shibuya-protocol/docs/shot-${name}.png` });
}

await shot(12.0, 'noon');
await shot(20.5, 'night');

// medir brillo en página
const bright = await page.evaluate(() => {
  const g = window.__game;
  const cam = g.engine.camera;
  return { pos: [cam.position.x, cam.position.y, cam.position.z] };
});
console.log('cam:', JSON.stringify(bright));
await browser.close();
