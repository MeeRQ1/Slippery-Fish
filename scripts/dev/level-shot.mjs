// Dev helper: open the dev server, jump straight into a level and screenshot it.
// usage: node scripts/dev/level-shot.mjs <mode:adventure|daily|infinite> <n|seed> <out.png> [w] [h] [waitMs] [hard]
import { chromium } from '@playwright/test';
const [mode = 'adventure', arg = '1', out = 'level.png', w = '1280', h = '800', waitMs = '2500', hard = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`); });
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => !!window.__sf, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(async ([mode, arg, hard]) => {
  const d = await import('/src/progression/drivers.ts');
  const app = window.__sf;
  const svc = app.driverServices;
  let driver;
  if (mode === 'adventure') driver = d.adventureDriver(svc, Number(arg), hard === 'hard');
  else if (mode === 'daily') driver = d.dailyDriver(svc, Number(arg));
  else driver = d.infiniteDriver(svc, arg, hard === 'hard');
  await app.router.go('play', { driver });
}, [mode, arg, hard]);
await page.waitForTimeout(Number(waitMs));
await page.screenshot({ path: out });
await browser.close();
