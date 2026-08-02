// diagnóstico de iluminación: mediodía vs hora azul, vista cenital del cruce
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

async function shot(hour, name) {
  await page.evaluate((h) => {
    const g = window.__game;
    g.ctx.get('daynight').hour = h;
    const cam = g.engine.camera;
    cam.position.set(0, 40, 0.1);
    cam.lookAt(0, 0, 0);
    cam.rotation.z = 0;
  }, hour);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `D:/digimon-shibuya-protocol/docs/diag-${name}.png` });
}

await shot(12.0, 'noon');
await shot(18.75, 'bluehour');
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
