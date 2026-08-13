// Locked gold-shot: same pose every time → docs/gold-fps.png
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
await page.mouse.click(800, 450);
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const g = window.__game;
  const p = g.ctx.get('player');
  const dn = g.ctx.get('daynight');
  if (dn) dn.hour = 18.5;
  p.pos.set(0, 1.7, 5);
  p.yaw = 0;
  p.pitch = -0.12;
  p.viewMode = 'trainer';
  if (p.mesh) p.mesh.visible = true;
  const b = g.ctx.get('battle');
  if (b && b.running && b._end) b._end('fled');
});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'D:/digimon-shibuya-protocol/docs/gold-fps.png' });
console.log('GOLD', errors.length ? errors.join(' | ') : 'ok');
await browser.close();
