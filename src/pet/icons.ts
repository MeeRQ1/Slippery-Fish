/**
 * Illustrated preset cards for the Pet sign: small static canvases (cached as
 * data URLs) showing the actual fish look, tank style, decoration and food.
 */
import type { DecorPreset, FishLook, FoodPreset, TankStyle } from '../config/pet';
import { paintFish } from './habitat';

const cache = new Map<string, string>();
const NAVY = '#1b2a44';

function make(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.scale(2, 2);
  paint(ctx);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function fishLookIcon(look: FishLook): string {
  return make(`fish:${look.id}`, 72, 52, (ctx) => {
    ctx.translate(36, 26);
    ctx.scale(1.15, 1.15);
    paintFish(ctx, look, { x: 4, y: 0, face: 1, tail: 0.6, eat: 0, tier: 1, time: 1, sleepy: false, excited: false, stretch: 1 });
  });
}

export function tankIcon(t: TankStyle): string {
  return make(`tank:${t.id}`, 72, 56, (ctx) => {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = NAVY;
    const g = ctx.createLinearGradient(0, 8, 0, 50);
    g.addColorStop(0, t.waterTop);
    g.addColorStop(1, t.waterBottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (t.shape === 'bowl') { ctx.moveTo(24, 8); ctx.bezierCurveTo(4, 16, 6, 52, 36, 52); ctx.bezierCurveTo(66, 52, 68, 16, 48, 8); ctx.closePath(); }
    else if (t.shape === 'igloo') { ctx.moveTo(8, 52); ctx.lineTo(8, 32); ctx.bezierCurveTo(8, 4, 64, 4, 64, 32); ctx.lineTo(64, 52); ctx.closePath(); }
    else ctx.rect(8, 10, 56, 42);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = t.gravel[1];
    ctx.fillRect(10, 44, 52, 6);
    if (t.shape === 'tank') { ctx.fillStyle = t.frame; ctx.fillRect(6, 6, 60, 5); ctx.strokeRect(6, 6, 60, 5); }
  });
}

export function decorIcon(d: DecorPreset): string {
  return make(`decor:${d.id}`, 56, 48, (ctx) => {
    ctx.lineWidth = 2;
    ctx.strokeStyle = NAVY;
    switch (d.kind) {
      case 'kelp':
        ctx.strokeStyle = '#3fae6a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        for (const x of [18, 28, 38]) { ctx.beginPath(); ctx.moveTo(x, 46); ctx.quadraticCurveTo(x + 6, 28, x - 2, 8 + (x % 10)); ctx.stroke(); }
        break;
      case 'castle':
        ctx.fillStyle = '#eaf4fb';
        ctx.beginPath(); ctx.rect(16, 20, 24, 26); ctx.rect(10, 12, 10, 34); ctx.rect(36, 12, 10, 34); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3d8fd6'; ctx.beginPath(); ctx.arc(28, 46, 6, Math.PI, 0); ctx.fill(); ctx.stroke();
        break;
      case 'sled':
        ctx.fillStyle = '#c84a3a'; ctx.beginPath(); ctx.rect(10, 22, 34, 10); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#6f3f1d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(6, 38); ctx.lineTo(46, 38); ctx.quadraticCurveTo(52, 38, 50, 30); ctx.stroke();
        break;
      case 'snowman':
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(28, 34, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(28, 16, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f39a2c'; ctx.beginPath(); ctx.moveTo(28, 16); ctx.lineTo(37, 18); ctx.lineTo(28, 20); ctx.fill();
        break;
      case 'chest':
        ctx.fillStyle = '#b8742a'; ctx.beginPath(); ctx.rect(12, 22, 32, 20); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d4955a'; ctx.beginPath(); ctx.ellipse(28, 22, 16, 8, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f7c531'; ctx.fillRect(25, 24, 6, 8);
        break;
      case 'arch':
        ctx.strokeStyle = '#9fd0f5'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(28, 44, 18, Math.PI, 0); ctx.stroke();
        ctx.strokeStyle = NAVY; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(28, 44, 22.5, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(28, 44, 13.5, Math.PI, 0); ctx.stroke();
        break;
      case 'shell':
        ctx.fillStyle = '#ffd6e0'; ctx.beginPath(); ctx.moveTo(12, 40); ctx.arc(28, 40, 16, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(28, 32, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
    }
  });
}

export function foodIcon(f: FoodPreset): string {
  return make(`food:${f.id}`, 56, 48, (ctx) => {
    // a little tin with the food spilling out
    ctx.fillStyle = '#e8f4fb'; ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(14, 22, 28, 22); ctx.fill(); ctx.stroke();
    ctx.fillStyle = f.colors[0]!; ctx.fillRect(14, 28, 28, 8);
    for (let i = 0; i < 9; i++) {
      const x = 12 + ((i * 17) % 32), y = 6 + ((i * 11) % 14);
      ctx.fillStyle = f.colors[i % f.colors.length]!;
      ctx.beginPath();
      if (f.shape === 'pellet') ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      else if (f.shape === 'heart') { ctx.moveTo(x, y + 3); ctx.bezierCurveTo(x - 5, y - 1, x - 2, y - 4, x, y - 1.4); ctx.bezierCurveTo(x + 2, y - 4, x + 5, y - 1, x, y + 3); }
      else if (f.shape === 'star') { for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5 - Math.PI / 2, r = k % 2 ? 1.5 : 3.6; if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
      else ctx.ellipse(x, y, 3.4, 1.8, i, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
