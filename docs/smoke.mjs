// smoke test: carga la página, captura errores de consola, hace screenshot
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500); // deja que el loop renderice

// estado del juego
const state = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return { booted: false };
  const { engine } = g;
  return {
    booted: true,
    systems: [...engine.systems.keys()],
    digimons: engine.ctx.get('digimon')?.party?.map(m => m.species.name) || [],
    enemyCount: engine.ctx.get('encounters')?.wilds?.length || 0,
    hour: engine.ctx.get('daynight')?.hour?.toFixed(1),
    hp: engine.ctx.get('player')?.hp
  };
});
console.log('STATE:', JSON.stringify(state, null, 2));
await page.screenshot({ path: 'D:/digimon-shibuya-protocol/docs/screenshot-smoke.png' });
console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n---\n') : '(ninguno)');
await browser.close();
