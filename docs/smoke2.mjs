// smoke test v2: captura TODOS los mensajes de consola + estado del DOM
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push('[PAGEERROR] ' + err.stack || err.message));
page.on('requestfailed', (req) => logs.push('[REQFAIL] ' + req.url() + ' ' + (req.failure()?.errorText || '')));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(4000);

const state = await page.evaluate(() => {
  const g = window.__game;
  const canvas = document.getElementById('c');
  return {
    booted: !!g,
    canvasExists: !!canvas,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    bodyHtml: document.body.innerHTML.slice(0, 200),
    hasHud: !!document.getElementById('hud'),
    hasDigivice: !!document.getElementById('digivice'),
    hasUiRoot: !!document.getElementById('ui-root')
  };
});
console.log('STATE:', JSON.stringify(state, null, 2));
console.log('LOGS:');
for (const l of logs) console.log(' ', l);
await browser.close();
