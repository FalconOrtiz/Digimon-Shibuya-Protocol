// debug: loguear todos los eventos de batalla
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500);

// loguear eventos de batalla desde la página
await page.evaluate(() => {
  window.__evts = [];
  const ev = window.__game.ctx.events;
  for (const n of ['battle:qte', 'battle:hit', 'battle:turn', 'battle:message', 'battle:end']) {
    ev.on(n, (p) => window.__evts.push({ n, p }));
  }
});

await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 4 });
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
});
await page.waitForTimeout(300);

// pulsar con press nativo + pequeña espera para dejar correr el cursor
await page.keyboard.press('Space');
await page.waitForTimeout(1500);

const log = await page.evaluate(() => window.__evts);
console.log('EVENTOS:');
for (const e of log) console.log(' ', e.n, JSON.stringify(e.p));
await browser.close();
