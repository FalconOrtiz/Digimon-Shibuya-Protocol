#!/usr/bin/env node
/**
 * Visual review of battle FX and the defend timing bar: holds a battle at the
 * menu, fires each effect at normal speed and screenshots it mid-flight.
 *   node tools/fx-gallery.mjs [--only=fire,claws] [--night]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureServer } from './capture.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DIR = resolve(import.meta.dirname, '..', 'shots', 'fx');
const ONLY = args.only ? String(args.only).split(',') : null;

/** name → [code run with (b = battle system, fx, A = ally focus, W = wild focus, P = player pad, Q = wild pad), capture delay ms] */
const CASES = {
  fire: ['fx.fireArc(A, W, 0.4)', 330],
  'fire-hit': ['fx.fireArc(A, W, 0.4); setTimeout(() => fx.impact(W, 0xffe9a8, 1.3), 400)', 470],
  claws: ['fx.dashStreak(A, W); fx.claws(W, W.clone().sub(A).setY(0).normalize(), 0xfff0d0); fx.impact(W, 0xffe9a8, 1)', 90],
  bubbles: ['fx.bubbles(A, W, 0.5)', 300],
  gust: ['fx.gust(Q, 0.7)', 300],
  holy: ['fx.holyBeam(W, 0.55)', 280],
  ult: ['fx.charge(A, 0xff4dc8, 0.5, 80); setTimeout(() => { fx.pillar(Q, 0xff4dc8, 1.1, 7, 0.9); fx.impact(W, 0xff4dc8, 2.2); fx.ring(Q, 0xff4dc8, 2.4, 0.5); }, 450)', 560],
  charge: ['fx.charge(W, 0xff8a5a, 0.9, 50)', 450],
  digivolve: ['fx.charge(A, 0xffd24a, 0.9, 90); fx.pillar(P, 0xffd24a, 1.0, 8, 1.8); fx.ring(P, 0xffd24a, 2.2, 0.6); fx.sparkles(P, 0xfff0c4, 56)', 500],
  parry: ['fx.sparkles(A, 0xffd24a, 36); fx.shockwave(P, 0xffd24a, 1.8, 0.4); fx.impact(A, 0xffd24a, 1.3); fx.slash(A, b.arena.forward.clone().negate(), 0xffd24a, 0.9, 0.2, 0.2)', 90],
};

const BAR = {
  'bar-incoming': [{ state: 'incoming', lead: 0.32, span: 0.5, timeScale: 1, hitType: 'strike', keys: [{ key: 'SPACE', label: 'DODGE' }, { key: 'E', label: 'PARRY' }], zones: [{ type: 'dodge', label: 'DODGE', from: 0, to: 0.45, perfect: 0.22 }, { type: 'parry', label: 'PARRY', from: 0, to: 0.18 }] }, 250],
  'bar-perfect': [{ state: 'closed', result: 'perfect-dodge', label: 'PERFECT DODGE!', grade: 'perfect', pressedAt: 0.1 }, 120],
  'bar-miss': [{ state: 'closed', result: 'whiff', label: 'MISSED!', grade: 'miss', pressedAt: 0.48 }, 120],
};

const server = await ensureServer();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1', '--mute-audio'] });
mkdirSync(DIR, { recursive: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://127.0.0.1:5173/?capture=1&q=high');
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 180000 });
  await page.evaluate((s) => window.__APPLY_SHOT__(s), args.night ? 'battle-night' : 'battle-golden');
  await page.waitForFunction(() => window.__BATTLE__.state().startsWith('menu:'), null, { timeout: 60000 });
  await page.evaluate(() => {
    document.getElementById('bt-menu')?.classList.add('hidden');
    document.getElementById('bt-banner')?.classList.add('hidden');
  });
  const prelude = `const b = window.__game.ctx.peek('battle'); const fx = b.fx;
    const A = b.focusOf(b.ally.model), W = b.focusOf(b.wild.model), P = b.arena.padPlayer, Q = b.arena.padWild;`;
  for (const [name, [code, ms]] of Object.entries(CASES)) {
    if (ONLY && !ONLY.includes(name)) continue;
    await page.evaluate(`(() => { ${prelude} b.timeScale = 1; fx.clear(); ${code}; })()`);
    await page.waitForTimeout(ms);
    await page.screenshot({ path: join(DIR, `${name}.png`) });
    console.log(name);
  }
  for (const [name, [ev, ms]] of Object.entries(BAR)) {
    if (ONLY && !ONLY.includes(name)) continue;
    await page.evaluate((e) => window.__game.ctx.events.emit('battle:window', e), ev);
    await page.waitForTimeout(ms);
    await page.screenshot({ path: join(DIR, `${name}.png`) });
    console.log(name);
  }
  if (!ONLY || ONLY.includes('digivice')) {
    await page.evaluate(() => window.__APPLY_SHOT__('golden-trainer'));
    await page.waitForFunction(() => !window.__game.ctx.peek('battle').running, null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => {
      const dv = window.__game.ctx.peek('digivice');
      dv.inBattle = () => false;
      dv.show();
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(DIR, 'digivice.png') });
    console.log('digivice');
  }
} finally {
  await browser.close();
  server?.kill();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
