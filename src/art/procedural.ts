/**
 * Procedural art drawn with Canvas 2D in the Slippery Fish style (chunky
 * shapes, thick navy outlines, soft snow shading). Used where the supplied
 * reference sheets have no suitable art, and for things that must adapt to
 * level geometry (snow banks, surface patches).
 *
 * Each generator that substitutes for MISSING supplied art is marked
 * "PLACEHOLDER" and listed in docs/ASSETS.md.
 */
import type { LevelDef } from '../levels/types';
import type { RegionPalette } from '../config/regions';
import type { SurfaceType } from '../config/gameplay';
import { artRng, hexToRgb, makeCanvas, roundRectPath, roundedPolyPath, shade } from './canvas';

const OUTLINE = '#1b2a44';

// ------------------------------------------------------------------ snow banks

export const BANK_MARGIN = 150;
const BANK_WIDTH = 64;

/**
 * Draws the arena's thick snowy banks. The inner edge sits exactly on the
 * collision boundary (visual edge = physical edge: no invisible walls).
 */
export function drawSnowbanks(level: LevelDef, pal: RegionPalette, seed: number): HTMLCanvasElement {
  const { width: w, height: h } = level.arena;
  const m = BANK_MARGIN;
  const { canvas, ctx } = makeCanvas(w + m * 2, h + m * 2);
  const rnd = artRng(seed);
  const x0 = m - BANK_WIDTH, y0 = m - BANK_WIDTH, x1 = m + w + BANK_WIDTH, y1 = m + h + BANK_WIDTH;

  // Outer scalloped edge: circles along the expanded rectangle.
  const bumps: Array<[number, number, number]> = [];
  const along = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(len / 34));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      bumps.push([ax + (bx - ax) * t, ay + (by - ay) * t, 20 + rnd() * 12]);
    }
  };
  along(x0, y0, x1, y0); along(x1, y0, x1, y1); along(x1, y1, x0, y1); along(x0, y1, x0, y0);

  const drawOuter = (extra: number) => {
    roundRectPath(ctx, x0 - extra, y0 - extra, x1 - x0 + extra * 2, y1 - y0 + extra * 2, 40);
    ctx.fill();
    for (const [bx, by, br] of bumps) {
      ctx.beginPath();
      ctx.arc(bx, by, br + extra, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  // soft drop shadow onto the outside world
  ctx.fillStyle = 'rgba(20,40,70,0.18)';
  ctx.save();
  ctx.translate(0, 8);
  drawOuter(2);
  ctx.restore();
  ctx.fillStyle = pal.bankOutline;
  drawOuter(4);
  // body gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, pal.bank);
  grad.addColorStop(1, shade(pal.bank, -0.04));
  ctx.fillStyle = grad;
  drawOuter(0);

  // Cut the playable interior.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(m, m, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // Inner rim: shaded lip just outside the playable edge + navy outline on the edge.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.rect(m, m, w, h);
  ctx.clip('evenodd');
  ctx.strokeStyle = pal.bankShade;
  ctx.lineWidth = 30;
  ctx.strokeRect(m, m, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 6;
  ctx.strokeRect(m - 20, m - 20, w + 40, h + 40);
  ctx.restore();
  ctx.strokeStyle = pal.bankOutline;
  ctx.lineWidth = 5;
  ctx.strokeRect(m, m, w, h);

  // Interior wall blocks (carved arena shapes): drawn as their exact collider
  // footprint (polygon + the collider's 10u rounding). Shapes are unions of
  // convex pieces, so draw in passes — outline, shade, body — for every piece
  // before the next pass: internal seams between pieces vanish and only the
  // union's true boundary keeps its outline and shaded lip. Clipped to the
  // playable rectangle so pieces tucked under the outer bank leave no marks.
  if (level.arena.walls.length) {
    const polys = level.arena.walls.map((block) => block.points.map(([px, py]) => [px + m, py + m] as [number, number]));
    ctx.save();
    ctx.beginPath();
    ctx.rect(m - 2, m - 2, w + 4, h + 4);
    ctx.clip();
    ctx.lineJoin = 'round';
    const pass = (fill: string, lineWidth: number) => {
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      ctx.lineWidth = lineWidth;
      for (const pts of polys) {
        roundedPolyPath(ctx, pts, 6);
        ctx.fill();
        ctx.stroke();
      }
    };
    // Drop shadow cast onto the ice (3/4 view: banks stand up, light from above).
    // Drawn opaque off-screen then composited once, so overlapping pieces never darken seams.
    const solid = (target: CanvasRenderingContext2D, fill: string, lineWidth: number, dy = 0) => {
      target.fillStyle = fill;
      target.strokeStyle = fill;
      target.lineWidth = lineWidth;
      target.lineJoin = 'round';
      for (const pts of polys) {
        roundedPolyPath(target, pts.map(([x, y]) => [x, y + dy] as [number, number]), 6);
        target.fill();
        target.stroke();
      }
    };
    const shadow = makeCanvas(canvas.width, canvas.height);
    solid(shadow.ctx, '#000', 30, 12);
    ctx.globalAlpha = 0.14;
    ctx.drawImage(shadow.canvas, 0, 0);
    ctx.globalAlpha = 1;
    pass(pal.bankOutline, 30);
    pass(pal.bankShade, 20);
    // Snow body with volume: the footprint in a cooler flank tone, then the lit
    // top surface (footprint shifted up 14u) laid over it — the band left along
    // the lower edge reads as the bank's front face. Speckles and drift ridges on top.
    const body = makeCanvas(canvas.width, canvas.height);
    const b = body.ctx;
    solid(b, shade(pal.bank, -0.08), 8);
    const top = makeCanvas(canvas.width, canvas.height);
    solid(top.ctx, pal.bank, 8, -14);
    top.ctx.globalCompositeOperation = 'source-atop';
    const tg = top.ctx.createLinearGradient(0, m, 0, m + h);
    tg.addColorStop(0, 'rgba(255,255,255,0.55)');
    tg.addColorStop(1, 'rgba(255,255,255,0)');
    top.ctx.fillStyle = tg;
    top.ctx.fillRect(0, 0, canvas.width, canvas.height);
    b.globalCompositeOperation = 'source-atop';
    b.drawImage(top.canvas, 0, 0);
    for (const pts of polys) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of pts) { minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); }
      const area = (maxX - minX) * (maxY - minY);
      for (let i = 0; i < Math.min(40, area / 1800); i++) {
        b.fillStyle = rnd() < 0.6 ? 'rgba(255,255,255,0.95)' : 'rgba(150,190,230,0.45)';
        b.beginPath();
        b.arc(minX + rnd() * (maxX - minX), minY + rnd() * (maxY - minY), 1.2 + rnd() * 2.2, 0, Math.PI * 2);
        b.fill();
      }
      b.strokeStyle = 'rgba(255,255,255,0.85)';
      b.lineWidth = 3;
      b.lineCap = 'round';
      for (let i = 0; i < Math.min(3, area / 9000); i++) {
        const x = minX + rnd() * (maxX - minX), y = minY + rnd() * (maxY - minY), l = 14 + rnd() * 18;
        b.beginPath();
        b.moveTo(x - l, y);
        b.quadraticCurveTo(x, y - 6, x + l, y);
        b.stroke();
      }
    }
    ctx.drawImage(body.canvas, 0, 0);
    ctx.restore();
  }

  // Sparkles on the snow.
  for (let i = 0; i < (w + h) / 18; i++) {
    const side = rnd();
    let sx: number, sy: number;
    if (side < 0.25) { sx = m + rnd() * w; sy = m - 14 - rnd() * 40; }
    else if (side < 0.5) { sx = m + rnd() * w; sy = m + h + 14 + rnd() * 40; }
    else if (side < 0.75) { sx = m - 14 - rnd() * 40; sy = m + rnd() * h; }
    else { sx = m + w + 14 + rnd() * 40; sy = m + rnd() * h; }
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.95)' : 'rgba(160,200,235,0.7)';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5 + rnd() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

// ------------------------------------------------------------------ floor textures

/** Seamless procedural floors for regions without a Batch 7 top-down tile. */
export function drawProceduralFloor(kind: string, size = 256): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const rnd = artRng(kind.length * 7919 + kind.charCodeAt(0));
  const palettes: Record<string, { base: string; blobs: string[]; dots: string[] }> = {
    proc_meadow: { base: '#bddc96', blobs: ['#b1d488', '#c8e3a4', '#a9cc7e'], dots: ['#f5f0a6', '#ffffff', '#8fbf62'] },
    proc_fallgrass: { base: '#d9ad6e', blobs: ['#cf9d5c', '#e2bb80', '#c88f4c'], dots: ['#b85f22', '#e48a32', '#f2c069'] },
    proc_icecream: { base: '#fbe3ea', blobs: ['#f7d2de', '#fdf0d8', '#d8f3e6'], dots: ['#ef6f9c', '#7fd0f0', '#f6c945', '#8fd18a'] },
    proc_candy: { base: '#f6d1e4', blobs: ['#f2c0db', '#fbe2ef', '#eab1d0'], dots: ['#ffffff', '#d65cb0', '#7fd4ff'] },
  };
  const p = palettes[kind] ?? palettes.proc_meadow!;
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, size, size);
  // Wrap-around drawing makes the tile seamless.
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
  };
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size, y = rnd() * size, r = 18 + rnd() * 42;
    const c = p.blobs[Math.floor(rnd() * p.blobs.length)]!;
    wrap((ox, oy) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, r, r * (0.6 + rnd() * 0.3), rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  const dotCount = kind === 'proc_icecream' || kind === 'proc_candy' ? 70 : 50;
  for (let i = 0; i < dotCount; i++) {
    const x = rnd() * size, y = rnd() * size;
    const c = p.dots[Math.floor(rnd() * p.dots.length)]!;
    const sprinkle = kind === 'proc_icecream' || kind === 'proc_candy';
    const a = rnd() * Math.PI;
    wrap((ox, oy) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.75;
      if (sprinkle) {
        ctx.save();
        ctx.translate(x + ox, y + oy);
        ctx.rotate(a);
        roundRectPath(ctx, -5, -1.6, 10, 3.2, 1.6);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, 1.4 + rnd() * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  ctx.globalAlpha = 1;
  return canvas;
}

// ------------------------------------------------------------------ small textures

export function drawShadow(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(128, 64);
  const g = ctx.createRadialGradient(64, 32, 4, 64, 32, 62);
  g.addColorStop(0, 'rgba(20,40,80,0.38)');
  g.addColorStop(0.6, 'rgba(20,40,80,0.16)');
  g.addColorStop(1, 'rgba(20,40,80,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.scale(1, 0.5);
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.restore();
  ctx.fillRect(0, 0, 128, 64);
  return canvas;
}

export function drawParticle(kind: 'snow' | 'dot' | 'sparkle' | 'puff' | 'leaf' | 'petal' | 'sprinkle' | 'ring'): HTMLCanvasElement {
  const S = kind === 'puff' ? 64 : 32;
  const { canvas, ctx } = makeCanvas(S, S);
  const c = S / 2;
  switch (kind) {
    case 'snow': {
      const g = ctx.createRadialGradient(c, c, 1, c, c, c);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      break;
    }
    case 'dot':
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c, c - 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ring':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c, c, c - 3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'sparkle':
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? c - 1 : c * 0.28;
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'puff': {
      ctx.fillStyle = '#ffffff';
      const blobs: Array<[number, number, number]> = [[c, c, 18], [c - 14, c + 4, 13], [c + 15, c + 3, 14], [c - 4, c - 11, 13], [c + 8, c - 9, 11]];
      ctx.strokeStyle = 'rgba(120,150,190,0.9)';
      ctx.lineWidth = 3;
      for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
      for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'leaf':
      ctx.fillStyle = '#e07a2d';
      ctx.strokeStyle = '#7a3a12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(c, c, 12, 6, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'petal':
      ctx.fillStyle = '#ffc2d8';
      ctx.beginPath();
      ctx.ellipse(c, c, 9, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'sprinkle':
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, c - 9, c - 3, 18, 6, 3);
      ctx.fill();
      break;
  }
  return canvas;
}

// ------------------------------------------------------------------ surfaces

export function drawSurfacePatch(type: SurfaceType, rx: number, ry: number, seed: number): HTMLCanvasElement {
  const pad = 8;
  const { canvas, ctx } = makeCanvas(rx * 2 + pad * 2, ry * 2 + pad * 2);
  const cx = rx + pad, cy = ry + pad;
  const rnd = artRng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  switch (type) {
    case 'polishedIce': {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, 'rgba(190,232,255,0.85)');
      g.addColorStop(1, 'rgba(130,196,240,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 6;
      for (let i = 0; i < 4; i++) {
        const y = cy - ry * 0.6 + i * ry * 0.35;
        ctx.beginPath();
        ctx.moveTo(cx - rx * 0.5 + i * 12, y);
        ctx.lineTo(cx - rx * 0.1 + i * 12, y - ry * 0.25);
        ctx.stroke();
      }
      break;
    }
    case 'deepSnow':
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(200,220,240,${0.25 + rnd() * 0.3})`;
        ctx.beginPath();
        ctx.arc(rnd() * canvas.width, rnd() * canvas.height, 6 + rnd() * 14, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'crackedIce':
      ctx.fillStyle = 'rgba(170,215,245,0.8)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 7; i++) {
        let x = cx + (rnd() - 0.5) * rx * 0.4, y = cy + (rnd() - 0.5) * ry * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const a = rnd() * Math.PI * 2;
        for (let k = 0; k < 5; k++) {
          x += Math.cos(a + (rnd() - 0.5)) * rx * 0.22;
          y += Math.sin(a + (rnd() - 0.5)) * ry * 0.22;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    case 'syrup': {
      const g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 4, cx, cy, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(255,170,200,0.95)');
      g.addColorStop(1, 'rgba(214,80,130,0.9)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(cx - rx * 0.35, cy - ry * 0.35, rx * 0.25, ry * 0.12, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'normal':
      break;
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = type === 'syrup' ? 'rgba(120,30,70,0.6)' : 'rgba(40,90,140,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 1, ry - 1, 0, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

// ------------------------------------------------------------------ polar bear (PLACEHOLDER)

/**
 * PLACEHOLDER — no Polar Bear art was supplied (the character sheet only has
 * the Arctic Wolf and Seal). Drawn procedurally to match their round, grumpy,
 * front-facing style. Replace by adding a polar bear to the character sheet
 * spec and pointing ENEMIES.polarBear.sprite at it.
 */
export function drawPolarBear(): HTMLCanvasElement {
  const W = 240, H = 224;
  const { canvas, ctx } = makeCanvas(W, H);
  const cx = W / 2, cy = 122;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const ol = (lw = 7) => { ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); };
  // ears
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + sx * 62, cy - 72, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#f4f6fa';
    ctx.fill();
    ol();
    ctx.beginPath();
    ctx.arc(cx + sx * 62, cy - 70, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#c9d6e6';
    ctx.fill();
  }
  // body
  ctx.beginPath();
  ctx.ellipse(cx, cy, 98, 92, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx - 30, cy - 40, 10, cx, cy, 110);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#d9e3ef');
  ctx.fillStyle = g;
  ctx.fill();
  ol(8);
  // belly fluff
  ctx.beginPath();
  ctx.ellipse(cx, cy + 30, 62, 50, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  // fur tufts on top
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy - 88);
  ctx.quadraticCurveTo(cx - 8, cy - 104, cx, cy - 90);
  ctx.quadraticCurveTo(cx + 10, cy - 106, cx + 18, cy - 88);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ol(5);
  // muzzle
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 40, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f7f3ea';
  ctx.fill();
  ol(5);
  // nose
  ctx.beginPath();
  ctx.ellipse(cx, cy - 6, 15, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1b2235';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - 4, cy - 9, 5, 3, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  // grumpy mouth
  ctx.beginPath();
  ctx.moveTo(cx, cy + 4);
  ctx.lineTo(cx, cy + 14);
  ctx.moveTo(cx - 14, cy + 22);
  ctx.quadraticCurveTo(cx, cy + 12, cx + 14, cy + 22);
  ol(5);
  // eyes + angry brows
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * 36, cy - 30, 8, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1b2235';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + sx * 34, cy - 34, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + sx * 54, cy - 50);
    ctx.lineTo(cx + sx * 22, cy - 40);
    ol(7);
  }
  // cheeks
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * 64, cy + 2, 12, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,150,170,0.45)';
    ctx.fill();
  }
  // paws
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * 50, cy + 88, 28, 18, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f4f6fa';
    ctx.fill();
    ol(6);
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 50 + k * 9, cy + 82);
      ctx.lineTo(cx + sx * 50 + k * 9, cy + 92);
      ol(3);
    }
  }
  return canvas;
}

// ------------------------------------------------------------------ excellence stars

/**
 * Excellence Stars that look cut out of construction paper by a
 * kindergartener with safety scissors: wobbly points, uneven proportions,
 * jagged edges, flat matte paper with speckles and a glue-stick shadow.
 */
export function drawPaperStar(seed: number, size: number, earned: boolean): HTMLCanvasElement {
  const pad = Math.ceil(size * 0.12);
  const S = size + pad * 2;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = artRng(seed * 2654435761);
  const c = S / 2;
  const R = size / 2;
  const tilt = (rnd() - 0.5) * 0.35;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const outer = i % 2 === 0;
    const a = tilt - Math.PI / 2 + (i / 10) * Math.PI * 2 + (rnd() - 0.5) * 0.18;
    const r = outer ? R * (0.82 + rnd() * 0.2) : R * (0.36 + rnd() * 0.12);
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
  }
  // Scissor-cut edges: subdivide each edge with small perpendicular nicks.
  const cut: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const segs = 3 + Math.floor(rnd() * 3);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < segs; k++) {
      const t = k / segs;
      const n = (rnd() - 0.5) * size * 0.035;
      cut.push([a[0] + dx * t + (-dy / l) * n, a[1] + dy * t + (dx / l) * n]);
    }
  }
  const path = () => {
    ctx.beginPath();
    cut.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  };
  // glue shadow
  ctx.save();
  ctx.translate(size * 0.03, size * 0.05);
  path();
  ctx.fillStyle = earned ? 'rgba(90,50,0,0.28)' : 'rgba(40,50,70,0.18)';
  ctx.fill();
  ctx.restore();
  path();
  const base = earned ? (rnd() < 0.5 ? '#f7c531' : '#f6b928') : '#d3dae3';
  ctx.fillStyle = base;
  ctx.fill();
  // paper speckles + fibres
  ctx.save();
  path();
  ctx.clip();
  for (let i = 0; i < size * 1.4; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(120,70,0,0.12)';
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  ctx.strokeStyle = earned ? 'rgba(170,110,0,0.18)' : 'rgba(80,90,110,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const y = rnd() * S;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(S * 0.3, y + (rnd() - 0.5) * 10, S * 0.6, y + (rnd() - 0.5) * 10, S, y + (rnd() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.restore();
  // slightly darker cut edge
  path();
  ctx.strokeStyle = earned ? 'rgba(160,95,0,0.55)' : 'rgba(110,120,140,0.5)';
  ctx.lineWidth = Math.max(1.2, size * 0.018);
  ctx.stroke();
  return canvas;
}

// ------------------------------------------------------------------ trophy (PLACEHOLDER)

/** PLACEHOLDER — no trophy art was supplied; drawn to match the cartoon style. */
export function drawTrophy(size = 220): HTMLCanvasElement {
  const W = size, H = size * 1.15;
  const { canvas, ctx } = makeCanvas(W, H);
  const s = size / 220;
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const ol = (w = 7) => { ctx.strokeStyle = OUTLINE; ctx.lineWidth = w; ctx.stroke(); };
  // handles
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(110 + sx * 70, 70, 26, 32, 0, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 22;
    ctx.stroke();
    ctx.strokeStyle = '#f2b51c';
    ctx.lineWidth = 12;
    ctx.stroke();
  }
  // bowl
  ctx.beginPath();
  ctx.moveTo(48, 22);
  ctx.lineTo(172, 22);
  ctx.bezierCurveTo(172, 110, 140, 140, 110, 142);
  ctx.bezierCurveTo(80, 140, 48, 110, 48, 22);
  ctx.closePath();
  const g = ctx.createLinearGradient(48, 0, 172, 0);
  g.addColorStop(0, '#ffd65a');
  g.addColorStop(0.45, '#ffe89a');
  g.addColorStop(1, '#e8a512');
  ctx.fillStyle = g;
  ctx.fill();
  ol(8);
  // rim
  ctx.beginPath();
  ctx.ellipse(110, 22, 64, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffe07a';
  ctx.fill();
  ol(6);
  // star emblem
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 24 : 10;
    ctx.lineTo(110 + Math.cos(a) * r, 74 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ol(4);
  // shine
  ctx.beginPath();
  ctx.ellipse(76, 66, 7, 26, 0.15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  // stem + base
  ctx.beginPath();
  ctx.rect(98, 140, 24, 30);
  ctx.fillStyle = '#f2b51c';
  ctx.fill();
  ol(6);
  roundRectPath(ctx, 62, 168, 96, 22, 8);
  ctx.fillStyle = '#ffd04a';
  ctx.fill();
  ol(6);
  roundRectPath(ctx, 48, 190, 124, 50, 10);
  ctx.fillStyle = '#7a4a24';
  ctx.fill();
  ol(7);
  roundRectPath(ctx, 74, 202, 72, 24, 5);
  ctx.fillStyle = '#ffe07a';
  ctx.fill();
  ol(3);
  return canvas;
}

/** Parses a CSS hex colour into a Phaser-style 0xRRGGBB integer. */
export function hexToInt(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r << 16) | (g << 8) | b;
}

/**
 * Glossy diagonal sheen laid over the floor on "Glazed Ice" levels, so the
 * rule change is visible on the ice itself. Half resolution (display at 2×).
 */
export function drawGlaze(w: number, h: number, seed: number): HTMLCanvasElement {
  const cw = Math.ceil(w / 2), ch = Math.ceil(h / 2);
  const { canvas, ctx } = makeCanvas(cw, ch);
  const rnd = artRng(seed);
  ctx.lineCap = 'round';
  const n = Math.round((cw + ch) / 70);
  for (let i = 0; i < n; i++) {
    const x = rnd() * (cw + ch) - ch, y = 0;
    const width = 6 + rnd() * 18;
    const g = ctx.createLinearGradient(x, y, x + ch * 0.55, y + ch);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.35 + rnd() * 0.3})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + ch * 0.55, y + ch);
    ctx.stroke();
  }
  // tiny glints
  for (let i = 0; i < (cw * ch) / 2600; i++) {
    const x = rnd() * cw, y = rnd() * ch, l = 2 + rnd() * 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - l, y); ctx.lineTo(x + l, y);
    ctx.moveTo(x, y - l); ctx.lineTo(x, y + l);
    ctx.stroke();
  }
  return canvas;
}
