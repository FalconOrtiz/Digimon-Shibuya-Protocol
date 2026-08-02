// prueba de batalla end-to-end: simula un encuentro y juega los QTE
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500);

// 1. forzar una batalla contra Koromon
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:request', { enemySpecies: 'koromon', enemyLevel: 4 });
});

// 2. esperar a que empiece el turno del jugador
await page.waitForTimeout(1500);
const s1 = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  return { running: b.running, phase: b.phase, enemy: b.enemy?.species?.name, enemyHp: b.enemy?.hp };
});
console.log('TURNO JUGADOR:', JSON.stringify(s1));

// 3. elegir ataque → se dispara QTE crit
await page.evaluate(() => {
  window.__game.ctx.events.emit('battle:action', { action: 'attack', move: 'babyFlame' });
});
await page.waitForTimeout(300);
const s2 = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  return { phase: b.phase, qteActive: b.qte.isActive(), qteType: b.qte.current()?.type };
});
console.log('QTE CRIT ACTIVO:', JSON.stringify(s2));

// 4. pulsar en la zona dorada (crit) — espacio
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
const s3 = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  return { phase: b.phase, enemyHp: b.enemy?.hp, enemyMaxHp: b.enemy?.maxHp };
});
console.log('TRAS CRIT:', JSON.stringify(s3));

// 5. esperar turno enemigo → QTE parry → pulsar perfect
await page.waitForTimeout(1400);
const s4 = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  return { phase: b.phase, qteActive: b.qte.isActive(), qteType: b.qte.current()?.type, running: b.running };
});
console.log('QTE PARRY ACTIVO:', JSON.stringify(s4));
if (s4.qteActive) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);
}

// 6. estado final
const s5 = await page.evaluate(() => {
  const b = window.__game.ctx.get('battle');
  const d = window.__game.ctx.get('digimon').getActive();
  return { running: b.running, phase: b.phase, result: b.result, playerHp: d.hp, enemyHp: b.enemy?.hp };
});
console.log('FINAL:', JSON.stringify(s5));
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
