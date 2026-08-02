// batalla completa: jugar hasta el final (ganar o perder)
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500);

// loguear eventos
await page.evaluate(() => {
  window.__evts = [];
  const ev = window.__game.ctx.events;
  for (const n of ['battle:qte', 'battle:hit', 'battle:turn', 'battle:end']) {
    ev.on(n, (p) => window.__evts.push({ n, p }));
  }
});

// batalla contra Koromon nivel 3 (débil → 2-3 turnos)
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 3 });
});

// bucle: mientras la batalla corra, responder a los QTE con buen timing
let guard = 0;
while (guard++ < 10) {
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const b = window.__game.ctx.get('battle');
    return { running: b.running, phase: b.phase, qte: b.qte.isActive(), qteType: b.qte.current()?.type, result: b.result };
  });
  if (!state.running) break;
  if (state.qte) {
    // pulsar en el centro de la barra (crit/perfect): esperar ~45% de la duración
    await page.waitForTimeout(430);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
  }
  if (state.phase === 'player_turn') {
    // elegir ataque
    await page.evaluate(() => {
      window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
    });
  }
}

const final = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  const d = window.__game.ctx.get('digimon').getActive();
  const t = window.__game.ctx.get('trainer');
  return { running: b.running, result: b.result, playerHp: d.hp, playerMaxHp: d.maxHp, wins: t.wins, losses: t.losses };
});
console.log('FINAL:', JSON.stringify(final));
const log = await page.evaluate(() => window.__evts);
console.log('EVENTOS (' + log.length + '):');
for (const e of log.slice(0, 30)) console.log(' ', e.n, JSON.stringify(e.p));
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
