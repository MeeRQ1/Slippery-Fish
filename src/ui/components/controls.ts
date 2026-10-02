/**
 * Form controls in the game's materials: icy sliders, wooden toggle
 * switches, segmented ice choices, and a confirm dialog. All are keyboard
 * and screen-reader accessible (native range input, role=switch, radiogroup).
 */
import { animate } from '../anim';
import { h } from '../dom';
import { uiHooks } from '../uiHooks';
import { makePhysical, woodButton } from './buttons';

export function slider(label: string, value: number, opts: { min: number; max: number; step: number; format?: (v: number) => string; onInput: (v: number) => void; onCommit?: (v: number) => void }): HTMLElement {
  const fmt = opts.format ?? ((v: number) => `${Math.round(v * 100)}%`);
  const out = h('output', { class: 'ctl-val', text: fmt(value) });
  const input = h('input', { class: 'ice-range', attrs: { type: 'range', min: opts.min, max: opts.max, step: opts.step, value, 'aria-label': label } });
  const paint = (): void => {
    const v = Number(input.value);
    input.style.setProperty('--fill', `${((v - opts.min) / (opts.max - opts.min)) * 100}%`);
    out.textContent = fmt(v);
  };
  input.addEventListener('input', () => { paint(); opts.onInput(Number(input.value)); });
  input.addEventListener('change', () => { opts.onCommit?.(Number(input.value)); uiHooks.sound('clickSoft', true); });
  paint();
  return h('label', { class: 'ctl-row' }, h('span', { class: 'ctl-label', text: label }), input, out);
}

export function toggle(label: string, on: boolean, onChange: (v: boolean) => void, opts: { note?: string; disabled?: boolean; disabledReason?: string } = {}): HTMLElement {
  const knob = h('span', { class: 'tg-knob' });
  const sw = h('button', { class: `wood-toggle ${on ? 'on' : ''}`, attrs: { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label } }, h('span', { class: 'tg-track' }, knob));
  if (opts.disabled) sw.setAttribute('aria-disabled', 'true');
  let state = on;
  makePhysical(sw, knob, {
    personality: 'ice', sound: 'clickSoft',
    ...(opts.disabledReason ? { disabledReason: opts.disabledReason } : {}),
    onActivate: () => {
      state = !state;
      sw.classList.toggle('on', state);
      sw.setAttribute('aria-checked', state ? 'true' : 'false');
      onChange(state);
    },
  });
  return h('div', { class: 'ctl-row' }, h('span', { class: 'ctl-label' }, label, opts.note ? h('small', { class: 'ctl-note', text: opts.note }) : null), sw);
}

export function segmented<T extends string>(label: string, value: T, choices: ReadonlyArray<{ value: T; label: string }>, onChange: (v: T) => void): HTMLElement {
  const group = h('div', { class: 'seg', attrs: { role: 'radiogroup', 'aria-label': label } });
  const btns: HTMLButtonElement[] = [];
  for (const c of choices) {
    const b = h('button', { class: `seg-btn ${c.value === value ? 'on' : ''}`, attrs: { type: 'button', role: 'radio', 'aria-checked': c.value === value ? 'true' : 'false' }, text: c.label });
    makePhysical(b, b, {
      personality: 'ice', sound: 'clickSoft',
      onActivate: () => {
        for (const o of btns) { o.classList.toggle('on', o === b); o.setAttribute('aria-checked', o === b ? 'true' : 'false'); }
        onChange(c.value);
      },
    });
    btns.push(b);
    group.append(b);
  }
  return h('div', { class: 'ctl-row' }, h('span', { class: 'ctl-label', text: label }), group);
}

/** Modal confirm on an ice card. Resolves true only on an explicit confirm. */
export function confirmDialog(opts: { title: string; body: string | Node; confirmLabel: string; cancelLabel?: string; danger?: boolean; requireText?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let input: HTMLInputElement | null = null;
    const close = (v: boolean): void => {
      document.removeEventListener('keydown', onKey, true);
      void animate(card, [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.9)', opacity: 0 }], { duration: 160 }).then(() => veil.remove());
      resolve(v);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    };
    const confirmBtn = woodButton(opts.confirmLabel, {
      variant: opts.danger ? 'red' : 'green', size: 'small', sound: opts.danger ? 'denied' : 'click',
      ...(opts.requireText ? { disabled: true, disabledReason: `Type ${opts.requireText} to confirm.` } : {}),
      onActivate: () => close(true),
    });
    const body = typeof opts.body === 'string' ? h('p', { text: opts.body }) : opts.body;
    const card = h('div', { class: 'confirm-card ice-panel', attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': opts.title } },
      h('h3', { class: 'title-ice', text: opts.title }), body);
    if (opts.requireText) {
      const need = opts.requireText;
      input = h('input', { class: 'sf-input', attrs: { type: 'text', 'aria-label': `Type ${need} to confirm`, placeholder: need, autocomplete: 'off', spellcheck: 'false' } });
      input.addEventListener('input', () => {
        const ok = input!.value.trim().toUpperCase() === need.toUpperCase();
        confirmBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
        confirmBtn.classList.toggle('is-disabled', !ok);
      });
      card.append(input);
    }
    card.append(h('div', { class: 'confirm-actions' }, woodButton(opts.cancelLabel ?? 'CANCEL', { size: 'small', sound: 'back', onActivate: () => close(false) }), confirmBtn));
    const veil = h('div', { class: 'confirm-veil' }, card);
    document.body.append(veil);
    document.addEventListener('keydown', onKey, true);
    void animate(card, [{ transform: 'scale(0.8) translateY(20px)', opacity: 0 }, { transform: 'scale(1.03)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    (input ?? card.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
  });
}
