// Dev helper: capture the startup sequence (brand → loading → menu) at fixed times.
// usage: node scripts/dev/startup-shots.mjs <url> <outPrefix> [w] [h] [summaryJson]
import { chromium } from '@playwright/test';
const [url = 'http://localhost:5173/', prefix = 'startup', w = '1280', h = '800', summary = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) } });
if (summary) await ctx.addInitScript((s) => { try { localStorage.setItem('slipperyfish.profileSummary', s); } catch {} }, summary);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const t0 = Date.now();
await page.goto(url, { waitUntil: 'commit' });
for (const ms of [250, 700, 1200, 1700, 2400, 4000, 9000]) {
  const wait = ms - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `${prefix}_${ms}.png` });
}
console.log('errors:', JSON.stringify(errs));
await browser.close();
