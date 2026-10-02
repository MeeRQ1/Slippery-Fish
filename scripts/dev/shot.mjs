import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shot.png';
const w = Number(process.argv[4] ?? 1280), h = Number(process.argv[5] ?? 800);
const actions = process.argv[6] ?? '';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(3500);
for (const a of actions.split(';').filter(Boolean)) {
  const [kind, arg, arg2] = a.split('|');
  if (kind === 'click') await page.click(arg, { timeout: 5000 }).catch((e) => logs.push('click fail ' + arg + ' ' + e.message));
  if (kind === 'wait') await page.waitForTimeout(Number(arg));
  if (kind === 'key') await page.keyboard.down(arg), await page.waitForTimeout(Number(arg2 ?? 500)), await page.keyboard.up(arg);
  if (kind === 'shot') await page.screenshot({ path: arg });
  if (kind === 'eval') logs.push('eval: ' + JSON.stringify(await page.evaluate(arg)));
}
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
