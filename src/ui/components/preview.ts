/** Penguin preview with the equipped Hood sitting on top (matches in-game placement). */
import { drawHood, HOOD_CANVAS } from '../../art/hoodArt';
import { HOOD_BY_ID } from '../../progression/hoods';
import { waddleFrame } from '../../profile/waddles';
import { h, sprite } from '../dom';

const hoodUrlCache = new Map<string, string>();

export function hoodImageUrl(hoodId: string, scale = 1): string {
  const key = `${hoodId}@${scale}`;
  let url = hoodUrlCache.get(key);
  if (!url) {
    const def = HOOD_BY_ID[hoodId];
    url = def ? drawHood(def.art, scale).toDataURL('image/png') : '';
    hoodUrlCache.set(key, url);
  }
  return url;
}

/**
 * Penguin + Hood preview framed from BOTH visual bounds so tall/wide Hoods are
 * never clipped: the box reserves headroom for the Hood (using the same
 * anchor as in-game: baseline at 0.72·r above the body centre, width 1.55·r)
 * plus a margin for the wiggle animation's rotation overshoot.
 */
export function penguinPreview(waddleId: string, hoodId: string | null, height: number): HTMLElement {
  const hoodDef = hoodId ? HOOD_BY_ID[hoodId] : undefined;
  const hoodW = height * 0.775;
  const hoodH = hoodW * (HOOD_CANVAS.height / HOOD_CANVAS.width);
  const baselineFromTop = height * 0.14;
  const hoodTop = baselineFromTop - hoodH * (HOOD_CANVAS.baseY / HOOD_CANVAS.height);
  const overshoot = height * 0.08;
  const headroom = hoodDef ? Math.max(0, -hoodTop) + overshoot : 0;
  const boxW = Math.max(height, hoodW) * 1.12;
  const box = h('div', { class: 'peng-preview', style: { width: `${boxW}px`, height: `${height + headroom}px` } });
  const body = sprite(waddleFrame(waddleId), { height });
  body.classList.add('pp-body');
  box.append(body);
  if (hoodDef) {
    const img = h('img', { class: 'pp-hood', attrs: { src: hoodImageUrl(hoodDef.id, 1), alt: '', draggable: 'false' }, style: { width: `${hoodW}px`, top: `${headroom + hoodTop}px` } });
    box.append(img);
  }
  return box;
}
