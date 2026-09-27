#!/usr/bin/env node
/** Visible mesh count per top-level scene group for one shot: where the draw calls go. */
import { chromium } from 'playwright';
import { ensureServer } from './capture.mjs';

const shot = process.argv[2] ?? 'golden-trainer';
const server = await ensureServer(5173);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://127.0.0.1:5173/?capture=1&q=high');
await page.waitForFunction('window.__READY__ === true', null, { timeout: 180000 });
await page.evaluate((s) => window.__APPLY_SHOT__(s), shot);
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const { ctx } = window.__game;
  const rows = {};
  for (const child of ctx.scene.children) {
    let meshes = 0;
    let mats = new Set();
    child.traverseVisible((o) => {
      if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
        meshes++;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.uuid));
      }
    });
    const key = child.name || child.type;
    rows[key] = { meshes: (rows[key]?.meshes ?? 0) + meshes, materials: mats.size };
  }
  return { rows, info: window.__RENDER_INFO__ };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
server?.kill();
