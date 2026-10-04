// Generates public/cover.png (1200×630 key art for link previews) from the game's own art:
// the canonical logo, the hero igloo, a penguin, fish and the procedural chicks.
// usage: (dev server running on :5173) node scripts/make-cover.mjs
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => !!window.__sf, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const dom = await import('/src/ui/dom.ts');
  const goal = await import('/src/art/goalArt.ts');
  const el = document.createElement('div');
  el.id = 'cover';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:hidden;background:linear-gradient(180deg,#4aa3ee 0%,#9fd6f7 55%,#eaf6ff 56%,#d6ebf9 100%);font-family:Fredoka,sans-serif';
  const add = (node, css) => { node.style.cssText += ';position:absolute;' + css; el.append(node); return node; };
  const hill = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;border-radius:50% 50% 0 0;' + css; el.append(d); };
  hill('left:-120px;bottom:250px;width:700px;height:150px;background:#ffffff');
  hill('right:-160px;bottom:250px;width:820px;height:190px;background:#eef7fd');
  add(dom.sprite('menu_igloo_main', { height: 270 }), 'right:110px;bottom:90px');
  const chick = (m, i, css) => { const c = goal.drawChick(m, i); const img = new Image(); img.src = c.toDataURL(); img.style.width = '64px'; add(img, css); };
  chick('cheer', 0, 'right:330px;bottom:110px'); chick('cheer', 1, 'right:100px;bottom:112px'); chick('idle', 2, 'right:250px;bottom:96px');
  add(dom.sprite('penguin_classic', { height: 190 }), 'left:220px;bottom:70px;transform:rotate(-8deg)');
  add(dom.sprite('fish_standard', { height: 70 }), 'left:450px;bottom:120px;transform:rotate(-14deg)');
  add(dom.sprite('fish_rare', { height: 56 }), 'left:560px;bottom:200px;transform:rotate(10deg)');
  add(dom.sprite('pine_tree_7c', { height: 210 }), 'left:30px;bottom:150px');
  const logo = new Image(); logo.src = './assets/images/ui_logo.webp'; logo.style.width = '370px'; add(logo, 'left:110px;top:36px;filter:drop-shadow(0 8px 0 rgba(27,42,68,.2))');
  const tag = document.createElement('div'); tag.textContent = 'Dribble. Aim for the gap. Feed the chicks!';
  add(tag, 'left:60px;top:250px;font-weight:800;font-size:30px;color:#1b2a44;background:#fff;border:4px solid #1b2a44;border-radius:18px;padding:6px 16px;box-shadow:0 6px 0 #1b2a44');
  document.body.append(el);
  await new Promise((r) => setTimeout(r, 1200));
});
await page.locator('#cover').screenshot({ path: 'public/cover.png' });
await browser.close();
console.log('wrote public/cover.png');
