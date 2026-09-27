// captura del nuevo estilo cartoon: vista FPS + vista cenital
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const docsDir = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

// vista FPS desde el cruce mirando al frente (como el prompt)
await page.evaluate(() => {
  const g = window.__game;
  const cam = g.engine.camera;
  cam.position.set(0, 1.7, 14);
  cam.lookAt(0, 1.5, 0);
  cam.rotation.z = 0;
});
await page.waitForTimeout(600);
await page.screenshot({ path: join(docsDir, 'screenshot-cartoon-fps.png') });

// vista cenital (como el prompt del mapa)
await page.evaluate(() => {
  const g = window.__game;
  const cam = g.engine.camera;
  cam.position.set(0, 75, 0.1);
  cam.lookAt(0, 0, 0);
  cam.rotation.z = 0;
});
await page.waitForTimeout(600);
await page.screenshot({ path: join(docsDir, 'screenshot-cartoon-top.png') });

console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
