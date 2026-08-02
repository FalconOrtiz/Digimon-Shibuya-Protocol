// debug: inspeccionar el DOM del QTE mientras está activo
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500);

await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 3 });
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
});

// muestrear el DOM del QTE cada 100ms durante 1 segundo
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(100);
  const snap = await page.evaluate(() => {
    const cursor = document.getElementById('qte-cursor');
    const bar = document.getElementById('qte-bar');
    const zone = document.getElementById('qte-zone');
    const b = window.__game.ctx.get('battle');
    return {
      qteActive: b.qte.isActive(),
      cursorLeft: cursor ? cursor.style.left : null,
      barHidden: bar ? bar.classList.contains('hidden') : null,
      zoneWidth: zone ? zone.style.width : null,
      phase: b.phase
    };
  });
  console.log('t+' + (i * 100) + 'ms:', JSON.stringify(snap));
}
await browser.close();
