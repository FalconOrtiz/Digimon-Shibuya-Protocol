#!/usr/bin/env node
/**
 * Deterministic screenshot harness.
 *
 * Boots vite (if not already up), opens the page in GPU-backed Chromium,
 * waits for `window.__READY__`, applies named shots from src/render/shots.ts
 * and writes one PNG per shot plus the scene stats PostFX reports.
 *
 *   node tools/capture.mjs --shot=golden-fps
 *   node tools/capture.mjs --shots=golden-fps,night-fps --dir=shots --w=1600 --h=900
 *   node tools/capture.mjs --list
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import net from 'node:net';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(args.port ?? 5173);
const W = Number(args.w ?? 1600);
const H = Number(args.h ?? 900);
const DIR = resolve(args.dir ?? join(ROOT, 'shots'));
const SHOTS = String(args.shots ?? args.shot ?? 'golden-fps').split(',').filter(Boolean);
const TIMEOUT = Number(args.timeout ?? 120000);
const SETTLE = Number(args.settle ?? 90);
const QUALITY = args.q ?? 'high';

const ANGLE = process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'vulkan';

const portOpen = (port) =>
  new Promise((res) => {
    const s = net.connect({ port, host: '127.0.0.1' }, () => (s.destroy(), res(true)));
    s.on('error', () => res(false));
    s.setTimeout(400, () => (s.destroy(), res(false)));
  });

export async function ensureServer(port = PORT) {
  if (await portOpen(port)) return null;
  const p = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await portOpen(port)) return p;
  }
  p.kill();
  throw new Error('vite failed to start');
}

export async function captureShots({ shots, dir, w = W, h = H, settle = SETTLE, quality = QUALITY, log = console.log }) {
  const server = await ensureServer();
  const browser = await chromium.launch({
    headless: true,
    args: [
      `--use-angle=${ANGLE}`,
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--disable-frame-rate-limit',
      '--force-color-profile=srgb',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });
  const results = [];
  const errors = [];
  try {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const logs = [];
      page.on('console', (m) => {
        logs.push(`[${m.type()}] ${m.text()}`);
        if (m.type() === 'error') errors.push(`${shot}: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`${shot}: ${e.message}`));
      await page.goto(`http://127.0.0.1:${PORT}/?capture=1&q=${quality}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await page.waitForFunction('window.__READY__ === true', null, { timeout: TIMEOUT });
      const label = await page.evaluate((s) => window.__APPLY_SHOT__?.(s) ?? 'no-shot-api', shot);
      await page.evaluate(
        (n) =>
          new Promise((done) => {
            let i = 0;
            const tick = () => (++i >= n ? done() : requestAnimationFrame(tick));
            requestAnimationFrame(tick);
          }),
        settle,
      );
      mkdirSync(dir, { recursive: true });
      const out = join(dir, `${shot}.png`);
      await page.screenshot({ path: out, type: 'png' });
      const info = await page.evaluate('window.__RENDER_INFO__ ?? null');
      const gpu = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const d = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl ? (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'NO WEBGL2';
      });
      results.push({ shot, label, out, info, gpu });
      log(JSON.stringify({ shot, out, info }));
      if (args.verbose) log(logs.slice(-40).join('\n'));
      await page.close();
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  return { results, errors };
}

if (process.argv[1]?.endsWith('capture.mjs')) {
  if (args.list) {
    const { SHOTS: defs } = await import('../src/render/shots.ts').catch(() => ({ SHOTS: {} }));
    console.log(Object.keys(defs).join('\n'));
  } else {
    const { results, errors } = await captureShots({ shots: SHOTS, dir: DIR });
    writeFileSync(join(DIR, 'capture.json'), JSON.stringify({ results, errors }, null, 2));
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exit(1);
    }
  }
}
