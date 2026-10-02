// Dev-only: drives the penguin with real keyboard events toward fish → stash.
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? '/tmp';
const level = process.argv[3] ?? 'current';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`); });
await page.goto('http://localhost:5173/');
await page.waitForSelector('#boot-loader', { state: 'detached', timeout: 30000 });
await page.waitForTimeout(800);
await page.click('.menu-modes .menu-btn:nth-child(1)', { force: true });
await page.waitForSelector('.level-node.current', { timeout: 20000 });
await page.waitForTimeout(900);
await page.click(level === 'current' ? '.level-node.current' : `.level-node:nth-child(${level})`, { force: true });
await page.waitForTimeout(1800);
const held = new Set();
async function setKeys(keys) {
  for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
let shots = 0;
for (let i = 0; i < 400; i++) {
  const st = await page.evaluate(() => {
    const s = window.__sf.activeSession; if (!s) return null;
    const sim = s.sim; const p = sim.player.body; const f = sim.fish.find((x) => x.state === 'free');
    return { status: sim.status, p: [p.x, p.y], f: f ? [f.body.x, f.body.y] : null, st: [sim.level.stash.x, sim.level.stash.y], t: sim.timeMs };
  });
  if (i % 20 === 0) console.log('i', i, JSON.stringify(st));
  if (!st || st.status !== 'playing') { console.log('status', st?.status, 't', st?.t); break; }
  if (!st.f) break;
  const [px, py] = st.p, [fx, fy] = st.f, [sx, sy] = st.st;
  let tx = sx - fx, ty = sy - fy; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const bx = fx - tx * 44, by = fy - ty * 44;
  let dx = bx - px, dy = by - py; const dl = Math.hypot(dx, dy);
  let mx, my;
  if (dl > 26) { mx = dx / dl; my = dy / dl; } else { mx = tx; my = ty; }
  const keys = [];
  if (mx > 0.38) keys.push('KeyD'); if (mx < -0.38) keys.push('KeyA'); if (my > 0.38) keys.push('KeyS'); if (my < -0.38) keys.push('KeyW');
  await setKeys(keys);
  if (i === 25 && shots++ === 0) await page.screenshot({ path: `${out}/bot_mid.png` });
  await page.waitForTimeout(60);
}
await setKeys([]);
await page.waitForTimeout(3800);
await page.screenshot({ path: `${out}/bot_end.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/bot_end2.png` });
await browser.close();
