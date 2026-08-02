// smoke test v3: estado completo + screenshot del juego funcionando
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);

const state = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return { booted: false };
  const { engine } = g;
  const digimon = engine.ctx.get('digimon');
  const encounters = engine.ctx.get('encounters');
  const battle = engine.ctx.get('battle');
  const player = engine.ctx.get('player');
  const daynight = engine.ctx.get('daynight');
  return {
    booted: true,
    systems: [...engine.systems.keys()],
    party: digimon.party.map(m => ({ name: m.species.name, hp: m.hp, lv: m.level })),
    wilds: encounters.wilds.length,
    rival: encounters.rival ? encounters.rival.species.name : null,
    battleRunning: battle.running,
    playerPos: [player.pos.x.toFixed(1), player.pos.y.toFixed(1), player.pos.z.toFixed(1)],
    hour: daynight.hour.toFixed(2),
    phase: daynight._phase(),
    rendererInfo: engine.renderer.info.render
  };
});
console.log('STATE:', JSON.stringify(state, null, 2));
await page.screenshot({ path: 'D:/digimon-shibuya-protocol/docs/screenshot-day.png' });
console.log('ERRORS:', errors.length ? errors.join(' | ') : '(ninguno)');
await browser.close();
