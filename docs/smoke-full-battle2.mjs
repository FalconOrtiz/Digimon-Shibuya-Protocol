// batalla completa v2: pulsa el QTE leyendo la posición real del cursor DOM
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500);

await page.evaluate(() => {
  window.__evts = [];
  const ev = window.__game.ctx.events;
  for (const n of ['battle:qte', 'battle:hit', 'battle:end']) {
    ev.on(n, (p) => window.__evts.push({ n, p }));
  }
});

await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 3 });
});

let guard = 0;
while (guard++ < 14) {
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const b = window.__game.ctx.get('battle');
    // leer la posición del cursor del QTE desde el DOM (0..1)
    const cursor = document.getElementById('qte-cursor');
    const bar = document.getElementById('qte-bar');
    let cursorT = null;
    if (cursor && bar && !cursor.parentElement.classList.contains('hidden')) {
      cursorT = parseFloat(cursor.style.left) / 100;
    }
    return {
      running: b.running, phase: b.phase,
      qte: b.qte.isActive(), qteType: b.qte.current()?.type,
      cursorT, result: b.result
    };
  });
  if (!state.running) break;
  if (state.qte) {
    // pulsar cuando el cursor cruce 0.5 (centro de la barra / zona dorada)
    if (state.cursorT !== null && state.cursorT >= 0.48 && state.cursorT <= 0.55) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
  } else if (state.phase === 'player_turn') {
    await page.evaluate(() => {
      window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
    });
  }
}

const final = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  const d = window.__game.ctx.get('digimon').getActive();
  const t = window.__game.ctx.get('trainer');
  return { running: b.running, result: b.result, playerHp: d.hp, wins: t.wins, losses: t.losses, xp: d.xp };
});
console.log('FINAL:', JSON.stringify(final));
const log = await page.evaluate(() => window.__evts);
console.log('EVENTOS (' + log.length + '):');
for (const e of log.slice(0, 25)) console.log(' ', e.n, JSON.stringify(e.p));
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
