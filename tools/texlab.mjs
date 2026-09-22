#!/usr/bin/env node
// Screenshots lab.html (every urban TextureLab preset) to shots/texlab.png.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { ensureServer } from './capture.mjs';

const out = resolve(process.argv[2] ?? 'shots/texlab.png');
const server = await ensureServer(5173);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 1900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/lab.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__READY__ === true', null, { timeout: 120000 });
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
console.log(JSON.stringify({ out, errors }));
await browser.close();
if (server) server.kill();
