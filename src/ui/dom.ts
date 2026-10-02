/** Tiny DOM construction helpers (no framework). */
import { frame, pageOf, assetUrl } from '../core/assets';

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  style?: Partial<Record<string, string>>;
  dataset?: Record<string, string>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.html !== undefined) el.innerHTML = props.html;
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) {
        if (v === null || v === undefined || v === false) continue;
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (props.style) for (const [k, v] of Object.entries(props.style)) if (v !== undefined) el.style.setProperty(k.startsWith('--') ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), v);
    if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
    if (props.on) for (const [k, fn] of Object.entries(props.on)) if (fn) el.addEventListener(k, fn as EventListener);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * An atlas frame rendered as a CSS sprite (no duplicate image files). Aspect
 * ratio is always preserved: pass width OR height (or neither for native).
 */
export function sprite(id: string, opts: { width?: number; height?: number; class?: string; alt?: string } = {}): HTMLSpanElement {
  const f = frame(id);
  const scale = opts.width ? opts.width / f.w : opts.height ? opts.height / f.h : 1;
  const w = f.w * scale, hgt = f.h * scale;
  const el = h('span', { class: `sprite ${opts.class ?? ''}`.trim(), attrs: { role: opts.alt ? 'img' : null, 'aria-label': opts.alt ?? null, 'aria-hidden': opts.alt ? null : 'true' } });
  el.style.width = `${w}px`;
  el.style.height = `${hgt}px`;
  const page = pageOf(id);
  if (page) {
    el.style.backgroundImage = `url("${page.image}")`;
    el.style.backgroundSize = `${page.size[0] * scale}px ${page.size[1] * scale}px`;
    el.style.backgroundPosition = `${-f.x * scale}px ${-f.y * scale}px`;
  } else if (f.page.startsWith('file:')) {
    el.style.backgroundImage = `url("${assetUrl(f.page.slice(5))}")`;
    el.style.backgroundSize = '100% 100%';
  }
  return el;
}

/** Same as sprite() but sized by CSS (em-based) — scales with the container. */
export function spriteFluid(id: string, cls = ''): HTMLSpanElement {
  const f = frame(id);
  const el = h('span', { class: `sprite sprite-fluid ${cls}`.trim(), attrs: { 'aria-hidden': 'true' } });
  const page = pageOf(id);
  el.style.aspectRatio = `${f.w} / ${f.h}`;
  if (page) {
    el.style.backgroundImage = `url("${page.image}")`;
    el.style.backgroundSize = `${(page.size[0] / f.w) * 100}% ${(page.size[1] / f.h) * 100}%`;
    const px = page.size[0] - f.w === 0 ? 0 : (f.x / (page.size[0] - f.w)) * 100;
    const py = page.size[1] - f.h === 0 ? 0 : (f.y / (page.size[1] - f.h)) * 100;
    el.style.backgroundPosition = `${px}% ${py}%`;
  }
  return el;
}

export function canvasImg(canvas: HTMLCanvasElement, cls = '', alt = ''): HTMLImageElement {
  return h('img', { class: cls, attrs: { src: canvas.toDataURL('image/png'), alt, draggable: 'false' } });
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
