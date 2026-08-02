// batalla completa v4: pulsa QTE 500ms tras detectarlo (ventana centrada)
// y verifica que el mouse se libera en batalla
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500);

// bloquear el cursor como haría un jugador
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
const locked1 = await page.evaluate(() => document.pointerLockElement !== null);
console.log('pointer lock tras click:', locked1);

await page.evaluate(() => {
  window.__evts = [];
  const ev = window.__game.ctx.events;
  for (const n of ['battle:qte', 'battle:hit', 'battle:end']) {
    ev.on(n, (p) => window.__evts.push({ n, p }));
  }
});

// batalla contra Koromon nivel 3
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 3 });
});
await page.waitForTimeout(300);
const locked2 = await page.evaluate(() => document.pointerLockElement !== null);
console.log('pointer lock durante batalla (debe ser false):', locked2);

let guard = 0;
while (guard++ < 14) {
  const state = await page.evaluate(() => {
    const b = window.__game.ctx.get('battle');
    return { running: b.running, phase: b.phase, qte: b.qte.isActive(), result: b.result };
  });
  if (!state.running) break;
  if (state.qte) {
    // esperar ~500ms (centro de la barra de 1000ms) y pulsar
    await page.waitForTimeout(480);
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  } else if (state.phase === 'player_turn') {
    await page.evaluate(() => {
      window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
    });
    await page.waitForTimeout(150);
  } else {
    await page.waitForTimeout(250);
  }
}

await page.waitForTimeout(800);
const final = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  const d = window.__game.ctx.get('digimon').getActive();
  const t = window.__game.ctx.get('trainer');
  return { running: b.running, result: b.result, playerHp: d.hp, wins: t.wins, losses: t.losses, xp: d.xp };
});
console.log('FINAL:', JSON.stringify(final));
const locked3 = await page.evaluate(() => document.pointerLockElement !== null);
console.log('pointer lock tras batalla (debe volver a true):', locked3);

const log = await page.evaluate(() => window.__evts);
console.log('EVENTOS (' + log.length + '):');
for (const e of log.slice(0, 35)) console.log(' ', e.n, JSON.stringify(e.p));
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
