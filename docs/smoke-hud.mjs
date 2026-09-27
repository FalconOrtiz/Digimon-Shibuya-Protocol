// verificación del nuevo HUD (perfil + inventario) según el prompt de referencia
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

const hud = await page.evaluate(() => {
  const g = window.__game;
  const trainer = g.ctx.get('trainer');
  return {
    trainerName: trainer.name,
    trainerLevel: trainer.level,
    hudName: document.querySelector('#hud-trainer-name')?.textContent,
    hudLevel: document.querySelector('#profile-level-num')?.textContent,
    avatar: document.querySelector('#profile-avatar')?.textContent,
    vidaLabel: document.querySelector('.hud-bar-label')?.textContent,
    hpText: document.querySelector('#hud-hp-num')?.textContent,
    energiaLabel: document.querySelectorAll('.hud-bar-label')[1]?.textContent,
    stText: document.querySelector('#hud-st-num')?.textContent,
    inventoryVisible: !document.querySelector('#hud-inventory')?.classList.contains('hidden'),
    invSlots: document.querySelectorAll('.inv-slot').length,
    invTitle: document.querySelector('.inv-head span')?.textContent,
    invCloseBtn: !!document.querySelector('#inv-close')
  };
});
console.log('HUD:', JSON.stringify(hud, null, 2));

// screenshot con la cámara mirando al cruce (vista FPS como el prompt)
await page.evaluate(() => {
  const g = window.__game;
  const cam = g.engine.camera;
  cam.position.set(0, 1.7, 16);
  cam.lookAt(0, 1.5, 0);
  cam.rotation.z = 0;
});
await page.waitForTimeout(600);
await page.screenshot({ path: join(docsDir, 'screenshot-hud.png') });
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
