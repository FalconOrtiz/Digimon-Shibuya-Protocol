// batalla completa v8: auto-resolver QTE desde dentro del sistema (no test de timing,
// sino verificación de la máquina de turnos end-to-end hasta VICTORIA)
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

  // monkeypatch: presionar siempre en el centro perfecto (0.5)
  const battle = window.__game.ctx.get('battle');
  const origStart = battle.qte.start.bind(battle.qte);
  battle.qte.start = (type, opts) => {
    const p = origStart(type, opts);
    // resolver en el centro tras ~50% de la duración
    setTimeout(() => {
      if (battle.qte.isActive()) {
        // forzar el timing al centro exacto
        const q = battle.qte.current();
        q.started = performance.now() - q.duration * 0.5;
        battle.qte.press();
      }
    }, 10);
    return p;
  };
});

await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 3 });
});

let guard = 0;
while (guard++ < 90) {
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const b = window.__game.ctx.get('battle');
    return { running: b.running, phase: b.phase, result: b.result };
  });
  if (!state.running) break;
  if (state.phase === 'player_turn') {
    await page.evaluate(() => {
      window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
    });
  }
}

await page.waitForTimeout(900);
const final = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  const d = window.__game.ctx.get('digimon').getActive();
  const t = window.__game.ctx.get('trainer');
  return {
    running: b.running, result: b.result, playerHp: d.hp, playerMaxHp: d.maxHp,
    enemyHp: b.enemy ? b.enemy.hp : null, enemyMaxHp: b.enemy ? b.enemy.maxHp : null,
    wins: t.wins, losses: t.losses, xp: d.xp
  };
});
console.log('FINAL:', JSON.stringify(final));
const log = await page.evaluate(() => window.__evts);
console.log('EVENTOS (' + log.length + '):');
for (const e of log.slice(0, 40)) console.log(' ', e.n, JSON.stringify(e.p));
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
