/**
 * Currency icons + the top-right currency bar. Gains fly toward the counter
 * and the number counts up with a small overshoot; spends visibly deduct.
 */
import { CURRENCY_LABEL, type Currency } from '../../config/economy';
import type { Wallet } from '../../economy/wallet';
import { formatCount } from '../../core/format';
import { animate, CountUp } from '../anim';
import { h, sprite } from '../dom';
import { uiHooks } from '../uiHooks';

export function currencyIcon(c: Currency, size: number): HTMLSpanElement {
  const id = CURRENCY_LABEL[c].icon;
  // Icons have different aspect ratios; fit inside a square box.
  const box = h('span', { class: `cur-ic cur-${c}`, style: { width: `${size}px`, height: `${size}px` } });
  const s = sprite(id, { height: c === 'icicles' ? size : size * 0.82, alt: CURRENCY_LABEL[c].plural });
  box.append(s);
  return box;
}

export class CurrencyBar {
  readonly el: HTMLElement;
  private counters = new Map<Currency, { pill: HTMLElement; value: HTMLElement; count: CountUp; icon: HTMLElement }>();
  private off: () => void;

  constructor(wallet: Wallet, currencies: Currency[] = ['icicles', 'shards', 'fish']) {
    this.el = h('div', { class: 'currency-bar' });
    for (const c of currencies) {
      const icon = currencyIcon(c, 30);
      const value = h('span', { class: 'cur-val' });
      const pill = h('div', { class: 'cur-pill snow-plaque', attrs: { title: CURRENCY_LABEL[c].plural, 'aria-label': `${CURRENCY_LABEL[c].plural}` } }, icon, value);
      const count = new CountUp(value, wallet.balance(c), formatCount);
      this.counters.set(c, { pill, value, count, icon });
      this.el.append(pill);
    }
    this.off = wallet.events.on('changed', (e) => this.onChange(e.currency, e.delta, e.balance, e.source));
  }

  private onChange(c: Currency, delta: number, balance: number, source?: { x: number; y: number }): void {
    const ctr = this.counters.get(c);
    if (!ctr) return;
    if (delta > 0 && source) {
      void this.flyTo(c, source).then(() => {
        ctr.count.set(balance);
        this.bump(ctr.pill, true);
      });
    } else {
      ctr.count.set(balance);
      this.bump(ctr.pill, delta > 0);
      if (delta < 0) this.floatDelta(ctr.pill, delta);
    }
  }

  private bump(pill: HTMLElement, gain: boolean): void {
    void animate(pill, gain
      ? [{ transform: 'scale(1)' }, { transform: 'scale(1.18) rotate(-3deg)' }, { transform: 'scale(0.96)' }, { transform: 'scale(1)' }]
      : [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
  }

  private floatDelta(pill: HTMLElement, delta: number): void {
    const r = pill.getBoundingClientRect();
    const t = h('div', { class: 'cur-float neg', text: formatCount(delta) });
    t.style.left = `${r.left + r.width / 2}px`;
    t.style.top = `${r.bottom}px`;
    document.body.append(t);
    void animate(t, [{ opacity: 1, transform: 'translate(-50%, 0)' }, { opacity: 0, transform: 'translate(-50%, 26px)' }], { duration: 900, easing: 'ease-out' }).then(() => t.remove());
  }

  /** Icons arc from the source point to the counter, then the number ticks up. */
  async flyTo(c: Currency, from: { x: number; y: number }): Promise<void> {
    const ctr = this.counters.get(c);
    if (!ctr) return;
    const to = ctr.icon.getBoundingClientRect();
    const n = 7;
    const flights: Array<Promise<void>> = [];
    for (let i = 0; i < n; i++) {
      const ic = currencyIcon(c, 28);
      ic.classList.add('cur-flyer');
      ic.style.left = `${from.x}px`;
      ic.style.top = `${from.y}px`;
      document.body.append(ic);
      const dx = to.left + to.width / 2 - from.x, dy = to.top + to.height / 2 - from.y;
      const mx = dx * 0.45 + (Math.random() - 0.5) * 140, my = dy * 0.45 - 80 - Math.random() * 60;
      flights.push(animate(ic, [
        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px)) scale(1.1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0.9 },
      ], { duration: 650 + i * 45, easing: 'cubic-bezier(0.5,0,0.4,1)', delay: i * 40 }).then(() => {
        ic.remove();
        uiHooks.sound('currency');
      }));
    }
    await Promise.race([Promise.all(flights), new Promise<void>((r) => setTimeout(r, 1400))]);
  }

  destroy(): void {
    this.off();
    this.el.remove();
  }
}
