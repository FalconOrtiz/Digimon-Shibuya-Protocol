// debug del input del QTE: inyectar keydown manualmente
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500);

// arrancar batalla
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 4 });
});
await page.waitForTimeout(1500);

// elegir ataque
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
});
await page.waitForTimeout(300);

const pre = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  const inp = window.__game.ctx.input;
  return {
    phase: b.phase,
    qteActive: b.qte.isActive(),
    // inyectar keydown manualmente como si fuera Space
  };
});
console.log('PRE:', JSON.stringify(pre));

// inyectar evento Space manualmente (keydown real de browser)
await page.keyboard.down('Space');
await page.waitForTimeout(50);
await page.keyboard.up('Space');
await page.waitForTimeout(400);

const post = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  return { phase: b.phase, qteActive: b.qte.isActive(), qteResult: b.qte.current() };
});
console.log('POST keydown/up:', JSON.stringify(post));

// alternativa: dispatchEvent directo
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
});
await page.waitForTimeout(300);
const pre2 = await page.evaluate(() => window.__game.ctx.get('battle').phase);
console.log('PRE2:', pre2);

await page.evaluate(() => {
  const ev = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true });
  window.dispatchEvent(ev);
  const ev2 = new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true });
  window.dispatchEvent(ev2);
});
await page.waitForTimeout(400);
const post2 = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  return { phase: b.phase, qteActive: b.qte.isActive() };
});
console.log('POST2 dispatchEvent:', JSON.stringify(post2));
await browser.close();
