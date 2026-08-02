// batalla completa v5: pulsa leyendo el cursor DOM (robusto) hasta el final
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

// función: cuando el QTE esté activo, esperar a que el cursor cruce 50% y pulsar
async function qteLoop() {
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => {
      const b = window.__game.ctx.get('battle');
      if (!b.qte.isActive()) return null;
      const cur = document.getElementById('qte-cursor');
      const t = cur ? parseFloat(cur.style.left) / 100 : null;
      return { t, type: b.qte.current()?.type };
    });
    if (!st) return;
    if (st.t !== null && st.t >= 0.5) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      return;
    }
    await page.waitForTimeout(16);
  }
}

let guard = 0;
while (guard++ < 20) {
  const state = await page.evaluate(() => {
    const b = window.__game.ctx.get('battle');
    return { running: b.running, phase: b.phase, qte: b.qte.isActive(), result: b.result };
  });
  if (!state.running) break;
  if (state.qte) {
    await qteLoop();
  } else if (state.phase === 'player_turn') {
    await page.evaluate(() => {
      window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
    });
    await page.waitForTimeout(150);
  } else {
    await page.waitForTimeout(200);
  }
}

await page.waitForTimeout(900);
const final = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  const d = window.__game.ctx.get('digimon').getActive();
  const t = window.__game.ctx.get('trainer');
  const enc = window.__game.ctx.get('encounters');
  return {
    running: b.running, result: b.result, playerHp: d.hp, playerMaxHp: d.maxHp,
    wins: t.wins, losses: t.losses, xp: d.xp,
    wildCount: enc.wilds.length, rival: enc.rival?.species?.name
  };
});
console.log('FINAL:', JSON.stringify(final));
const log = await page.evaluate(() => window.__evts);
console.log('EVENTOS (' + log.length + '):');
for (const e of log.slice(0, 40)) console.log(' ', e.n, JSON.stringify(e.p));
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
