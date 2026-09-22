#!/usr/bin/env node
/**
 * Visual gate (ART_DIRECTION §10). One command, one verdict:
 *
 *   1. Captures every gold shot (golden + night, FPS / trainer / aerial,
 *      partner portraits, in-place battle) at 1600×900, quality "high".
 *   2. Budget per shot from PostFX.sceneStats: ≤ 300 scene draw calls,
 *      ≤ 2.5 M triangles. Zero console / page errors.
 *   3. Side-by-side boards against the reference images in docs/referencias.
 *   4. Per-pixel diff against the committed baseline in docs/gold (the crowd
 *      walks, so this is a drift alarm with a mean-delta threshold, not a
 *      pixel-exact check).
 *
 *   node tools/visual-gate.mjs                 # gate against docs/gold
 *   node tools/visual-gate.mjs --update        # accept current shots as the new baseline
 *   node tools/visual-gate.mjs --shots=golden-fps,night-fps
 *
 * Writes shots/gate/{*.png, sbs-*.png, report.json, report.md}.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureShots } from './capture.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'shots', 'gate');
const BASE = join(ROOT, 'docs', 'gold');
const REF = join(ROOT, 'docs', 'referencias');

const BUDGET = { calls: 300, triangles: 2_500_000 };
/** Mean per-pixel delta (0-255) above which a shot has drifted from baseline. */
const DRIFT_MEAN = Number(args.drift ?? 6);

const GOLD = [
  'golden-fps', 'golden-trainer', 'golden-top',
  'night-fps', 'night-trainer',
  'partner-agumon', 'partner-patamon',
  'battle-golden', 'battle-night',
];
const SHOTS = args.shots ? String(args.shots).split(',') : GOLD;

/** Which reference each shot is judged against in the side-by-side boards. */
const PAIRS = {
  'golden-fps': 'assets/shibuya-fps-reference.jpg',
  'golden-trainer': 'shibuya-fps-cartoon.png',
  'golden-top': 'assets/shibuya-top-reference.jpg',
  'night-fps': 'shibuya-night-hud.jpg',
  'night-trainer': 'shibuya-night-hud.jpg',
  'partner-agumon': 'assets/agumon01.png',
  'partner-patamon': 'assets/patamon01.png',
  'battle-night': 'shibuya-night-hud.jpg',
};

function diff(a, b) {
  const A = PNG.sync.read(readFileSync(a));
  const B = PNG.sync.read(readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return { status: 'size-mismatch' };
  let sum = 0;
  let changed = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    sum += d;
    if (d > 8) changed++;
  }
  const n = A.width * A.height;
  return { meanDelta: +(sum / n).toFixed(2), changedPct: +((changed / n) * 100).toFixed(2) };
}

async function sideBySide(results) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 520 }, deviceScaleFactor: 1 });
  const boards = [];
  for (const r of results) {
    const ref = PAIRS[r.shot];
    if (!ref || !existsSync(join(REF, ref))) continue;
    const html = `<!doctype html><html><body style="margin:0;background:#0b0f1a;font:600 14px system-ui;color:#cfe8ff">
      <div style="display:flex;gap:8px;padding:8px;height:504px;box-sizing:border-box">
        ${[['NUESTRO · ' + r.shot, pathToFileURL(r.out).href], ['REFERENCIA · ' + ref, pathToFileURL(join(REF, ref)).href]]
          .map(([t, src]) => `<figure style="flex:1;margin:0;display:flex;flex-direction:column;gap:6px;min-width:0">
            <figcaption>${t}</figcaption>
            <img src="${src}" style="flex:1;min-height:0;object-fit:contain;background:#000;border-radius:6px">
          </figure>`).join('')}
      </div></body></html>`;
    const file = join(OUT, `sbs-${r.shot}.html`);
    writeFileSync(file, html);
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const out = join(OUT, `sbs-${r.shot}.png`);
    await page.screenshot({ path: out });
    boards.push(out);
  }
  await browser.close();
  return boards;
}

mkdirSync(OUT, { recursive: true });
console.log(`visual-gate: capturando ${SHOTS.length} tomas…`);
const { results, errors } = await captureShots({ shots: SHOTS, dir: OUT, w: 1600, h: 900, quality: 'high', log: () => {} });

const rows = results.map((r) => {
  const calls = r.info?.calls ?? Infinity;
  const tris = r.info?.triangles ?? Infinity;
  const row = { shot: r.shot, calls, triangles: tris, fps: r.info?.fps ?? null, gpu: r.gpu, budget: calls <= BUDGET.calls && tris <= BUDGET.triangles };
  const base = join(BASE, `${r.shot}.png`);
  if (args.update) {
    mkdirSync(BASE, { recursive: true });
    copyFileSync(r.out, base);
    row.baseline = 'updated';
  } else if (existsSync(base)) {
    Object.assign(row, diff(base, r.out));
    row.drift = row.meanDelta > DRIFT_MEAN;
  } else {
    row.baseline = 'missing';
  }
  return row;
});

const boards = await sideBySide(results);
const missing = SHOTS.filter((s) => !results.some((r) => r.shot === s));
const fail = [
  ...errors.map((e) => `consola: ${e}`),
  ...missing.map((s) => `sin captura: ${s}`),
  ...rows.filter((r) => !r.budget).map((r) => `presupuesto: ${r.shot} ${r.calls} calls / ${r.triangles} tris`),
  ...rows.filter((r) => r.drift).map((r) => `deriva vs baseline: ${r.shot} meanΔ ${r.meanDelta}`),
];

const report = { ok: fail.length === 0, budget: BUDGET, driftMean: DRIFT_MEAN, rows, boards, errors, fail };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const md = [
  `# Visual gate — ${report.ok ? 'APROBADO' : 'FALLA'}`,
  '',
  `GPU: ${rows[0]?.gpu ?? '?'} · presupuesto ≤ ${BUDGET.calls} calls, ≤ ${(BUDGET.triangles / 1e6).toFixed(1)} M tris · deriva ≤ meanΔ ${DRIFT_MEAN}`,
  '',
  '| toma | calls | tris | fps | meanΔ | cambiado % | estado |',
  '|---|---:|---:|---:|---:|---:|---|',
  ...rows.map((r) => `| ${r.shot} | ${r.calls} | ${(r.triangles / 1e6).toFixed(2)} M | ${r.fps ?? '—'} | ${r.meanDelta ?? '—'} | ${r.changedPct ?? '—'} | ${!r.budget ? 'presupuesto' : r.drift ? 'deriva' : r.baseline ?? 'ok'} |`),
  '',
  ...(fail.length ? ['## Fallos', ...fail.map((f) => `- ${f}`)] : []),
].join('\n');
writeFileSync(join(OUT, 'report.md'), md);
console.log(md);
process.exit(report.ok ? 0 : 1);
