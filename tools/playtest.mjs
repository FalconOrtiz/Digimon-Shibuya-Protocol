#!/usr/bin/env node
/**
 * Gameplay smoke test: boots the game, plays one full E33 battle through the
 * `window.__BATTLE__` debug API (basic, skill, defend windows, free aim, ULT,
 * digivolve) at high time scale and fails on any console/page error.
 *
 *   node tools/playtest.mjs [--shots=dir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureServer } from './capture.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const PORT = 5173;
const SHOTS = args.shots ? resolve(args.shots) : null;
const ANGLE = process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : 'vulkan';

const server = await ensureServer(PORT);
const browser = await chromium.launch({ headless: true, args: [`--use-angle=${ANGLE}`, '--ignore-gpu-blocklist', '--mute-audio'] });
const errors = [];
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?capture=1&q=medium`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 180000 });

  const state = () => page.evaluate(() => window.__BATTLE__.state());
  const until = async (re, ms = 20000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      if (re.test(s)) return s;
      if (Date.now() - t0 > ms) throw new Error(`timeout esperando ${re} (estado ${s})`);
      await page.waitForTimeout(30);
    }
  };
  const snap = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  };

  await page.evaluate(() => {
    window.__BATTLE__.start({ enemySpecies: 'nyaromon', enemyLevel: 8, seed: 11 });
    window.__BATTLE__.setTimeScale(8);
  });
  await until(/^menu:/);
  await snap('01-menu');

  const turns = [['basic'], ['basic'], ['skill', 1], ['aim'], ['basic'], ['ult'], ['digivolve'], ['basic'], ['basic'], ['basic']];
  const seen = new Set();
  for (const [type, index] of turns) {
    const s = await state();
    if (s.startsWith('idle')) break;
    await until(/^(menu|idle):/, 40000);
    if ((await state()).startsWith('idle')) break;
    const g = await page.evaluate(() => window.__BATTLE__.gauges());
    if (type === 'ult' && g.gradient < 100) continue;
    if (type === 'digivolve' && g.gradient < 50) continue;
    if (type === 'aim' && g.ap < 1) continue;
    await page.evaluate(([t, i]) => window.__BATTLE__.act(t, i), [type, index]);
    if (!(await until(/^(?!menu:)/, 3000).catch(() => null))) continue;
    if (type === 'aim') {
      await until(/^(aim|idle):/);
      if ((await state()).startsWith('idle')) break;
      await snap('02-aim');
      await page.evaluate(() => window.__BATTLE__.aim(0.5, 0.45));
    }
    // Defend every hit frame, alternating inputs to exercise each window.
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < 40000) {
      const st = await state();
      seen.add(st.split(':').slice(0, 2).join(':'));
      if (/^(menu|idle):/.test(st)) break;
      if (/^defend:defend:/.test(st)) {
        if (k === 0) await snap('03-defend');
        await page.evaluate((i) => window.__BATTLE__.defend(['parry', 'dodge', 'jump', 'gradient'][i % 4]), k++);
      }
      await page.waitForTimeout(20);
    }
  }
  await until(/^idle:/, 60000).catch(async () => {
    await page.evaluate(() => window.__BATTLE__.act('run'));
    await until(/^idle:/, 30000);
  });
  await snap('04-after');

  const hud = await page.evaluate(() => ({
    battleUiHidden: document.getElementById('battle-ui')?.classList.contains('hidden'),
    partner: document.getElementById('hud-digimon-name')?.textContent,
  }));
  console.log(JSON.stringify({ phases: [...seen].sort(), hud }, null, 1));
  if (!hud.battleUiHidden) throw new Error('el HUD de combate sigue visible tras el combate');
} catch (e) {
  failed = true;
  console.error('PLAYTEST FAIL:', e.message);
} finally {
  await browser.close();
  server?.kill();
}
if (errors.length) console.error('console errors:\n' + errors.join('\n'));
process.exit(failed || errors.length ? 1 : 0);
