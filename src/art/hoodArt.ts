/**
 * Procedural Hood art (PLACEHOLDER-QUALITY VECTOR ART, documented as such).
 * Every Hood has its own recipe (shape kind + palette + decoration); within a
 * rarity no shape repeats, so Hoods are distinct objects rather than recolours.
 * Drawn at 128×112 with the "head contact" at the bottom centre (64, 104).
 */
import type { HoodArt, HoodArtKind, HoodDeco } from '../progression/hoods';
import { makeCanvas } from './canvas';

const OL = '#1b2a44';
const W = 128, H = 112, CX = 64, BASE = 104;

type Ctx = CanvasRenderingContext2D;

interface Paint { main: string; accent: string; detail: string }

function ellipse(cx: number, cy: number, rx: number, ry: number): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  return p;
}
function rrect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}
function poly(pts: Array<[number, number]>): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}
function dome(cx: number, base: number, rx: number, ry: number): Path2D {
  const p = new Path2D();
  p.moveTo(cx - rx, base);
  p.ellipse(cx, base, rx, ry, 0, Math.PI, Math.PI * 2);
  p.closePath();
  return p;
}
function fillStroke(ctx: Ctx, p: Path2D, fill: string, lw = 5): void {
  ctx.fillStyle = fill;
  ctx.fill(p);
  ctx.lineWidth = lw;
  ctx.strokeStyle = OL;
  ctx.stroke(p);
}
function star(cx: number, cy: number, r: number, inner = 0.45, points = 5): Path2D {
  const p = new Path2D();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * inner;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
  return p;
}
function shine(ctx: Ctx, x: number, y: number, rx = 6, ry = 10): void {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Applies decoration clipped to the main body path. */
function decorate(ctx: Ctx, body: Path2D, deco: HoodDeco, c: Paint): void {
  if (deco === 'none') return;
  ctx.save();
  ctx.clip(body);
  switch (deco) {
    case 'stripes':
      ctx.fillStyle = c.detail;
      for (let y = 10; y < H; y += 18) ctx.fillRect(0, y, W, 7);
      break;
    case 'dots':
      ctx.fillStyle = c.detail;
      for (let y = 14; y < H; y += 16) for (let x = (y / 16) % 2 ? 8 : 16; x < W; x += 18) { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'grime':
      ctx.fillStyle = 'rgba(30,25,15,0.28)';
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(20 + ((i * 37) % 90), 30 + ((i * 23) % 70), 9, 5, i, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'stars':
      ctx.fillStyle = c.detail;
      for (let i = 0; i < 6; i++) ctx.fill(star(18 + ((i * 41) % 92), 28 + ((i * 29) % 66), 6));
      break;
    case 'patch':
      ctx.fillStyle = c.detail;
      ctx.fill(rrect(70, 60, 22, 18, 3));
      ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.stroke(rrect(70, 60, 22, 18, 3)); ctx.setLineDash([]);
      break;
    case 'gem':
      break;
    default:
      break;
  }
  ctx.restore();
  if (deco === 'drips') {
    ctx.fillStyle = c.accent;
    for (const [x, l] of [[40, 14], [58, 9], [80, 16]] as Array<[number, number]>) {
      const p = new Path2D();
      p.moveTo(x - 5, BASE - 6); p.lineTo(x + 5, BASE - 6); p.lineTo(x + 3, BASE + l - 6);
      p.arc(x, BASE + l - 6, 3.5, 0, Math.PI); p.closePath();
      fillStroke(ctx, p, c.accent, 2.5);
    }
  }
  if (deco === 'gem') {
    const g = poly([[CX, 42], [CX + 10, 52], [CX, 64], [CX - 10, 52]]);
    fillStroke(ctx, g, c.detail, 3);
    shine(ctx, CX - 3, 49, 2.5, 4);
  }
  if (deco === 'sparkles') {
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of [[18, 26, 7], [108, 34, 6], [100, 80, 5], [22, 78, 4]] as Array<[number, number, number]>) {
      const s = star(x, y, r, 0.3, 4);
      ctx.fill(s);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(27,42,68,0.6)'; ctx.stroke(s);
    }
  }
}

type Drawer = (ctx: Ctx, c: Paint) => Path2D;

const brim = (ctx: Ctx, c: string, w = 104, h = 16) => fillStroke(ctx, ellipse(CX, BASE - 4, w / 2, h / 2), c);

const DRAW: Record<HoodArtKind, Drawer> = {
  beanie: (ctx, c) => { const b = dome(CX, BASE - 8, 44, 52); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(18, BASE - 22, 92, 22, 10), c.accent); fillStroke(ctx, ellipse(CX, BASE - 66, 13, 13), c.detail); return b; },
  cap: (ctx, c) => { fillStroke(ctx, poly([[CX + 10, BASE - 14], [CX + 62, BASE - 6], [CX + 58, BASE + 2], [CX + 4, BASE - 2]]), c.accent); const b = dome(CX - 4, BASE - 4, 42, 44); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX - 4, BASE - 48, 6, 4), c.accent, 3); return b; },
  bucket: (ctx, c) => { brim(ctx, c.accent, 112, 22); const b = poly([[CX - 34, BASE - 8], [CX - 26, BASE - 56], [CX + 26, BASE - 56], [CX + 34, BASE - 8]]); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 32, BASE - 26, 64, 10, 4), c.detail, 3); return b; },
  tophat: (ctx, c) => { brim(ctx, c.main, 104, 18); const b = rrect(CX - 28, BASE - 78, 56, 72, 6); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 28, BASE - 28, 56, 12, 2), c.accent, 3); return b; },
  crown: (ctx, c) => { const b = poly([[CX - 42, BASE - 4], [CX - 46, BASE - 58], [CX - 24, BASE - 34], [CX, BASE - 66], [CX + 24, BASE - 34], [CX + 46, BASE - 58], [CX + 42, BASE - 4]]); fillStroke(ctx, b, c.main); for (const x of [-46, 0, 46]) fillStroke(ctx, ellipse(CX + x, BASE - (x === 0 ? 70 : 62), 6, 6), c.detail, 3); fillStroke(ctx, rrect(CX - 42, BASE - 20, 84, 14, 4), c.accent, 3); return b; },
  tiara: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 48, BASE - 2); b.quadraticCurveTo(CX, BASE - 40, CX + 48, BASE - 2); b.lineTo(CX + 40, BASE + 4); b.quadraticCurveTo(CX, BASE - 26, CX - 40, BASE + 4); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, poly([[CX - 14, BASE - 22], [CX, BASE - 56], [CX + 14, BASE - 22]]), c.accent); fillStroke(ctx, ellipse(CX, BASE - 34, 7, 9), c.detail, 3); return b; },
  helmet: (ctx, c) => { const b = dome(CX, BASE - 2, 48, 60); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 6, BASE - 62, 12, 58, 5), c.accent, 3); shine(ctx, CX - 24, BASE - 34); return b; },
  horns: (ctx, c) => { fillStroke(ctx, dome(CX, BASE - 2, 38, 30), c.accent); const l = new Path2D(); l.moveTo(CX - 30, BASE - 18); l.quadraticCurveTo(CX - 62, BASE - 30, CX - 54, BASE - 78); l.quadraticCurveTo(CX - 40, BASE - 44, CX - 16, BASE - 28); l.closePath(); fillStroke(ctx, l, c.main); const r = new Path2D(); r.moveTo(CX + 30, BASE - 18); r.quadraticCurveTo(CX + 62, BASE - 30, CX + 54, BASE - 78); r.quadraticCurveTo(CX + 40, BASE - 44, CX + 16, BASE - 28); r.closePath(); fillStroke(ctx, r, c.main); const both = new Path2D(); both.addPath(l); both.addPath(r); return both; },
  horn: (ctx, c) => { fillStroke(ctx, ellipse(CX, BASE - 6, 30, 10), c.accent); const b = poly([[CX - 16, BASE - 8], [CX + 4, BASE - 96], [CX + 16, BASE - 8]]); fillStroke(ctx, b, c.main); return b; },
  halo: (ctx, c) => { const b = new Path2D(); b.ellipse(CX, BASE - 50, 44, 14, 0, 0, Math.PI * 2); b.ellipse(CX, BASE - 50, 30, 7, 0, 0, Math.PI * 2); ctx.fillStyle = c.main; ctx.fill(b, 'evenodd'); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke(b); ctx.globalAlpha = 0.35; fillStroke(ctx, ellipse(CX, BASE - 50, 54, 20), c.detail, 0.1); ctx.globalAlpha = 1; return b; },
  band: (ctx, c) => { const b = rrect(CX - 50, BASE - 26, 100, 24, 12); fillStroke(ctx, b, c.main); fillStroke(ctx, poly([[CX + 40, BASE - 20], [CX + 62, BASE - 36], [CX + 58, BASE - 10]]), c.accent, 4); return b; },
  bow: (ctx, c) => { const l = poly([[CX, BASE - 30], [CX - 48, BASE - 56], [CX - 46, BASE - 6]]); const r = poly([[CX, BASE - 30], [CX + 48, BASE - 56], [CX + 46, BASE - 6]]); fillStroke(ctx, l, c.main); fillStroke(ctx, r, c.main); fillStroke(ctx, ellipse(CX, BASE - 30, 12, 14), c.accent); const b = new Path2D(); b.addPath(l); b.addPath(r); return b; },
  goggles: (ctx, c) => { fillStroke(ctx, rrect(CX - 54, BASE - 30, 108, 12, 6), c.accent, 4); const b = new Path2D(); b.ellipse(CX - 24, BASE - 30, 20, 18, 0, 0, Math.PI * 2); b.ellipse(CX + 24, BASE - 30, 20, 18, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX - 24, BASE - 30, 12, 10), c.detail, 3); fillStroke(ctx, ellipse(CX + 24, BASE - 30, 12, 10), c.detail, 3); shine(ctx, CX - 28, BASE - 34, 3, 5); shine(ctx, CX + 20, BASE - 34, 3, 5); return b; },
  shades: (ctx, c) => { const b = new Path2D(); b.roundRect(CX - 50, BASE - 40, 44, 26, 10); b.roundRect(CX + 6, BASE - 40, 44, 26, 10); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 8, BASE - 34, 16, 6, 3), c.main, 3); shine(ctx, CX - 38, BASE - 32, 4, 7); shine(ctx, CX + 18, BASE - 32, 4, 7); return b; },
  bowl: (ctx, c) => { const b = dome(CX, BASE - 2, 50, 54); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 52, BASE - 12, 104, 14, 7), c.accent, 4); return b; },
  can: (ctx, c) => { const b = poly([[CX - 30, BASE - 6], [CX - 26, BASE - 70], [CX - 6, BASE - 58], [CX + 12, BASE - 74], [CX + 30, BASE - 62], [CX + 32, BASE - 6]]); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 6, 32, 8), c.accent, 4); return b; },
  box: (ctx, c) => { const b = rrect(CX - 40, BASE - 66, 80, 62, 6); fillStroke(ctx, b, c.main); fillStroke(ctx, poly([[CX - 40, BASE - 66], [CX - 22, BASE - 84], [CX + 58, BASE - 84], [CX + 40, BASE - 66]]), c.accent, 4); return b; },
  cup: (ctx, c) => { const b = poly([[CX - 30, BASE - 4], [CX - 40, BASE - 64], [CX + 40, BASE - 64], [CX + 30, BASE - 4]]); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 64, 40, 8), c.accent, 4); return b; },
  wrapper: (ctx, c) => { fillStroke(ctx, poly([[CX - 54, BASE - 46], [CX - 40, BASE - 30], [CX - 54, BASE - 14]]), c.accent, 4); fillStroke(ctx, poly([[CX + 54, BASE - 46], [CX + 40, BASE - 30], [CX + 54, BASE - 14]]), c.accent, 4); const b = rrect(CX - 42, BASE - 48, 84, 38, 14); fillStroke(ctx, b, c.main); return b; },
  sock: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 20, BASE - 4); b.lineTo(CX - 20, BASE - 70); b.lineTo(CX + 14, BASE - 70); b.lineTo(CX + 14, BASE - 34); b.quadraticCurveTo(CX + 52, BASE - 30, CX + 48, BASE - 8); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 22, BASE - 78, 38, 14, 4), c.accent, 4); return b; },
  mitten: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 30, BASE - 4); b.lineTo(CX - 32, BASE - 56); b.quadraticCurveTo(CX, BASE - 92, CX + 30, BASE - 56); b.lineTo(CX + 30, BASE - 4); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX - 40, BASE - 40, 12, 18), c.main); fillStroke(ctx, rrect(CX - 34, BASE - 18, 68, 16, 6), c.accent, 4); return b; },
  backpack: (ctx, c) => { const b = rrect(CX - 34, BASE - 74, 68, 70, 16); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 22, BASE - 40, 44, 26, 8), c.accent, 4); fillStroke(ctx, rrect(CX - 10, BASE - 86, 20, 16, 6), c.detail, 3); return b; },
  earmuffs: (ctx, c) => { const arc = new Path2D(); arc.moveTo(CX - 44, BASE - 22); arc.quadraticCurveTo(CX, BASE - 92, CX + 44, BASE - 22); ctx.lineWidth = 14; ctx.strokeStyle = OL; ctx.stroke(arc); ctx.lineWidth = 7; ctx.strokeStyle = c.accent; ctx.stroke(arc); const b = new Path2D(); b.ellipse(CX - 46, BASE - 18, 18, 20, 0, 0, Math.PI * 2); b.ellipse(CX + 46, BASE - 18, 18, 20, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main); return b; },
  headphones: (ctx, c) => { const arc = new Path2D(); arc.moveTo(CX - 46, BASE - 22); arc.quadraticCurveTo(CX, BASE - 96, CX + 46, BASE - 22); ctx.lineWidth = 16; ctx.strokeStyle = OL; ctx.stroke(arc); ctx.lineWidth = 8; ctx.strokeStyle = c.main; ctx.stroke(arc); const b = new Path2D(); b.roundRect(CX - 62, BASE - 40, 24, 38, 10); b.roundRect(CX + 38, BASE - 40, 24, 38, 10); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 56, BASE - 32, 10, 22, 4), c.detail, 2); fillStroke(ctx, rrect(CX + 46, BASE - 32, 10, 22, 4), c.detail, 2); return b; },
  plume: (ctx, c) => { fillStroke(ctx, rrect(CX - 30, BASE - 18, 60, 16, 8), c.accent); const b = new Path2D(); b.moveTo(CX - 4, BASE - 16); b.bezierCurveTo(CX - 50, BASE - 50, CX - 20, BASE - 100, CX + 22, BASE - 98); b.bezierCurveTo(CX - 6, BASE - 80, CX + 14, BASE - 40, CX + 6, BASE - 16); b.closePath(); fillStroke(ctx, b, c.main); return b; },
  wreath: (ctx, c) => { const b = new Path2D(); for (let i = 0; i < 9; i++) { const t = i / 8; const x = CX - 48 + t * 96; const y = BASE - 12 - Math.sin(t * Math.PI) * 26; b.ellipse(x, y, 11, 6, (t - 0.5) * 1.6 + (i % 2 ? 0.6 : -0.6), 0, Math.PI * 2); } fillStroke(ctx, b, c.main, 3); fillStroke(ctx, ellipse(CX, BASE - 40, 7, 7), c.detail, 3); return b; },
  wizard: (ctx, c) => { brim(ctx, c.main, 108, 18); const b = new Path2D(); b.moveTo(CX - 34, BASE - 8); b.quadraticCurveTo(CX - 4, BASE - 50, CX + 22, BASE - 104); b.quadraticCurveTo(CX + 18, BASE - 50, CX + 34, BASE - 8); b.closePath(); fillStroke(ctx, b, c.main); return b; },
  tricorn: (ctx, c) => { const b = poly([[CX - 58, BASE - 18], [CX - 30, BASE - 52], [CX, BASE - 40], [CX + 30, BASE - 52], [CX + 58, BASE - 18], [CX, BASE - 4]]); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 26, 10, 10), c.detail, 3); return b; },
  bicorne: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 62, BASE - 8); b.quadraticCurveTo(CX, BASE - 70, CX + 62, BASE - 8); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 22, 9, 9), c.accent, 3); return b; },
  toque: (ctx, c) => { const b = new Path2D(); b.ellipse(CX - 22, BASE - 62, 22, 22, 0, 0, Math.PI * 2); b.ellipse(CX + 22, BASE - 62, 22, 22, 0, 0, Math.PI * 2); b.ellipse(CX, BASE - 76, 24, 24, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 32, BASE - 46, 64, 42, 6), c.main); return b; },
  cowboy: (ctx, c) => { const brimP = new Path2D(); brimP.moveTo(CX - 62, BASE - 26); brimP.quadraticCurveTo(CX, BASE + 6, CX + 62, BASE - 26); brimP.quadraticCurveTo(CX, BASE - 10, CX - 62, BASE - 26); fillStroke(ctx, brimP, c.main); const b = new Path2D(); b.moveTo(CX - 30, BASE - 16); b.quadraticCurveTo(CX - 34, BASE - 70, CX - 14, BASE - 66); b.quadraticCurveTo(CX, BASE - 56, CX + 14, BASE - 66); b.quadraticCurveTo(CX + 34, BASE - 70, CX + 30, BASE - 16); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 31, BASE - 30, 62, 10, 3), c.accent, 3); return b; },
  jester: (ctx, c) => { const l = new Path2D(); l.moveTo(CX - 6, BASE - 16); l.quadraticCurveTo(CX - 40, BASE - 60, CX - 56, BASE - 40); l.lineTo(CX - 30, BASE - 10); l.closePath(); const r = new Path2D(); r.moveTo(CX + 6, BASE - 16); r.quadraticCurveTo(CX + 40, BASE - 60, CX + 56, BASE - 40); r.lineTo(CX + 30, BASE - 10); r.closePath(); const m = poly([[CX - 14, BASE - 14], [CX, BASE - 76], [CX + 14, BASE - 14]]); fillStroke(ctx, l, c.main); fillStroke(ctx, r, c.accent); fillStroke(ctx, m, c.main); for (const [x, y] of [[-56, -40], [56, -40], [0, -78]] as Array<[number, number]>) fillStroke(ctx, ellipse(CX + x, BASE + y, 7, 7), c.detail, 3); fillStroke(ctx, rrect(CX - 34, BASE - 16, 68, 14, 6), c.detail, 3); const b = new Path2D(); b.addPath(l); b.addPath(m); return b; },
  nightcap: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 40, BASE - 10); b.quadraticCurveTo(CX - 30, BASE - 76, CX + 30, BASE - 64); b.quadraticCurveTo(CX + 60, BASE - 56, CX + 58, BASE - 22); b.quadraticCurveTo(CX + 36, BASE - 42, CX + 40, BASE - 10); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 44, BASE - 18, 88, 16, 8), c.accent, 4); fillStroke(ctx, ellipse(CX + 58, BASE - 18, 10, 10), c.accent, 3); return b; },
  party: (ctx, c) => { const b = poly([[CX - 30, BASE - 6], [CX, BASE - 92], [CX + 30, BASE - 6]]); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 94, 10, 10), c.accent, 3); return b; },
  stack: (ctx, c) => { const b = new Path2D(); for (let i = 0; i < 4; i++) b.roundRect(CX - 40 + i * 2, BASE - 18 - i * 16, 80 - i * 4, 16, 8); fillStroke(ctx, b, c.main); return b; },
  strawberry: (ctx, c) => { const b = new Path2D(); b.moveTo(CX, BASE - 4); b.bezierCurveTo(CX - 60, BASE - 30, CX - 40, BASE - 78, CX, BASE - 72); b.bezierCurveTo(CX + 40, BASE - 78, CX + 60, BASE - 30, CX, BASE - 4); fillStroke(ctx, b, c.main); fillStroke(ctx, star(CX, BASE - 74, 18, 0.45, 6), c.accent, 3); return b; },
  pineapple: (ctx, c) => { fillStroke(ctx, poly([[CX - 16, BASE - 66], [CX - 26, BASE - 104], [CX - 4, BASE - 76], [CX, BASE - 108], [CX + 6, BASE - 76], [CX + 26, BASE - 104], [CX + 16, BASE - 66]]), c.accent, 3); const b = ellipse(CX, BASE - 36, 30, 34); fillStroke(ctx, b, c.main); ctx.save(); ctx.clip(b); ctx.strokeStyle = c.detail; ctx.lineWidth = 3; for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(CX + i * 14 - 40, BASE - 80); ctx.lineTo(CX + i * 14 + 40, BASE); ctx.stroke(); ctx.beginPath(); ctx.moveTo(CX + i * 14 + 40, BASE - 80); ctx.lineTo(CX + i * 14 - 40, BASE); ctx.stroke(); } ctx.restore(); return b; },
  watermelon: (ctx, c) => { const rind = new Path2D(); rind.moveTo(CX - 54, BASE - 8); rind.ellipse(CX, BASE - 8, 54, 60, 0, Math.PI, Math.PI * 2); rind.closePath(); fillStroke(ctx, rind, c.accent); const b = new Path2D(); b.moveTo(CX - 44, BASE - 8); b.ellipse(CX, BASE - 8, 44, 50, 0, Math.PI, Math.PI * 2); b.closePath(); fillStroke(ctx, b, c.main, 3); return b; },
  donut: (ctx, c) => { const d = new Path2D(); d.ellipse(CX, BASE - 30, 48, 30, 0, 0, Math.PI * 2); d.ellipse(CX, BASE - 32, 14, 8, 0, 0, Math.PI * 2); ctx.fillStyle = c.main; ctx.fill(d, 'evenodd'); ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.stroke(d); const icing = new Path2D(); icing.ellipse(CX, BASE - 34, 42, 22, 0, 0, Math.PI * 2); icing.ellipse(CX, BASE - 32, 15, 9, 0, 0, Math.PI * 2); ctx.fillStyle = c.accent; ctx.fill(icing, 'evenodd'); return icing; },
  cupcake: (ctx, c) => { fillStroke(ctx, poly([[CX - 30, BASE - 40], [CX - 22, BASE - 2], [CX + 22, BASE - 2], [CX + 30, BASE - 40]]), c.accent); const b = new Path2D(); b.ellipse(CX, BASE - 50, 36, 22, 0, 0, Math.PI * 2); b.ellipse(CX, BASE - 66, 22, 16, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 84, 8, 8), c.detail, 3); return b; },
  icecream: (ctx, c) => { fillStroke(ctx, poly([[CX - 24, BASE - 46], [CX, BASE - 2], [CX + 24, BASE - 46]]), c.accent); const b = new Path2D(); b.ellipse(CX, BASE - 58, 30, 24, 0, 0, Math.PI * 2); b.ellipse(CX, BASE - 82, 20, 16, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main); return b; },
  spaghetti: (ctx, c) => { const b = dome(CX, BASE - 22, 48, 42); fillStroke(ctx, b, c.main); ctx.strokeStyle = shadeStr(c.main); ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(CX - 30 + i * 12, BASE - 40, 10, 0.2, 2.6); ctx.stroke(); } fillStroke(ctx, ellipse(CX - 12, BASE - 54, 9, 8), c.accent, 3); fillStroke(ctx, ellipse(CX + 14, BASE - 46, 8, 7), c.accent, 3); fillStroke(ctx, rrect(CX - 52, BASE - 24, 104, 20, 9), c.detail); return b; },
  sushi: (ctx, c) => { const b = ellipse(CX, BASE - 30, 46, 26); fillStroke(ctx, b, c.detail); fillStroke(ctx, ellipse(CX, BASE - 44, 40, 18), c.accent); fillStroke(ctx, rrect(CX - 12, BASE - 54, 24, 46, 4), c.main, 3); return b; },
  taco: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 54, BASE - 6); b.ellipse(CX, BASE - 6, 54, 58, 0, Math.PI, Math.PI * 2); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX - 18, BASE - 52, 12, 6), c.accent, 3); fillStroke(ctx, ellipse(CX + 16, BASE - 54, 10, 6), c.detail, 3); return b; },
  burger: (ctx, c) => { fillStroke(ctx, rrect(CX - 44, BASE - 18, 88, 16, 8), c.main); fillStroke(ctx, rrect(CX - 46, BASE - 30, 92, 14, 7), c.accent); fillStroke(ctx, rrect(CX - 46, BASE - 38, 92, 10, 5), c.detail, 3); const b = dome(CX, BASE - 38, 44, 36); fillStroke(ctx, b, c.main); return b; },
  pizza: (ctx, c) => { const b = poly([[CX - 46, BASE - 66], [CX + 46, BASE - 66], [CX, BASE - 4]]); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 50, BASE - 76, 100, 14, 7), c.detail); return b; },
  croissant: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 56, BASE - 18); b.quadraticCurveTo(CX, BASE - 90, CX + 56, BASE - 18); b.quadraticCurveTo(CX, BASE - 50, CX - 56, BASE - 18); fillStroke(ctx, b, c.main); ctx.strokeStyle = OL; ctx.lineWidth = 3; for (const x of [-26, 0, 26]) { ctx.beginPath(); ctx.moveTo(CX + x - 6, BASE - 58 + Math.abs(x) * 0.6); ctx.lineTo(CX + x + 6, BASE - 40 + Math.abs(x) * 0.5); ctx.stroke(); } return b; },
  cheese: (ctx, c) => { const b = poly([[CX - 50, BASE - 6], [CX + 50, BASE - 6], [CX + 50, BASE - 40], [CX - 50, BASE - 64]]); fillStroke(ctx, b, c.main); for (const [x, y, r] of [[-24, -30, 7], [10, -22, 5], [30, -32, 6]] as Array<[number, number, number]>) fillStroke(ctx, ellipse(CX + x, BASE + y, r, r), c.accent, 2.5); return b; },
  broccoli: (ctx, c) => { fillStroke(ctx, rrect(CX - 12, BASE - 40, 24, 36, 6), c.detail); const b = new Path2D(); for (const [x, y, r] of [[-28, -54, 20], [0, -66, 24], [28, -54, 20], [-12, -44, 16], [14, -44, 16]] as Array<[number, number, number]>) b.ellipse(CX + x, BASE + y, r, r, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main); return b; },
  pudding: (ctx, c) => { const b = poly([[CX - 44, BASE - 4], [CX - 32, BASE - 60], [CX + 32, BASE - 60], [CX + 44, BASE - 4]]); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 60, 32, 10), c.accent); fillStroke(ctx, ellipse(CX, BASE - 74, 8, 8), '#e8384a', 3); return b; },
  dumpling: (ctx, c) => { const b = rrect(CX - 46, BASE - 46, 92, 42, 10); fillStroke(ctx, b, c.main); ctx.strokeStyle = OL; ctx.lineWidth = 2.5; for (let y = BASE - 38; y < BASE - 8; y += 8) { ctx.beginPath(); ctx.moveTo(CX - 44, y); ctx.lineTo(CX + 44, y); ctx.stroke(); } fillStroke(ctx, dome(CX, BASE - 46, 48, 34), c.main); fillStroke(ctx, ellipse(CX, BASE - 64, 14, 10), c.accent, 3); return b; },
  corn: (ctx, c) => { fillStroke(ctx, poly([[CX - 14, BASE - 8], [CX - 46, BASE - 50], [CX - 10, BASE - 30]]), c.accent, 3); fillStroke(ctx, poly([[CX + 14, BASE - 8], [CX + 46, BASE - 50], [CX + 10, BASE - 30]]), c.accent, 3); const b = ellipse(CX, BASE - 50, 22, 46); fillStroke(ctx, b, c.main); return b; },
  bento: (ctx, c) => { const b = rrect(CX - 50, BASE - 54, 100, 50, 8); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 44, BASE - 48, 40, 38, 4), c.detail, 3); fillStroke(ctx, rrect(CX + 2, BASE - 48, 42, 18, 4), '#47c28b', 3); fillStroke(ctx, rrect(CX + 2, BASE - 28, 42, 18, 4), '#ff8a6a', 3); return b; },
  pancakes: (ctx, c) => { const b = new Path2D(); for (let i = 0; i < 4; i++) b.ellipse(CX, BASE - 14 - i * 13, 46 - i * 2, 11, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 10, BASE - 72, 20, 12, 3), c.detail, 3); return b; },
  waffle: (ctx, c) => { const b = rrect(CX - 46, BASE - 58, 92, 54, 10); fillStroke(ctx, b, c.main); ctx.save(); ctx.clip(b); ctx.strokeStyle = c.accent; ctx.lineWidth = 5; for (let x = CX - 46; x < CX + 50; x += 18) { ctx.beginPath(); ctx.moveTo(x, BASE - 60); ctx.lineTo(x, BASE); ctx.stroke(); } for (let y = BASE - 58; y < BASE; y += 18) { ctx.beginPath(); ctx.moveTo(CX - 50, y); ctx.lineTo(CX + 50, y); ctx.stroke(); } ctx.restore(); return b; },
  planet: (ctx, c) => { const b = ellipse(CX, BASE - 44, 30, 30); fillStroke(ctx, b, c.main); const ring = new Path2D(); ring.ellipse(CX, BASE - 42, 58, 12, -0.25, 0, Math.PI * 2); ctx.lineWidth = 11; ctx.strokeStyle = OL; ctx.stroke(ring); ctx.lineWidth = 6; ctx.strokeStyle = c.accent; ctx.stroke(ring); return b; },
  antlers: (ctx, c) => { const b = new Path2D(); for (const sx of [-1, 1]) { b.moveTo(CX + sx * 10, BASE - 6); b.lineTo(CX + sx * 30, BASE - 70); b.moveTo(CX + sx * 22, BASE - 44); b.lineTo(CX + sx * 50, BASE - 58); b.moveTo(CX + sx * 27, BASE - 60); b.lineTo(CX + sx * 16, BASE - 86); } ctx.lineCap = 'round'; ctx.lineWidth = 15; ctx.strokeStyle = OL; ctx.stroke(b); ctx.lineWidth = 8; ctx.strokeStyle = c.main; ctx.stroke(b); return new Path2D(); },
  star: (ctx, c) => { const b = star(CX, BASE - 46, 40, 0.48); fillStroke(ctx, b, c.main); shine(ctx, CX - 10, BASE - 56, 4, 7); return b; },
  snowflake: (ctx, c) => { const b = new Path2D(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.moveTo(CX, BASE - 46); b.lineTo(CX + Math.cos(a) * 42, BASE - 46 + Math.sin(a) * 42); const mx = CX + Math.cos(a) * 26, my = BASE - 46 + Math.sin(a) * 26; b.moveTo(mx, my); b.lineTo(mx + Math.cos(a + 0.8) * 12, my + Math.sin(a + 0.8) * 12); b.moveTo(mx, my); b.lineTo(mx + Math.cos(a - 0.8) * 12, my + Math.sin(a - 0.8) * 12); } ctx.lineCap = 'round'; ctx.lineWidth = 13; ctx.strokeStyle = OL; ctx.stroke(b); ctx.lineWidth = 7; ctx.strokeStyle = c.main; ctx.stroke(b); return new Path2D(); },
  globe: (ctx, c) => { fillStroke(ctx, rrect(CX - 30, BASE - 22, 60, 20, 6), c.accent); const b = ellipse(CX, BASE - 56, 36, 36); fillStroke(ctx, b, c.main); fillStroke(ctx, poly([[CX - 14, BASE - 32], [CX, BASE - 60], [CX + 14, BASE - 32]]), '#2f8f6a', 3); return b; },
  disco: (ctx, c) => { const b = ellipse(CX, BASE - 46, 40, 40); fillStroke(ctx, b, c.main); ctx.save(); ctx.clip(b); ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5; for (let x = CX - 40; x < CX + 40; x += 11) { ctx.beginPath(); ctx.moveTo(x, BASE - 90); ctx.lineTo(x, BASE); ctx.stroke(); } for (let y = BASE - 86; y < BASE; y += 11) { ctx.beginPath(); ctx.moveTo(CX - 44, y); ctx.lineTo(CX + 44, y); ctx.stroke(); } ctx.restore(); shine(ctx, CX - 14, BASE - 60, 7, 10); return b; },
  mohawk: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 40, BASE - 4); for (let i = 0; i < 5; i++) { const x = CX - 40 + i * 20; b.lineTo(x + 6, BASE - 70 + Math.abs(i - 2) * 10); b.lineTo(x + 20, BASE - 18); } b.lineTo(CX + 40, BASE - 4); b.closePath(); fillStroke(ctx, b, c.main); return b; },
  flame: (ctx, c) => { fillStroke(ctx, rrect(CX - 16, BASE - 34, 32, 30, 6), c.detail); const b = new Path2D(); b.moveTo(CX - 26, BASE - 34); b.bezierCurveTo(CX - 40, BASE - 70, CX - 6, BASE - 70, CX - 2, BASE - 104); b.bezierCurveTo(CX + 12, BASE - 78, CX + 40, BASE - 66, CX + 26, BASE - 34); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 52, 10, 16), c.accent, 3); return b; },
  gem: (ctx, c) => { const b = poly([[CX - 40, BASE - 60], [CX - 22, BASE - 82], [CX + 22, BASE - 82], [CX + 40, BASE - 60], [CX, BASE - 6]]); fillStroke(ctx, b, c.main); ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(CX - 40, BASE - 60); ctx.lineTo(CX + 40, BASE - 60); ctx.moveTo(CX - 14, BASE - 60); ctx.lineTo(CX, BASE - 6); ctx.lineTo(CX + 14, BASE - 60); ctx.stroke(); shine(ctx, CX - 18, BASE - 68, 5, 4); return b; },
  trophy: (ctx, c) => { fillStroke(ctx, rrect(CX - 26, BASE - 16, 52, 14, 4), c.accent); fillStroke(ctx, rrect(CX - 8, BASE - 34, 16, 20, 3), c.main, 4); const b = new Path2D(); b.moveTo(CX - 34, BASE - 84); b.lineTo(CX + 34, BASE - 84); b.bezierCurveTo(CX + 34, BASE - 40, CX + 10, BASE - 32, CX, BASE - 32); b.bezierCurveTo(CX - 10, BASE - 32, CX - 34, BASE - 40, CX - 34, BASE - 84); fillStroke(ctx, b, c.main); return b; },
  orb: (ctx, c) => { fillStroke(ctx, rrect(CX - 22, BASE - 18, 44, 14, 6), c.accent); const b = ellipse(CX, BASE - 52, 34, 34); fillStroke(ctx, b, c.main); fillStroke(ctx, star(CX, BASE - 92, 9, 0.45, 4), c.detail, 3); shine(ctx, CX - 12, BASE - 64, 7, 10); return b; },
  duck: (ctx, c) => { const b = new Path2D(); b.ellipse(CX + 4, BASE - 24, 40, 20, 0, 0, Math.PI * 2); b.ellipse(CX - 16, BASE - 56, 20, 20, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX - 40, BASE - 54, 12, 6), c.accent, 3); ctx.fillStyle = OL; ctx.beginPath(); ctx.arc(CX - 18, BASE - 62, 3.5, 0, Math.PI * 2); ctx.fill(); return b; },
  bell: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 40, BASE - 10); b.quadraticCurveTo(CX - 36, BASE - 80, CX, BASE - 82); b.quadraticCurveTo(CX + 36, BASE - 80, CX + 40, BASE - 10); b.closePath(); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 8, 10, 8), c.accent, 3); fillStroke(ctx, ellipse(CX, BASE - 86, 7, 6), c.detail, 3); return b; },
  spoon: (ctx, c) => { const b = new Path2D(); for (const x of [-30, 0, 30]) { b.ellipse(CX + x, BASE - 66 + Math.abs(x) * 0.4, 11, 16, 0, 0, Math.PI * 2); b.roundRect(CX + x - 3, BASE - 52 + Math.abs(x) * 0.4, 6, 40, 3); } fillStroke(ctx, b, c.main, 4); fillStroke(ctx, rrect(CX - 46, BASE - 16, 92, 12, 6), c.accent, 4); return b; },
  key: (ctx, c) => { const ring = new Path2D(); ring.ellipse(CX - 22, BASE - 46, 20, 20, 0, 0, Math.PI * 2); ring.ellipse(CX - 22, BASE - 46, 9, 9, 0, 0, Math.PI * 2); ctx.fillStyle = c.main; ctx.fill(ring, 'evenodd'); ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.stroke(ring); const b = poly([[CX - 4, BASE - 50], [CX + 48, BASE - 50], [CX + 48, BASE - 36], [CX + 38, BASE - 36], [CX + 38, BASE - 28], [CX + 28, BASE - 28], [CX + 28, BASE - 40], [CX - 4, BASE - 40]]); fillStroke(ctx, b, c.main, 4); return ring; },
  coins: (ctx, c) => { const b = new Path2D(); for (let i = 0; i < 5; i++) b.ellipse(CX + (i % 2) * 4 - 2, BASE - 12 - i * 11, 30, 9, 0, 0, Math.PI * 2); fillStroke(ctx, b, c.main, 4); return b; },
  medals: (ctx, c) => { const b = new Path2D(); for (const [x, y] of [[-24, -40], [24, -40], [0, -64]] as Array<[number, number]>) b.ellipse(CX + x, BASE + y, 18, 18, 0, 0, Math.PI * 2); fillStroke(ctx, rrect(CX - 46, BASE - 22, 92, 18, 6), c.accent, 4); fillStroke(ctx, b, c.main); for (const [x, y] of [[-24, -40], [24, -40], [0, -64]] as Array<[number, number]>) fillStroke(ctx, star(CX + x, BASE + y, 9), c.detail, 2); return b; },
  feather: (ctx, c) => { fillStroke(ctx, poly([[CX - 58, BASE - 16], [CX - 30, BASE - 46], [CX + 30, BASE - 46], [CX + 58, BASE - 16], [CX, BASE - 4]]), c.accent); const b = new Path2D(); b.moveTo(CX + 18, BASE - 40); b.bezierCurveTo(CX + 70, BASE - 70, CX + 50, BASE - 110, CX + 10, BASE - 98); b.bezierCurveTo(CX + 40, BASE - 80, CX + 20, BASE - 60, CX + 10, BASE - 42); b.closePath(); fillStroke(ctx, b, c.main); return b; },
  fin: (ctx, c) => { fillStroke(ctx, ellipse(CX, BASE - 8, 34, 10), c.accent); const b = new Path2D(); b.moveTo(CX - 26, BASE - 8); b.quadraticCurveTo(CX - 10, BASE - 50, CX + 20, BASE - 96); b.quadraticCurveTo(CX + 10, BASE - 40, CX + 30, BASE - 8); b.closePath(); fillStroke(ctx, b, c.main); return b; },
  tusks: (ctx, c) => { fillStroke(ctx, dome(CX, BASE - 2, 36, 26), c.accent); const b = new Path2D(); for (const sx of [-1, 1]) { b.moveTo(CX + sx * 20, BASE - 14); b.quadraticCurveTo(CX + sx * 70, BASE - 10, CX + sx * 52, BASE - 70); b.quadraticCurveTo(CX + sx * 52, BASE - 26, CX + sx * 10, BASE - 24); b.closePath(); } fillStroke(ctx, b, c.main); return b; },
  moon: (ctx, c) => { const b = new Path2D(); b.arc(CX, BASE - 48, 38, 0, Math.PI * 2); b.arc(CX + 18, BASE - 58, 32, 0, Math.PI * 2, true); fillStroke(ctx, b, c.main); return b; },
  sun: (ctx, c) => { const rays = star(CX, BASE - 46, 52, 0.62, 12); fillStroke(ctx, rays, c.accent, 4); const b = ellipse(CX, BASE - 46, 30, 30); fillStroke(ctx, b, c.main); return b; },
  cone: (ctx, c) => { const b = poly([[CX - 34, BASE - 6], [CX + 6, BASE - 100], [CX + 34, BASE - 6]]); fillStroke(ctx, b, c.main); ctx.strokeStyle = c.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(CX - 22, BASE - 34); ctx.lineTo(CX + 26, BASE - 46); ctx.moveTo(CX - 10, BASE - 62); ctx.lineTo(CX + 18, BASE - 70); ctx.stroke(); return b; },
  bubble: (ctx, c) => { fillStroke(ctx, rrect(CX - 40, BASE - 16, 80, 14, 6), c.detail); ctx.globalAlpha = 0.75; const b = ellipse(CX, BASE - 50, 46, 44); fillStroke(ctx, b, c.main); ctx.globalAlpha = 1; shine(ctx, CX - 20, BASE - 66, 8, 14); return b; },
  veil: (ctx, c) => { const b = new Path2D(); b.moveTo(CX - 56, BASE - 2); b.quadraticCurveTo(CX - 40, BASE - 80, CX, BASE - 70); b.quadraticCurveTo(CX + 40, BASE - 80, CX + 56, BASE - 2); b.quadraticCurveTo(CX, BASE - 26, CX - 56, BASE - 2); ctx.globalAlpha = 0.85; fillStroke(ctx, b, c.main, 4); ctx.globalAlpha = 1; return b; },
  kabuto: (ctx, c) => { const b = dome(CX, BASE - 6, 44, 46); fillStroke(ctx, b, c.main); fillStroke(ctx, poly([[CX - 8, BASE - 50], [CX - 40, BASE - 96], [CX - 20, BASE - 52]]), c.accent, 4); fillStroke(ctx, poly([[CX + 8, BASE - 50], [CX + 40, BASE - 96], [CX + 20, BASE - 52]]), c.accent, 4); fillStroke(ctx, rrect(CX - 58, BASE - 16, 116, 14, 6), c.detail); return b; },
  pith: (ctx, c) => { brim(ctx, c.accent, 110, 20); const b = dome(CX, BASE - 10, 40, 52); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 40, BASE - 22, 80, 10, 4), c.detail, 3); return b; },
  fire: (ctx, c) => { fillStroke(ctx, poly([[CX + 30, BASE - 14], [CX + 66, BASE + 2], [CX + 30, BASE + 2]]), c.main); const b = dome(CX - 4, BASE - 4, 44, 52); fillStroke(ctx, b, c.main); fillStroke(ctx, star(CX - 4, BASE - 34, 14, 0.5, 5), c.accent, 3); return b; },
  diver: (ctx, c) => { const b = ellipse(CX, BASE - 48, 46, 46); fillStroke(ctx, b, c.main); fillStroke(ctx, ellipse(CX, BASE - 48, 26, 24), c.detail, 5); for (const [x, y] of [[-40, -48], [40, -48], [0, -88]] as Array<[number, number]>) fillStroke(ctx, ellipse(CX + x, BASE + y, 7, 7), c.accent, 3); return b; },
  aviator: (ctx, c) => { const b = dome(CX, BASE - 4, 46, 50); fillStroke(ctx, b, c.main); fillStroke(ctx, rrect(CX - 50, BASE - 24, 22, 30, 8), c.main); fillStroke(ctx, rrect(CX + 28, BASE - 24, 22, 30, 8), c.main); fillStroke(ctx, ellipse(CX - 18, BASE - 40, 15, 12), c.detail, 4); fillStroke(ctx, ellipse(CX + 18, BASE - 40, 15, 12), c.detail, 4); return b; },
  keeper: (ctx, c) => { brim(ctx, c.main, 108, 18); const b = dome(CX, BASE - 10, 34, 40); fillStroke(ctx, b, c.main); ctx.globalAlpha = 0.55; fillStroke(ctx, rrect(CX - 50, BASE - 10, 100, 18, 4), c.detail, 3); ctx.globalAlpha = 1; fillStroke(ctx, ellipse(CX + 26, BASE - 46, 9, 6), c.accent, 3); return b; },
};

function shadeStr(hex: string): string {
  const h = hex.replace('#', '');
  const v = parseInt(h, 16);
  const r = Math.max(0, ((v >> 16) & 255) - 40), g = Math.max(0, ((v >> 8) & 255) - 40), b = Math.max(0, (v & 255) - 40);
  return `rgb(${r},${g},${b})`;
}

export function drawHood(art: HoodArt, scale = 1): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W * scale, H * scale);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const paint: Paint = { main: art.colors[0], accent: art.colors[1], detail: art.colors[2] };
  const body = DRAW[art.kind](ctx, paint);
  decorate(ctx, body, art.deco, paint);
  // Re-stroke the body outline over decorations for crisp edges.
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = OL;
  if (art.kind !== 'antlers' && art.kind !== 'snowflake' && art.kind !== 'halo' && art.kind !== 'donut') ctx.stroke(body);
  return canvas;
}

export const HOOD_CANVAS = { width: W, height: H, baseY: BASE } as const;
