/**
 * Goal art (procedural, drawn in the established style: chunky shapes, thick
 * navy/brown outlines, soft snow). The igloo itself is the supplied Batch 8A
 * `igloo_8a` sprite; these generators add what the sheets do not contain and
 * what must follow per-level geometry:
 *  - snow-capped fence posts (matching the supplied `snowy_fence_8b` palette),
 *  - the packed-snow courtyard with its scoring interior,
 *  - penguin chicks (idle / cheer / worried expressions).
 * Everything is 3/4-view consistent with the Batch 4 obstacles: posts stand
 * upright regardless of where they sit on the ring.
 */
import { makeCanvas, roundRectPath } from './canvas';

const WOOD = '#9a5b2e';
const WOOD_HI = '#c27a42';
const WOOD_DK = '#5e3416';
const OUTLINE_WOOD = '#3a210e';
const SNOW = '#ffffff';
const SNOW_SHADE = '#cfe6f7';
const NAVY = '#1b2a44';

/** Fence post, 2× resolution; origin should be (0.5, 0.94) so the base sits on the ring. */
export function drawFencePost(tall = false): HTMLCanvasElement {
  const S = 2;
  const w = 16, h = tall ? 46 : 34;
  const { canvas, ctx } = makeCanvas((w + 8) * S, (h + 10) * S);
  ctx.scale(S, S);
  const x = 4, y = 7;
  // post body
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = OUTLINE_WOOD;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, WOOD_HI);
  g.addColorStop(0.6, WOOD);
  g.addColorStop(1, WOOD_DK);
  ctx.fillStyle = g;
  roundRectPath(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  // grain
  ctx.strokeStyle = 'rgba(58,33,14,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.35, y + 8); ctx.lineTo(x + w * 0.35, y + h - 6);
  ctx.moveTo(x + w * 0.68, y + 14); ctx.lineTo(x + w * 0.68, y + h - 10);
  ctx.stroke();
  // snow cap
  ctx.fillStyle = SNOW;
  ctx.strokeStyle = SNOW_SHADE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + 1, w / 2 + 3, 6.5, 0, Math.PI, 0);
  ctx.quadraticCurveTo(x + w + 2, y + 6, x + w * 0.7, y + 5);
  ctx.quadraticCurveTo(x + w * 0.45, y + 8, x + w * 0.2, y + 5);
  ctx.quadraticCurveTo(x - 3, y + 6, x - 3, y + 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (tall) {
    // Gate post pennant: a little blue flag so openings read at a glance.
    ctx.fillStyle = '#3d8fd6';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y - 6);
    ctx.lineTo(x + w / 2 + 14, y - 2);
    ctx.lineTo(x + w / 2, y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  return canvas;
}

/**
 * Courtyard floor: packed snow disk (ring area) + the scoring interior,
 * outlined with a soft dashed ice ring so "inside" is readable.
 */
export function drawCourtyard(ringR: number, interiorR: number): HTMLCanvasElement {
  const S = 2;
  const R = ringR + 14;
  const { canvas, ctx } = makeCanvas(R * 2 * S, R * 2 * S);
  ctx.scale(S, S);
  const c = R;
  // packed snow apron
  const g = ctx.createRadialGradient(c, c - 10, 10, c, c, R);
  g.addColorStop(0, '#f6fbff');
  g.addColorStop(0.75, '#e4f1fb');
  g.addColorStop(1, 'rgba(214,234,248,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();
  // interior "nest" — slightly bluer, with a soft rim
  const gi = ctx.createRadialGradient(c, c - interiorR * 0.3, interiorR * 0.2, c, c, interiorR);
  gi.addColorStop(0, 'rgba(207,236,255,0.95)');
  gi.addColorStop(1, 'rgba(160,212,246,0.75)');
  ctx.fillStyle = gi;
  ctx.beginPath();
  ctx.arc(c, c, interiorR, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([7, 6]);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(61,143,214,0.75)';
  ctx.beginPath();
  ctx.arc(c, c, interiorR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // a few sparkle ticks on the ice
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  for (const [dx, dy, l] of [[-22, -14, 7], [18, 10, 6], [4, -26, 5], [-10, 22, 6]] as const) {
    ctx.beginPath();
    ctx.moveTo(c + dx - l, c + dy);
    ctx.lineTo(c + dx + l, c + dy);
    ctx.moveTo(c + dx, c + dy - l);
    ctx.lineTo(c + dx, c + dy + l);
    ctx.stroke();
  }
  return canvas;
}

export type ChickMood = 'idle' | 'cheer' | 'worried';

/** A penguin chick, 2× resolution, ~30u tall. Origin (0.5, 0.95). */
export function drawChick(mood: ChickMood, tint = 0): HTMLCanvasElement {
  const S = 2;
  const w = 30, h = 34;
  const { canvas, ctx } = makeCanvas(w * S, h * S);
  ctx.scale(S, S);
  const cx = w / 2, cy = h * 0.56;
  const fluff = ['#9aa7b8', '#a9a2b6', '#8fa4b0'][tint % 3]!;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = NAVY;
  // feet
  ctx.fillStyle = '#f39a2c';
  for (const fx of [-5, 5]) {
    ctx.beginPath();
    ctx.ellipse(cx + fx, h - 3, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // fluffy body (scalloped)
  ctx.fillStyle = fluff;
  ctx.beginPath();
  const r = 11.5;
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = r + (i % 2 === 0 ? 1.4 : 0);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 1.05;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // white face
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1, 7.5, 6.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // flippers (raised when cheering)
  ctx.fillStyle = fluff;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (mood === 'cheer') ctx.ellipse(cx + side * 12, cy - 6, 2.8, 6, side * 0.9, 0, Math.PI * 2);
    else ctx.ellipse(cx + side * 11.5, cy + 3, 2.6, 5.5, side * -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // eyes
  ctx.fillStyle = NAVY;
  if (mood === 'cheer') {
    ctx.lineWidth = 1.8;
    for (const ex of [-3, 3]) {
      ctx.beginPath();
      ctx.arc(cx + ex, cy - 1.5, 1.8, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  } else {
    for (const ex of [-3, 3]) {
      ctx.beginPath();
      ctx.arc(cx + ex, cy - 2, mood === 'worried' ? 1.9 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    for (const ex of [-3, 3]) {
      ctx.beginPath();
      ctx.arc(cx + ex + 0.5, cy - 2.6, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // beak (open when cheering)
  ctx.fillStyle = '#f39a2c';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (mood === 'cheer') {
    ctx.moveTo(cx - 2.6, cy + 1.6); ctx.lineTo(cx + 2.6, cy + 1.6); ctx.lineTo(cx, cy + 5.4);
  } else {
    ctx.moveTo(cx - 2.2, cy + 1.4); ctx.lineTo(cx + 2.2, cy + 1.4); ctx.lineTo(cx, cy + 3.6);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // cheeks
  ctx.fillStyle = 'rgba(255,140,160,0.55)';
  for (const ex of [-5.4, 5.4]) {
    ctx.beginPath();
    ctx.ellipse(cx + ex, cy + 1.2, 1.7, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // tuft
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r - 0.5);
  ctx.quadraticCurveTo(cx + 3, cy - r - 5, cx + 1, cy - r - 7);
  ctx.stroke();
  if (mood === 'worried') {
    ctx.fillStyle = '#7fd0ff';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx + 10, cy - 9, 1.6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  return canvas;
}

/** Little heart used in the chicks' happy reaction. */
export function drawHeart(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(28, 26);
  ctx.translate(14, 13);
  ctx.fillStyle = '#ff5c7a';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, 9);
  ctx.bezierCurveTo(-13, 0, -9, -11, 0, -4);
  ctx.bezierCurveTo(9, -11, 13, 0, 0, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return canvas;
}

/** Colours shared with the Phaser rail drawing. */
export const FENCE_COLORS = { wood: 0x9a5b2e, woodHi: 0xc27a42, outline: 0x3a210e, snow: 0xffffff, snowShade: 0xcfe6f7, ice: 0xdff1fd, iceLine: 0x8fc4ea } as const;
