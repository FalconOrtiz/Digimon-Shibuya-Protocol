// captura de los digimons actualizados según las referencias
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

// posicionar la cámara para ver a Agumon (sigue al jugador en +x)
await page.evaluate(() => {
  const g = window.__game;
  const digimon = g.ctx.get('digimon');
  const m = digimon.party[0].model;
  m.position.set(3, 0, 3);
  const cam = g.engine.camera;
  cam.position.set(m.position.x + 3.2, 1.6, m.position.z + 3.2);
  cam.lookAt(m.position.x, 1.0, m.position.z);
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'D:/digimon-shibuya-protocol/docs/screenshot-agumon.png' });

// Patamon
await page.evaluate(() => {
  const g = window.__game;
  const digimon = g.ctx.get('digimon');
  const m = digimon.party[1].model;
  m.position.set(-4, 0, -4);
  const cam = g.engine.camera;
  cam.position.set(m.position.x - 3.2, 1.6, m.position.z - 3.2);
  cam.lookAt(m.position.x, 1.0, m.position.z);
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'D:/digimon-shibuya-protocol/docs/screenshot-patamon.png' });

console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
