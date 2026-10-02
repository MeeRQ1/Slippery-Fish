// Splits main-thread time into script / style+layout / other using CDP Performance metrics.
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:4174/Slippery-Fish/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
async function window(label, ms = 4000) {
  const a = await metrics();
  const frames0 = await page.evaluate(() => (window.__frames = 0, (function f() { window.__frames++; requestAnimationFrame(f); })(), 0));
  await page.waitForTimeout(ms);
  const b = await metrics();
  const frames = await page.evaluate(() => window.__frames);
  const d = (k) => ((b[k] - a[k]) * 1000).toFixed(0);
  console.log(`${label}: ${frames} frames in ${ms}ms | script ${d('ScriptDuration')}ms, style ${d('RecalcStyleDuration')}ms, layout ${d('LayoutDuration')}ms, task total ${d('TaskDuration')}ms | per frame script ${((b.ScriptDuration - a.ScriptDuration) * 1000 / Math.max(1, frames)).toFixed(1)}ms`);
}
await page.goto(base);
await page.locator('#boot-loader').waitFor({ state: 'detached', timeout: 60000 });
await page.waitForTimeout(1500);
await window('menu');
await page.getByRole('button', { name: 'Adventure Map', exact: true }).click();
await page.waitForTimeout(2500);
await page.getByRole('listitem', { name: /^Level 1,/ }).click();
await page.locator('.hud').waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
await page.keyboard.down('KeyD');
await window('gameplay L1');
await page.keyboard.up('KeyD');
await browser.close();
