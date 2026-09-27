// verificación: sprites de digimons en el mundo + alternancia en batalla
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

// cámara viendo a Agumon (sprite)
await page.evaluate(() => {
  const g = window.__game;
  const m = g.ctx.get('digimon').party[0];
  m.model.position.set(3, 0, 3);
  const cam = g.engine.camera;
  cam.position.set(m.model.position.x + 3.5, 1.6, m.model.position.z + 3.5);
  cam.lookAt(m.model.position.x, 0.9, m.model.position.z);
});
await page.waitForTimeout(500);
await page.screenshot({ path: join(docsDir, 'screenshot-agumon-sprite.png') });

// entrar en batalla → el modelo 3D debe aparecer (sprite oculto)
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 4 });
});
await page.waitForTimeout(1200);
const battleState = await page.evaluate(() => {
  const digi = window.__game.ctx.get('digimon');
  return {
    battleRunning: window.__game.ctx.get('battle').running,
    agumonSpriteVisible: digi.party[0].sprite ? digi.party[0].sprite.visible : null,
    agumonModelVisible: digi.party[0].model.visible
  };
});
console.log('EN BATALLA:', JSON.stringify(battleState));
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
