#!/usr/bin/env node
/**
 * A/B one shot with individual PostFX passes disabled, to attribute artefacts.
 *   node tools/probe-passes.mjs --shot=golden-top
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureServer } from './capture.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SHOT = args.shot ?? 'golden-top';
const DIR = resolve(import.meta.dirname, '..', 'shots', 'passes');
const VARIANTS = {
  all: '',
  noCA: 'fx.grade.uniforms.uChromatic.value = 0; fx.settings.chromatic = 0;',
  noDof: 'fx.grade.uniforms.uEnableDof.value = 0;',
  noSmaa: 'fx.smaa.enabled = false;',
  noGtao: 'fx.gtao.enabled = false;',
  noBloom: 'fx.bloom.enabled = false;',
};

const server = await ensureServer();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1'] });
mkdirSync(DIR, { recursive: true });
try {
  for (const [name, code] of Object.entries(VARIANTS)) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:5173/?capture=1&q=high');
    await page.waitForFunction('window.__READY__ === true', null, { timeout: 120000 });
    await page.evaluate((s) => window.__APPLY_SHOT__(s), SHOT);
    await page.evaluate(`(() => { const fx = window.__game.ctx.peek('render').fx; ${code} })()`);
    await page.evaluate(() => new Promise((d) => { let i = 0; const t = () => (++i > 60 ? d() : requestAnimationFrame(t)); t(); }));
    await page.screenshot({ path: join(DIR, `${SHOT}-${name}.png`) });
    await page.close();
    console.log(name);
  }
} finally {
  await browser.close();
  server?.kill();
}
