/**
 * Physical buttons. Hover EXPANDS (never just a colour change), press
 * squashes/crumples/spins depending on the object's personality, release
 * rebounds with overshoot, and each object has its contextual sound.
 * Touch devices get the same press feedback on touch-down/up; keyboard focus
 * mirrors hover. Activation is guarded against double input.
 */
import { BUTTON_PERSONALITIES, TRANSITIONS, type ButtonPersonality } from '../../config/ui';
import type { SfxId } from '../../config/audio';
import { SPRING, SpringTransform } from '../anim';
import { h, sprite, spriteFluid } from '../dom';
import { uiHooks } from '../uiHooks';

export interface ButtonOptions {
  personality?: string | ButtonPersonality;
  sound?: SfxId | null;
  label?: string;
  disabled?: boolean;
  /** Called after the press animation; return a promise to keep the guard engaged. */
  onActivate: () => void | Promise<void>;
  /** Extra explanation shown when a disabled button is pressed. */
  disabledReason?: string;
  class?: string;
}

const lastActivation = new WeakMap<HTMLElement, number>();

export function makePhysical(el: HTMLElement, target: HTMLElement, opts: ButtonOptions): SpringTransform {
  const p: ButtonPersonality = typeof opts.personality === 'object' ? opts.personality : BUTTON_PERSONALITIES[opts.personality ?? 'default'] ?? BUTTON_PERSONALITIES.default!;
  const st = new SpringTransform(target, SPRING[p.spring]);
  let hovered = false;
  let pressed = false;
  let tiltSign = Math.random() < 0.5 ? -1 : 1;

  const rest = () => st.set({ s: 1, sx: 1, sy: 1, rot: 0, y: 0, x: 0 });
  const hover = () => {
    tiltSign = -tiltSign;
    st.set({ s: p.hoverScale, rot: p.hoverTilt * tiltSign, y: p.hoverLift });
  };

  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovered = true;
    el.classList.add('is-hover');
    hover();
    uiHooks.sound('hover', true);
  });
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovered = false;
    pressed = false;
    el.classList.remove('is-hover');
    rest();
  });
  el.addEventListener('focus', () => { if (!hovered) hover(); });
  el.addEventListener('blur', () => { if (!hovered) rest(); });
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pressed = true;
    switch (p.press) {
      case 'crumple': st.set({ sx: 0.82, sy: 0.9, rot: -7 * tiltSign }); break;
      case 'spin': st.set({ s: 0.92, rot: 45 }); break;
      case 'flutter': st.set({ sx: 1.04, sy: 0.9, rot: 6 * tiltSign }); break;
      case 'shake': st.set({ s: 0.94 }); st.kick({ rot: 900 * tiltSign }); break;
      case 'hop': st.set({ sx: 1.1, sy: 0.85, y: 4 }); break;
      case 'wobble': st.set({ sx: 1.08, sy: 0.88 }); st.kick({ rot: 600 }); break;
      case 'snap': st.set({ sx: 1.12, sy: 0.86, x: 3 * tiltSign }); break;
      case 'punch': st.set({ s: 0.86 }); break;
      default: st.set({ sx: 1.08, sy: 0.86 });
    }
  });
  const release = () => {
    if (!pressed) return;
    pressed = false;
    // Rebound with overshoot, then settle to hover or rest.
    if (hovered) hover();
    else rest();
    if (p.press === 'hop') st.kick({ y: -900 });
    else if (p.press === 'spin') st.set({ rot: 0 });
    else st.kick({ sy: 9, sx: -6 });
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', () => { pressed = false; rest(); });

  el.addEventListener('click', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - (lastActivation.get(el) ?? 0) < TRANSITIONS.repeatGuardMs) return;
    if (uiHooks.isBusy()) return;
    if (el.getAttribute('aria-disabled') === 'true') {
      uiHooks.sound('denied', true);
      st.kick({ x: 420 });
      if (opts.disabledReason) uiHooks.toast(opts.disabledReason);
      return;
    }
    lastActivation.set(el, now);
    if (opts.sound !== null) uiHooks.sound(opts.sound ?? p.sound, true);
    uiHooks.haptic(10);
    // Keyboard activation still shows a press.
    if (e.detail === 0) { st.set({ sx: 1.08, sy: 0.88 }); setTimeout(() => (hovered ? hover() : rest()), 90); }
    setTimeout(() => void opts.onActivate(), TRANSITIONS.activateDelayMs);
  });
  return st;
}

/** Batch 6 object button (the object art itself is the button). width 'fluid' = sized by CSS. */
export function objectButton(artId: string, width: number | 'fluid', opts: ButtonOptions & { badge?: string | null }): HTMLButtonElement {
  const art = width === 'fluid' ? spriteFluid(artId, 'obj-art') : sprite(artId, { width, class: 'obj-art' });
  const btn = h('button', { class: `obj-btn ${opts.class ?? ''}`, attrs: { type: 'button', 'aria-label': opts.label ?? artId } }, art);
  if (opts.badge) btn.append(h('span', { class: 'obj-badge', text: opts.badge }));
  setDisabled(btn, !!opts.disabled);
  makePhysical(btn, btn, opts);
  return btn;
}

export function woodButton(label: string | Node, opts: ButtonOptions & { icon?: Node; variant?: 'green' | 'red' | 'gold' | ''; size?: 'small' | 'big' | '' }): HTMLButtonElement {
  const btn = h('button', { class: `wood-btn ${opts.variant ?? ''} ${opts.size ?? ''} ${opts.class ?? ''}`, attrs: { type: 'button', 'aria-label': typeof label === 'string' ? label : opts.label ?? null } });
  if (opts.icon) btn.append(h('span', { class: 'btn-icon' }, opts.icon));
  btn.append(typeof label === 'string' ? h('span', { text: label }) : label);
  setDisabled(btn, !!opts.disabled);
  makePhysical(btn, btn, { personality: 'wood', ...opts });
  return btn;
}

export function iceButton(label: string | Node, opts: ButtonOptions & { icon?: Node; round?: boolean }): HTMLButtonElement {
  const btn = h('button', { class: `ice-btn ${opts.round ? 'round' : ''} ${opts.class ?? ''}`, attrs: { type: 'button', 'aria-label': opts.label ?? (typeof label === 'string' ? label : null) } });
  if (opts.icon) btn.append(opts.icon);
  if (label !== '') btn.append(typeof label === 'string' ? h('span', { text: label }) : label);
  setDisabled(btn, !!opts.disabled);
  makePhysical(btn, btn, { personality: 'ice', ...opts });
  return btn;
}

/** Disabled buttons stay focusable/pressable so they can explain WHY they are unavailable. */
export function setDisabled(btn: HTMLElement, disabled: boolean): void {
  btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  btn.classList.toggle('is-disabled', disabled);
}
