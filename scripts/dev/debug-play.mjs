import { chromium } from '@playwright/test';
const args = process.argv[2] === 'gpu' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${e.stack}`));
page.on('crash', () => console.log('[CRASH]'));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(3000);
await page.click('.menu-modes .menu-btn:nth-child(1)');
await page.waitForTimeout(1500);
const mem0 = await page.evaluate(() => performance.memory?.usedJSHeapSize);
console.log('heap before', mem0);
await page.click('.level-node.current');
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(400);
  try { console.log('t', i, await page.evaluate(() => [performance.memory?.usedJSHeapSize, document.querySelectorAll('canvas').length])); } catch (e) { console.log('eval fail', e.message); break; }
}
await page.screenshot({ path: process.argv[3] ?? '/tmp/p.png' }).catch((e) => console.log('shot fail', e.message));
await browser.close();
