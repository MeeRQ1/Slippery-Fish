/**
 * Daily Challenge — dedicated screen (never launches gameplay directly).
 * Eight Popsicles (5 levels each) with their specific rewards shown up front,
 * progress pips, claimed state, live UTC countdown, PLAY, HARD MODE, BACK.
 */
import { formatCountdown } from '../../core/format';
import { DAILY_LEVELS, DAILY_MILESTONES, LEVELS_PER_MILESTONE, msUntilReset } from '../../levels/daily';
import { dailyDriver, dailyMilestoneRewards, syncDailyCycle } from '../../progression/drivers';
import { REGION_BY_ID } from '../../config/regions';
import { dailyRegions } from '../../levels/daily';
import { HOOD_BY_ID } from '../../progression/hoods';
import { drawHood } from '../../art/hoodArt';
import { animate } from '../anim';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { iceButton, makePhysical, woodButton } from '../components/buttons';
import { canvasImg, clear, h, sprite } from '../dom';
import { Screen } from '../screen';

/** Milestones already celebrated this session (so returning players see new ones animate once). */
const celebrated = new Set<string>();

export class DailyScreen extends Screen {
  readonly id = 'daily';
  override hash = 'daily';
  override music = 'daily' as const;
  override backdrop = { mode: 'daily' as const };
  private hard = false;
  private selected = 1;
  private countdown!: HTMLElement;
  private pops!: HTMLElement;
  private detail!: HTMLElement;
  private playBtn!: HTMLButtonElement;

  build(): void {
    this.el.className = 'screen mode-screen daily-screen';
    const { dateKey, clockRolledBack } = syncDailyCycle(this.app.driverServices);
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    this.countdown = h('span', { class: 'countdown' });
    this.pops = h('div', { class: 'popsicle-row', attrs: { role: 'list', 'aria-label': 'Daily milestones' } });
    this.detail = h('div', { class: 'popsicle-detail ice-panel' });
    const hardBtn = iceButton('HARD MODE: OFF', { class: 'hard-toggle', sound: 'ranked', onActivate: () => {
      this.hard = !this.hard;
      hardBtn.querySelector('span')!.textContent = `HARD MODE: ${this.hard ? 'ON' : 'OFF'}`;
      hardBtn.classList.toggle('selected', this.hard);
      this.render();
    } });
    this.playBtn = woodButton('PLAY', { variant: 'green', size: 'big', onActivate: () => this.play() });
    this.el.append(
      h('div', { class: 'mode-top' }, woodButton('BACK', { size: 'small', sound: 'back', onActivate: () => void this.router.go('menu') }), h('h1', { class: 'title-wood mode-title', text: 'DAILY CHALLENGE' }), bar.el),
      h('div', { class: 'daily-sub' },
        h('span', { class: 'chip', text: `${dateKey} (UTC) · 40 levels · same for everyone` }),
        h('span', { class: 'chip warn' }, '⏱ Resets in ', this.countdown),
        clockRolledBack ? h('span', { class: 'chip warn', text: 'Your device clock looks earlier than before — daily progress is stored locally only.' }) : null,
      ),
      this.pops,
      this.detail,
      h('div', { class: 'mode-bottom' }, hardBtn, this.playBtn),
    );
    const tick = () => { this.countdown.textContent = formatCountdown(msUntilReset(Date.now())); };
    tick();
    this.d.interval(() => {
      tick();
      // Rolled over while the screen is open: refresh to the new shared set.
      const cyc = syncDailyCycle(this.app.driverServices);
      if (cyc.dateKey !== dateKey) void this.router.go('daily', {}, { replace: true });
    }, 1000);
    this.selected = this.firstOpenMilestone();
    this.render();
  }

  private done(): Set<number> {
    const d = this.app.save.data.daily;
    return new Set(this.hard ? d.completedHard : [...d.completed, ...d.completedHard]);
  }

  private nextLevel(): number | null {
    const done = this.hard ? new Set(this.app.save.data.daily.completedHard) : new Set(this.app.save.data.daily.completed);
    for (let i = 1; i <= DAILY_LEVELS; i++) if (!done.has(i)) return i;
    return null;
  }

  private firstOpenMilestone(): number {
    const n = this.nextLevel();
    return n ? Math.ceil(n / LEVELS_PER_MILESTONE) : DAILY_MILESTONES;
  }

