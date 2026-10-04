/**
 * Purchases (Store) — hanging sign. The crumpled dollar goes CHA-CHING.
 *
 *  - Trading Post: repeatable exchanges using EARNED currencies only.
 *  - Promotions: server-controlled; none unless a remote config is set.
 *  - Real money: optional integration, DISABLED in this build — products are
 *    shown as unavailable with an honest reason, no price is charged and no
 *    client-side "success" ever grants anything.
 *  - Recover Purchases explains there is nothing to recover.
 */
import { EXCHANGE_OFFERS, type ExchangeOffer } from '../../config/economy';
import { trade, tradesLeft } from '../../economy/exchange';
import { formatCount } from '../../core/format';
import { newRunId } from '../../progression/results';
import { animate } from '../anim';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { iceButton, woodButton } from '../components/buttons';
import { clear, h, sprite } from '../dom';
import { SignScreen } from '../screen';
import { rewardChips } from './QuestsSign';

export class StoreSign extends SignScreen {
  readonly id = 'store';
  readonly title = 'PURCHASES';
  override music = 'shop' as const;
  protected override boardClass = 'wide';
  private dollar!: HTMLElement;
  private trade!: HTMLElement;
  private promos!: HTMLElement;

  protected buildContent(c: HTMLElement): void {
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    this.dollar = h('div', { class: 'store-dollar', attrs: { 'aria-hidden': 'true' } }, sprite('btnicon_purchases_normal', { height: 84 }));
    this.trade = h('div', { class: 'trade-grid' });
    this.promos = h('div', { class: 'promo-list' }, h('p', { class: 'muted small', text: 'Checking for promotions…' }));
    const pay = this.app.payments.availability();
    const products = h('div', { class: 'rm-grid' });
    for (const p of this.app.payments.products()) {
      products.append(h('div', { class: 'rm-card is-off', attrs: { 'aria-disabled': 'true' } },
        h('div', { class: 'rm-label', text: p.label }),
        rewardChips(p.grants, 16),
        h('span', { class: 'chip off', text: 'Unavailable' }),
      ));
    }
    c.append(
      h('div', { class: 'sign-toolbar' }, this.dollar, bar.el),
      h('h3', { text: 'TRADING POST' }),
      h('p', { class: 'muted small', text: 'Swap the currencies you earned by playing. No real money involved.' }),
      this.trade,
      h('h3', { text: 'COSMETICS' }),
      h('div', { class: 'store-links' },
        woodButton('CHOOSE YOUR WADDLE', { size: 'small', sound: 'click', onActivate: () => void this.goFull('waddle') }),
        woodButton('HOODS', { size: 'small', sound: 'click', onActivate: () => void this.router.go('hoods') }),
        woodButton('TREASURE CHESTS', { size: 'small', sound: 'chest', onActivate: () => void this.router.go('chests') }),
      ),
      h('h3', { text: 'PROMOTIONS' }),
      this.promos,
      h('h3', { text: 'REAL-MONEY SHOP' }),
      h('div', { class: 'store-notice ice-panel', attrs: { role: 'note' } },
        h('b', { text: 'Not available' }),
        h('p', { text: pay.reason }),
      ),
      products,
      h('div', { class: 'store-links' },
        iceButton('RECOVER PURCHASES', { class: 'small', sound: 'clickSoft', onActivate: () => void this.recover() }),
      ),
    );
    this.renderTrade();
    this.d.add(this.app.save.changes.on('change', () => this.renderTrade()));
    void this.loadPromos();
  }

  override async enter(): Promise<void> {
    await super.enter();
    this.chaChing();
  }

  private async goFull(id: string): Promise<void> {
    await this.router.closeSign();
    await this.router.go(id);
  }

  private chaChing(): void {
    this.app.audio.play('chaChing');
    void animate(this.dollar, [
      { transform: 'scale(1) rotate(0)' },
      { transform: 'scale(0.78, 0.9) rotate(-10deg)', offset: 0.25 },
      { transform: 'scale(1.18) rotate(6deg)', offset: 0.6 },
      { transform: 'scale(1) rotate(0)' },
    ], { duration: 520, easing: 'ease-out' });
  }

  private renderTrade(): void {
    clear(this.trade);
    for (const o of EXCHANGE_OFFERS) {
      const costEntries = Object.entries(o.cost) as Array<['icicles' | 'shards' | 'fish', number]>;
      const left = tradesLeft(this.app.save.data, o, Date.now());
      const afford = this.app.wallet.canAfford(o.cost);
      const costLabel = h('span', { class: 'trade-cost' }, ...costEntries.flatMap(([cur, v]) => [currencyIcon(cur, 18), formatCount(v)]));
      const per = o.limit.per === 'daily' ? 'today' : 'this week';
      const btn = woodButton(costLabel, {
        variant: 'gold', size: 'small', sound: 'chaChing', label: `Trade for ${o.label}`,
        disabled: !afford || left <= 0,
        disabledReason: left <= 0
          ? `Trade limit reached — resets ${o.limit.per === 'daily' ? 'at the next UTC day' : 'next UTC week (Monday)'}.`
          : `You need ${costEntries.map(([cur, v]) => `${formatCount(v)} ${cur === 'icicles' ? 'Icicles' : cur === 'shards' ? 'Icicle Shards' : 'Fish'}`).join(' and ')}.`,
        onActivate: () => this.buy(o, btn),
      });
      this.trade.append(h('div', { class: `trade-card ${left <= 0 ? 'spent' : ''}` }, rewardChips(o.grants, 26), h('div', { class: 'trade-label', text: o.label }),
        h('div', { class: 'trade-limit muted small', text: `${left} of ${o.limit.count} left ${per}` }), btn));
    }
  }

  private buy(o: ExchangeOffer, btn: HTMLElement): void {
    const r = btn.getBoundingClientRect();
    const res = trade(this.app.save, this.app.wallet, o, Date.now(), `store:${o.id}:${newRunId()}`, { x: r.left + r.width / 2, y: r.top });
    if (res !== 'ok') {
      this.router.toast(res === 'limit' ? 'That trade is used up for now.' : 'Not enough to trade.');
      return;
    }
    this.chaChing();
  }

  private async recover(): Promise<void> {
    const res = await this.app.payments.recoverPurchases();
    this.router.toast(res.reason);
  }

  private async loadPromos(): Promise<void> {
    const list = await this.app.remoteConfig.promotions();
    if (!this.promos.isConnected && !this.el.isConnected) return;
    clear(this.promos);
    if (list.length === 0) {
      this.promos.append(h('p', { class: 'muted small', text: 'No promotions right now.' }));
      return;
    }
    for (const p of list) {
      this.promos.append(h('div', { class: 'promo-card paper-panel' }, h('b', { text: p.title }), p.body ? h('p', { text: p.body }) : null,
        p.endsAt ? h('span', { class: 'muted small', text: `Ends ${new Date(p.endsAt).toUTCString()}` }) : null));
    }
  }
}
