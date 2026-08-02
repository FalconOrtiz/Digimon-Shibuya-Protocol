// batalla completa v6: press inyectado desde dentro de la página (determinista)
// El QTE se resuelve llamando qte.press() en el frame donde el cursor está en el centro.
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

// instalar un auto-presser: cuando el QTE esté activo y el cursor pase 0.48, presiona
await page.evaluate(() => {
  window.__autoPress = setInterval(() => {
    const b = window.__game.ctx.get('battle');
    if (!b.qte.isActive()) return;
    const cur = document.getElementById('qte-cursor');
    if (!cur) return;
    const t = parseFloat(cur.style.left) / 100;
    if (t >= 0.48 && t <= 0.55) {
      b.qte.press();
    }
  }, 16);
});

await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 3 });
});

// bucle: elegir ataque en cada turno del jugador
let guard = 0;
while (guard++ < 30) {
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

await page.evaluate(() => clearInterval(window.__autoPress));
await page.waitForTimeout(900);
const final = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  const d = window.__game.ctx.get('digimon').getActive();
  const t = window.__game.ctx.get('trainer');
  return {
    running: b.running, result: b.result, playerHp: d.hp, playerMaxHp: d.maxHp,
    wins: t.wins, losses: t.losses, xp: d.xp
  };
});
console.log('FINAL:', JSON.stringify(final));
const log = await page.evaluate(() => window.__evts);
console.log('EVENTOS (' + log.length + '):');
for (const e of log.slice(0, 45)) console.log(' ', e.n, JSON.stringify(e.p));
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
