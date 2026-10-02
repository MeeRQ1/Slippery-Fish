/**
 * Gameplay HUD widgets (DOM). Updated once per animation frame from a
 * HudSnapshot — never coupled to the simulation internals.
 */
import { formatTime } from '../../core/format';
import type { HudSnapshot, StaminaVisualState } from '../../gameplay/session';
import { h, sprite } from '../dom';

/** Icy, snow-capped stamina meter with NORMAL / SPRINTING / LOW / EMPTY states. */
export class StaminaMeter {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private trail: HTMLElement;
  private label: HTMLElement;
  private shown = 1;
  private trailV = 1;
  private state: StaminaVisualState = 'normal';

  constructor() {
    this.fill = h('div', { class: 'stam-fill' });
    this.trail = h('div', { class: 'stam-trail' });
    this.label = h('span', { class: 'stam-label', text: 'STAMINA' });
    const icon = h('div', { class: 'stam-icon', attrs: { 'aria-hidden': 'true' } }, h('span', { text: '❄' }));
    this.el = h('div', { class: 'stamina', attrs: { role: 'meter', 'aria-label': 'Stamina', 'aria-valuemin': 0, 'aria-valuemax': 100 } },
      icon,
      h('div', { class: 'stam-track' }, this.trail, this.fill, h('div', { class: 'stam-shine' }), h('div', { class: 'stam-ticks' })),
      this.label,
    );
  }

  update(s: HudSnapshot, dt: number): void {
    const target = s.staminaMax > 0 ? s.stamina / s.staminaMax : 0;
    // Smooth drain/refill (fast toward target), trail lags behind on drain.
    this.shown += (target - this.shown) * Math.min(1, dt * 18);
    if (target < this.trailV) this.trailV += (target - this.trailV) * Math.min(1, dt * 2.2);
    else this.trailV = this.shown;
    this.fill.style.transform = `scaleX(${Math.max(0, this.shown).toFixed(4)})`;
    this.trail.style.transform = `scaleX(${Math.max(0, this.trailV).toFixed(4)})`;
    if (s.staminaState !== this.state) {
      this.el.classList.remove(`is-${this.state}`);
      this.state = s.staminaState;
      this.el.classList.add(`is-${this.state}`);
      this.label.textContent = this.state === 'empty' ? 'EXHAUSTED' : this.state === 'low' ? 'LOW!' : this.state === 'sprinting' ? 'SPRINT!' : 'STAMINA';
    }
    this.el.setAttribute('aria-valuenow', String(Math.round(target * 100)));
  }
}

/** Fish icons: stashed (bright), waiting (ghost), eaten (bones). */
export class FishTracker {
  readonly el: HTMLElement;
  private icons: HTMLElement[] = [];
  private count: HTMLElement;
  private last = '';
  private compact: boolean;

  constructor(private required: number, total: number) {
    this.compact = required > 6;
    this.count = h('span', { class: 'fish-count' });
    const row = h('div', { class: 'fish-row' });
    if (!this.compact) {
      for (let i = 0; i < required; i++) {
        const ic = h('span', { class: 'fish-ic' }, sprite('fish_standard', { width: 34 }));
        this.icons.push(ic);
        row.append(ic);
      }
    } else {
      row.append(sprite('fish_standard', { width: 34 }));
    }
    this.el = h('div', { class: 'fish-tracker', attrs: { 'aria-live': 'polite' } }, row, this.count);
    void total;
  }

  update(s: HudSnapshot): void {
    const key = `${s.stashed}|${s.fishEaten}`;
    if (key === this.last) return;
    const prevStashed = Number(this.last.split('|')[0] ?? 0);
    this.last = key;
    this.count.textContent = `${Math.min(s.stashed, this.required)} / ${this.required}`;
    this.icons.forEach((ic, i) => {
      const was = ic.classList.contains('got');
      ic.classList.toggle('got', i < s.stashed);
      if (!was && i < s.stashed && s.stashed > prevStashed) {
        ic.classList.remove('pop');
        void ic.offsetWidth;
        ic.classList.add('pop');
      }
    });
    if (this.compact && s.stashed > prevStashed) {
      this.count.classList.remove('pop');
      void this.count.offsetWidth;
      this.count.classList.add('pop');
    }
  }
}

export class TimerBlock {
  readonly el: HTMLElement;
  private time: HTMLElement;
  private best: HTMLElement;

  constructor(bestMs: number | null, seedCode: string | null) {
    this.time = h('span', { class: 'hud-num', text: formatTime(0) });
    this.best = h('span', { class: 'hud-num best', text: formatTime(bestMs) });
    this.el = h('div', { class: 'hud-timer ice-slab' },
      h('div', { class: 'hud-row' }, h('span', { class: 'hud-key', text: 'BEST' }), this.best),
      h('div', { class: 'hud-row' }, h('span', { class: 'hud-key', text: 'TIME' }), this.time),
      seedCode ? h('div', { class: 'hud-row seed' }, h('span', { class: 'hud-key', text: 'SEED' }), h('span', { class: 'hud-num', text: seedCode })) : null,
    );
  }

  update(s: HudSnapshot): void {
    this.time.textContent = formatTime(s.timeMs);
  }
}

/** Red pulsing screen-edge warning; intensity scales with proximity. */
export class DangerVignette {
  readonly el: HTMLElement;
  private phase = 0;
  constructor(private intensity: () => number, private reduced: () => boolean) {
    this.el = h('div', { class: 'danger-vignette', attrs: { 'aria-hidden': 'true' } });
  }
  update(danger: number, dt: number, pulseFar: number, pulseNear: number, opFar: number, opNear: number): void {
    if (danger <= 0.01) {
      this.el.style.opacity = '0';
      return;
    }
    const hz = pulseFar + (pulseNear - pulseFar) * danger;
    this.phase += dt * hz * Math.PI * 2;
    const pulse = this.reduced() ? 0.85 : 0.72 + 0.28 * Math.sin(this.phase);
    const base = opFar + (opNear - opFar) * danger;
    this.el.style.opacity = String(Math.min(1, base * pulse * this.intensity()));
    this.el.style.setProperty('--vig-size', `${(62 - danger * 22).toFixed(1)}%`);
  }
}