  private render(): void {
    const s = this.app.save.data;
    const dateKey = s.daily.cycleId.split('-').slice(1, 4).join('-');
    const rewards = dailyMilestoneRewards(dateKey);
    const regions = dailyRegions(dateKey);
    const done = this.done();
    const next = this.nextLevel();
    clear(this.pops);
    for (let m = 1; m <= DAILY_MILESTONES; m++) {
      const first = (m - 1) * LEVELS_PER_MILESTONE + 1;
      const count = Array.from({ length: LEVELS_PER_MILESTONE }, (_, k) => first + k).filter((i) => done.has(i)).length;
      const claimed = s.daily.claimed.includes(m);
      const reachable = first <= (next ?? DAILY_LEVELS + 1);
      const art = claimed ? 'btnicon_daily_hover' : reachable ? 'btnicon_daily_normal' : 'btnicon_daily_disabled';
      const card = h('button', { class: `popsicle ${claimed ? 'claimed' : ''} ${!reachable ? 'locked' : ''} ${m === this.selected ? 'selected' : ''} ${m === 8 ? 'summit' : ''}`, attrs: { type: 'button', role: 'listitem', 'aria-label': `Popsicle ${m}: ${count} of 5 levels, reward ${rewards[m - 1]!.label}${claimed ? ', claimed' : ''}` } },
        h('span', { class: 'pop-art' }, sprite(art, { height: 74 })),
        h('span', { class: 'pop-name', text: m === 8 ? 'Popsicle 8 ★' : `Popsicle ${m}` }),
        h('span', { class: 'pop-pips' }, ...Array.from({ length: 5 }, (_, k) => h('i', { class: k < count ? 'on' : '' }))),
        h('span', { class: 'pop-reward' }, this.rewardIcons(rewards[m - 1]!)),
        claimed ? h('span', { class: 'pop-check', text: '✓' }) : null,
      );
      makePhysical(card, card, { personality: 'daily', sound: 'clickSoft', onActivate: () => { this.selected = m; this.render(); } });
      this.pops.append(card);
      const key = `${s.daily.cycleId}:${m}`;
      if (claimed && !celebrated.has(key)) {
        celebrated.add(key);
        // Popsicle animates, reward reveals, sound plays, reward flies to the counter.
        setTimeout(() => {
          void animate(card, [{ transform: 'scale(1) rotate(0)' }, { transform: 'scale(1.25) rotate(-10deg)' }, { transform: 'scale(0.95) rotate(6deg)' }, { transform: 'none' }], { duration: 700, easing: 'ease-out' });
          this.app.audio.play('questClaim');
        }, 300 + m * 120);
      }
    }
    // Detail for the selected popsicle.
    const m = this.selected;
    const first = (m - 1) * LEVELS_PER_MILESTONE + 1;
    const r = rewards[m - 1]!;
    const region = REGION_BY_ID[regions[m - 1]!];
    const levels = h('div', { class: 'pop-levels' });
    for (let k = 0; k < LEVELS_PER_MILESTONE; k++) {
      const i = first + k;
      const isDone = done.has(i);
      const playable = next !== null && i <= next;
      const node = h('button', { class: `level-node small ${isDone ? 'mastered' : ''} ${i === next ? 'current' : ''} ${!playable && !isDone ? 'locked' : ''}`, attrs: { type: 'button', 'aria-label': `Daily level ${i}${isDone ? ', done' : ''}` } }, h('span', { class: 'ln-num', text: String(i) }), isDone ? h('span', { class: 'ln-done', text: '✓' }) : null);
      makePhysical(node, node, { personality: 'ice', sound: playable || isDone ? 'click' : 'denied', onActivate: () => {
        if (!playable && !isDone) { this.router.toast('Clear the earlier Daily levels first.'); return; }
        void this.router.go('play', { driver: dailyDriver(this.app.driverServices, i, this.hard) });
      } });
      levels.append(node);
    }
    this.detail.replaceChildren(
      h('div', { class: 'pd-head' },
        h('h3', { class: 'title-ice', text: `POPSICLE ${m}` }),
        h('span', { class: 'chip', text: `${region.name} · levels ${first}–${first + 4}` }),
      ),
      levels,
      h('div', { class: 'pd-reward' }, h('span', { class: 'pd-label', text: s.daily.claimed.includes(m) ? 'CLAIMED:' : 'REWARD:' }), this.rewardIcons(r, true), h('b', { text: r.label })),
    );
    const label = next === null ? 'ALL DONE!' : `PLAY ${next}`;
    this.playBtn.querySelector('span')!.textContent = label;
    this.playBtn.setAttribute('aria-disabled', next === null ? 'true' : 'false');
    this.playBtn.classList.toggle('is-disabled', next === null);
  }

  private rewardIcons(r: ReturnType<typeof dailyMilestoneRewards>[number], big = false): HTMLElement {
    const size = big ? 28 : 20;
    const box = h('span', { class: 'reward-icons' });
    if (r.reward.icicles) box.append(currencyIcon('icicles', size));
    if (r.reward.shards) box.append(currencyIcon('shards', size));
    if (r.reward.fish) box.append(currencyIcon('fish', size));
    if (r.chest) box.append(sprite(r.chest === 'minnow' ? 'chest_minnow_crate' : 'chest_mackerel', { height: size }));
    if (r.hoodId) {
      const hd = HOOD_BY_ID[r.hoodId];
      if (hd) box.append(canvasImg(drawHood(hd.art, 0.5), 'reward-hood', hd.name));
    }
    return box;
  }

  private play(): void {
    const n = this.nextLevel();
    if (n === null) {
      this.router.toast('You cleared every Daily level today! New set at 00:00 UTC.');
      return;
    }
    void this.router.go('play', { driver: dailyDriver(this.app.driverServices, n, this.hard) });
  }
}
