/**
 * Fishing (the "Watch Ads" button) — opening it never plays an ad. Shows the
 * penguin fishing (backdrop: hole, rod, bobber, bucket), the Fish reward,
 * honest availability, START and EXIT. A reward is granted ONLY on a verified
 * provider reward event, once per reward id.
 */
import { FISHING_REWARD_FISH } from '../../config/economy';
import { waddleFrame } from '../../profile/waddles';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { woodButton } from '../components/buttons';
import { h } from '../dom';
import { Screen } from '../screen';
import type { App } from '../../app';
import type { Router } from '../router';
import type { ScreenParams } from '../screen';

export class FishingScreen extends Screen {
  readonly id = 'fishing';
  override hash = 'fishing';
  override music = 'fishing' as const;
  private bar!: CurrencyBar;

  constructor(app: App, router: Router, params: ScreenParams) {
    super(app, router, params);
    this.backdrop = { mode: 'fishing', opts: { penguinFrame: waddleFrame(app.save.data.waddles.selected) } };
  }

  build(): void {
    this.el.className = 'screen mode-screen fishing-screen';
    this.bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => this.bar.destroy());
    const av = this.app.ads.availability('fishing');
    const start = woodButton('START', {
      variant: 'green', size: 'big', sound: 'fishing',
      disabled: !av.available, disabledReason: av.reason,
      onActivate: () => void this.fish(start),
    });
    this.el.append(
      h('div', { class: 'mode-top' }, h('h1', { class: 'title-wood mode-title', text: 'FISHING' }), this.bar.el),
      h('div', { class: 'fishing-panel ice-panel' },
        h('h3', { class: 'title-ice', text: 'GONE FISHING' }),
        h('div', { class: 'fish-reward' }, currencyIcon('fish', 44), h('b', { text: `+${FISHING_REWARD_FISH} Fish` })),
        h('p', { text: 'Watch one short, optional rewarded ad and your penguin reels in Fish — the scarce currency for Treasure Chests.' }),
        h('div', { class: `avail ${av.available ? 'ok' : 'off'}`, attrs: { role: 'status' } }, av.available ? 'Available now' : av.reason),
        h('div', { class: 'fishing-actions' }, start, woodButton('EXIT', { variant: 'red', sound: 'back', onActivate: () => void this.router.go('menu') })),
      ),
    );
  }

  private async fish(btn: HTMLButtonElement): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    this.app.audio.play('reel');
    const r = await this.app.ads.showRewarded('fishing');
    btn.setAttribute('aria-disabled', 'false');
    if (r.status !== 'rewarded') {
      this.router.toast(r.status === 'cancelled' ? 'The fish got away (ad closed early — no reward).' : r.reason);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const ok = this.app.wallet.grant(`fishing:${r.rewardId}`, { fish: FISHING_REWARD_FISH }, undefined, { x: rect.left + rect.width / 2, y: rect.top });
    if (ok) {
      this.app.audio.play('splash');
      this.router.toast(`Caught ${FISHING_REWARD_FISH} Fish!`);
    }
  }
}
