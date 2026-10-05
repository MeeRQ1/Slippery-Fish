/**
 * Quests — hanging sign holding a kindergarten paper checklist. Four
 * sections (Tutorial, Daily, Weekly, Monthly) with crayon progress bars,
 * honest UTC reset countdowns, reward chips and a stamped claim animation
 * that flies the reward into the currency counters.
 */
import { formatCount, formatCountdown } from '../../core/format';
import type { Reward } from '../../economy/wallet';
import { periodKeys, type QuestCategory, type QuestView } from '../../quests/quests';
import { animate } from '../anim';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { woodButton } from '../components/buttons';
import { clear, h } from '../dom';
import { SignScreen } from '../screen';

const SECTION_TITLE: Record<QuestCategory, string> = {
  tutorial: 'TUTORIAL',
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
};

/** Milliseconds until the next UTC day / ISO week / month boundary. */
function msUntilReset(cat: Exclude<QuestCategory, 'tutorial'>, now: number): number {
  const d = new Date(now);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (cat === 'daily') return Date.UTC(y, m, day + 1) - now;
  if (cat === 'monthly') return Date.UTC(y, m + 1, 1) - now;
  const dow = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  return Date.UTC(y, m, day + (8 - dow)) - now;
}

export function rewardChips(r: Reward, size = 18): HTMLElement {
  const box = h('span', { class: 'reward-chips' });
  for (const c of ['icicles', 'shards', 'fish'] as const) {
    const v = r[c];
    if (v) box.append(h('span', { class: `reward-chip rc-${c}` }, currencyIcon(c, size), h('b', { text: formatCount(v) })));
  }
  return box;
}

export class QuestsSign extends SignScreen {
  readonly id = 'quests';
  readonly title = 'QUESTS';
  override music = 'quests' as const;
  protected override boardClass = 'wide';
  private list!: HTMLElement;
  private countdowns: Array<{ el: HTMLElement; cat: Exclude<QuestCategory, 'tutorial'> }> = [];
  private period = '';

  protected buildContent(c: HTMLElement): void {
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    this.list = h('div', { class: 'quest-paper paper-panel' });
    c.append(
      h('div', { class: 'sign-toolbar' }, h('span', { class: 'muted small', text: 'Daily quests reset at 00:00 UTC, weekly on Monday 00:00 UTC, monthly on the 1st (UTC).' }),
        woodButton('TRAINING RINK', { size: 'small', sound: 'click', onActivate: () => void this.router.go('training') }), bar.el),
      this.list,
    );
    this.render();
    this.d.interval(() => this.tick(), 1000);
  }

  private render(): void {
    const views = this.app.quests.views();
    this.period = JSON.stringify(periodKeys(Date.now()));
    this.countdowns = [];
    clear(this.list);
    const tutorial = views.filter((v) => v.def.category === 'tutorial');
    const tutorialDone = tutorial.every((v) => v.claimed);
    for (const cat of ['tutorial', 'daily', 'weekly', 'monthly'] as const) {
      const items = views.filter((v) => v.def.category === cat);
      if (cat === 'tutorial' && tutorialDone) {
        this.list.append(h('section', { class: 'quest-section done' }, h('h3', { class: 'qs-title', text: 'TUTORIAL' }), h('p', { class: 'qs-allclear', text: '★ All tutorial quests complete — you’re a certified fish dribbler!' })));
        continue;
      }
      const head = h('div', { class: 'qs-head' }, h('h3', { class: 'qs-title', text: SECTION_TITLE[cat] }));
      if (cat !== 'tutorial') {
        const cd = h('span', { class: 'qs-reset', attrs: { 'aria-label': `${SECTION_TITLE[cat]} quests reset in` } });
        head.append(cd);
        this.countdowns.push({ el: cd, cat });
      } else {
        head.append(h('span', { class: 'qs-reset', text: `${tutorial.filter((v) => v.claimed).length}/${tutorial.length}` }));
      }
      const section = h('section', { class: `quest-section qs-${cat}` }, head);
      for (const v of items) section.append(this.row(v));
      this.list.append(section);
    }
    this.tick();
  }

  private row(v: QuestView): HTMLElement {
    const pct = Math.min(1, v.progress / v.def.target);
    const check = h('span', { class: `q-check ${v.claimed ? 'checked' : ''}`, attrs: { 'aria-hidden': 'true' } });
    const prog = h('div', { class: 'q-bar', attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': v.def.target, 'aria-valuenow': Math.floor(v.progress), 'aria-label': v.def.title } },
      h('div', { class: 'q-fill', style: { width: `${pct * 100}%` } }));
    let action: HTMLElement;
    if (v.claimed) {
      action = h('span', { class: 'q-stamp', text: 'DONE!' });
    } else if (v.done) {
      const btn = woodButton('CLAIM', { variant: 'green', size: 'small', sound: 'questClaim', class: 'q-claim', onActivate: () => this.claim(v, row, btn) });
      action = btn;
    } else {
      const div = v.def.display?.div ?? 1, suf = v.def.display?.suffix ?? '';
      action = h('span', { class: 'q-count', text: `${formatCount(Math.floor(v.progress / div))} / ${formatCount(v.def.target / div)}${suf}` });
    }
    const row = h('div', { class: `quest-row ${v.claimed ? 'claimed' : v.done ? 'ready' : ''}` },
      check,
      h('div', { class: 'q-main' },
        h('div', { class: 'q-title', text: v.def.title }),
        prog,
      ),
      h('div', { class: 'q-side' }, rewardChips(v.reward, 16), action),
    );
    return row;
  }

  private claim(v: QuestView, row: HTMLElement, btn: HTMLElement): void {
    const r = btn.getBoundingClientRect();
    const res = this.app.quests.claim(v.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    if (!res) {
      this.router.toast('That quest was already claimed.');
      this.render();
      return;
    }
    const stamp = h('span', { class: 'q-stamp fresh', text: 'DONE!' });
    btn.replaceWith(stamp);
    row.classList.add('claimed');
    row.querySelector('.q-check')?.classList.add('checked');
    void animate(stamp, [{ transform: 'scale(2.4) rotate(-24deg)', opacity: 0 }, { transform: 'scale(0.9) rotate(-8deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1) rotate(-8deg)', opacity: 1 }], { duration: 380, easing: 'ease-out' });
    void animate(row, [{ transform: 'none' }, { transform: 'translateX(-3px) rotate(-0.6deg)' }, { transform: 'none' }], { duration: 260 });
    this.app.audio.play('currency');
    // Re-render after the celebration so ordering/tutorial completion update.
    this.d.timeout(() => this.render(), 1100);
  }

  private tick(): void {
    const now = Date.now();
    if (JSON.stringify(periodKeys(now)) !== this.period) {
      // A UTC period ended while the sign was open: rotate and redraw.
      this.render();
      return;
    }
    for (const c of this.countdowns) c.el.textContent = `Resets in ${formatCountdown(msUntilReset(c.cat, now)).replace(/^(\d+)h/, (_, hh: string) => (Number(hh) >= 48 ? `${Math.floor(Number(hh) / 24)}d ${String(Number(hh) % 24).padStart(2, '0')}h` : `${hh}h`))}`;
  }
}
