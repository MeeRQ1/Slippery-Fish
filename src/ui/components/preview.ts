/** Penguin preview with the equipped Hood sitting on top (matches in-game placement). */
import { drawHood } from '../../art/hoodArt';
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

export function penguinPreview(waddleId: string, hoodId: string | null, height: number): HTMLElement {
  const box = h('div', { class: 'peng-preview', style: { width: `${height}px`, height: `${height * 1.18}px` } });
  const body = sprite(waddleFrame(waddleId), { height });
  body.classList.add('pp-body');
  box.append(body);
  if (hoodId && HOOD_BY_ID[hoodId]) {
    const img = h('img', { class: 'pp-hood', attrs: { src: hoodImageUrl(hoodId, 1), alt: '', draggable: 'false' }, style: { width: `${height * 0.78}px` } });
    box.append(img);
  }
  return box;
}
