/**
 * Treasure Chests — hanging sign. Exactly five tiers bought with Fish
 * Currency, free chests earned from Daily milestones, and the optional
 * ad-chest (lowest tier, one verified rewarded ad, 30-minute cooldown).
 *
 * Rolls are seeded from the transaction id and applied with the Fish payment
 * in ONE idempotent transaction, so a refresh mid-animation can never re-roll
 * or double-charge. The opening animation grows more dramatic per tier.
 */
import { AD_CHEST, CHEST_TIERS, type ChestTierId } from '../../config/economy';
import { formatCount, formatCountdown } from '../../core/format';
import { rollChest, type ChestItem, type ChestRoll } from '../../economy/chests';
import { RARITIES } from '../../progression/hoods';
import { newRunId } from '../../progression/results';
import { animate, ticker } from '../anim';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { setDisabled, woodButton } from '../components/buttons';
import { hoodImageUrl } from '../components/preview';
import { clear, h, sprite, wait } from '../dom';
import { SignScreen } from '../screen';

type Tier = (typeof CHEST_TIERS)[number];
type Source = { kind: 'fish' } | { kind: 'free' } | { kind: 'ad'; rewardId: string };

export class ChestsSign extends SignScreen {
  readonly id = 'chests';
  readonly title = 'TREASURE CHESTS';
  override music = 'chests' as const;
  protected override boardClass = 'wide';
  private grid!: HTMLElement;
  private adRow!: HTMLElement;
  private opening = false;

  protected buildContent(c: HTMLElement): void {
    const bar = new CurrencyBar(this.app.wallet, ['fish', 'shards', 'icicles']);
    this.d.add(() => bar.destroy());
    this.grid = h('div', { class: 'chest-grid' });
    this.adRow = h('div', { class: 'ad-chest-row ice-panel' });
    c.append(
      h('div', { class: 'sign-toolbar' }, h('span', { class: 'muted small', text: 'Chests cost Fish. Bigger chests roll more items and rarer Hoods.' }), bar.el),
      this.grid,
      this.adRow,
      h('p', { class: 'muted small odds-note', text: 'What’s inside: every chest rolls Icicles, Icicle Shards, Fish or a Hood. Hood rarity windows — Minnow: Pollution–Lost & Found · Mackerel: Human Trash–Oooh Shiny · Tuna: Lost & Found–Epic · Emperor: SPARKLING–Glorious · Leviathan: Legendary–Food. Duplicate Hoods convert to Icicle Shards.' }),
    );
    this.d.add(this.app.save.changes.on('change', () => { if (!this.opening) this.render(); }));
    this.render();
    this.d.interval(() => this.renderAd(), 1000);
  }

  private render(): void {
    clear(this.grid);
    const inv = this.app.save.data.chests.inventory;
    for (const t of CHEST_TIERS) {
      const free = inv[t.id] ?? 0;
      const afford = this.app.wallet.balance('fish') >= t.price;
      const art = sprite(t.art, { height: 86, class: 'chest-art' });
      const buy = woodButton(h('span', { class: 'chest-price' }, currencyIcon('fish', 20), String(t.price)), {
        variant: 'gold', size: 'small', sound: 'chest', label: `Open ${t.name} for ${t.price} Fish`,
        disabled: !afford, disabledReason: `You need ${t.price} Fish (from Ranked, Daily milestones, hard quests or Fishing).`,
        onActivate: () => void this.open(t, { kind: 'fish' }),
      });
      const card = h('div', { class: `chest-card tier-${t.id}`, style: { '--drama': String(t.drama) } },
        h('div', { class: 'chest-stage' }, h('div', { class: 'chest-glow' }), art),
        h('div', { class: 'chest-name', text: t.name }),
        h('div', { class: 'chest-meta muted small', text: `${t.rolls} items · ${t.hoodChance >= 1 ? 'Hood guaranteed' : `${Math.round(t.hoodChance * 100)}%+ Hood chance`}` }),
        free > 0
          ? woodButton(`OPEN FREE ×${free}`, { variant: 'green', size: 'small', sound: 'chest', onActivate: () => void this.open(t, { kind: 'free' }) })
          : buy,
      );
      this.grid.append(card);
    }
    this.renderAd();
  }

  private renderAd(): void {
    if (this.opening) return;
    const tier = CHEST_TIERS.find((x) => x.id === AD_CHEST.tier)!;
    const av = this.app.ads.availability('free_chest');
    const wait = this.app.save.data.chests.adChestReadyAt - Date.now();
    const stateKey = `${av.available}|${wait > 0 ? Math.ceil(wait / 1000) : 0}`;
    if (this.adRow.dataset.state === stateKey) return;
    this.adRow.dataset.state = stateKey;
    const btn = woodButton('WATCH AD', {
      size: 'small', sound: 'fishing',
      disabled: !av.available || wait > 0,
      disabledReason: !av.available ? av.reason : `Next free ${tier.name} in ${formatCountdown(wait)}.`,
      onActivate: () => void this.adChest(btn),
    });
    this.adRow.replaceChildren(
      sprite(tier.art, { height: 46 }),
      h('div', { class: 'ad-text' },
        h('b', { text: `Free ${tier.name}` }),
        h('span', { class: 'muted small', text: !av.available ? av.reason : wait > 0 ? `Cooling down: ${formatCountdown(wait)}` : 'Watch one optional rewarded ad. Once every 30 minutes.' }),
      ),
      btn,
    );
  }

  private async adChest(btn: HTMLButtonElement): Promise<void> {
    setDisabled(btn, true);
    const r = await this.app.ads.showRewarded('free_chest');
    if (r.status !== 'rewarded') {
      this.adRow.dataset.state = '';
      this.renderAd();
      this.router.toast(r.status === 'cancelled' ? 'Ad closed early — no chest this time.' : r.reason);
      return;
    }
    const tier = CHEST_TIERS.find((x) => x.id === AD_CHEST.tier)!;
    await this.open(tier, { kind: 'ad', rewardId: r.rewardId });
  }

  private async open(t: Tier, src: Source): Promise<void> {
    if (this.opening) return;
    const s = this.app.save.data;
    const txId = src.kind === 'ad' ? `adchest:${src.rewardId}` : `chest:${t.id}:${src.kind}:${newRunId()}`;
    if (src.kind === 'free' && (s.chests.inventory[t.id] ?? 0) <= 0) return;
    const roll = rollChest(t.id as ChestTierId, txId, s.hoods.owned);
    const cost = src.kind === 'fish' ? { fish: t.price } : {};
    const ok = this.app.wallet.exchange(txId, cost, roll.reward, (st) => {
      st.stats.chestsOpened += 1;
      st.chests.opened[t.id] = (st.chests.opened[t.id] ?? 0) + 1;
      if (src.kind === 'free') st.chests.inventory[t.id] = Math.max(0, (st.chests.inventory[t.id] ?? 0) - 1);
      if (src.kind === 'ad') st.chests.adChestReadyAt = Date.now() + AD_CHEST.cooldownMs;
    });
    if (!ok) {
      this.router.toast(src.kind === 'fish' ? 'Not enough Fish.' : 'That chest was already opened.');
      return;
    }
    this.app.quests.track('chestsOpened', 1);
    this.opening = true;
    try {
      await this.playOpening(t, roll);
    } finally {
      this.opening = false;
      this.render();
    }
  }

  /** The reveal. Drama (1–5) scales shakes, glow, rays, confetti and pacing. */
  private async playOpening(t: Tier, roll: ChestRoll): Promise<void> {
    const drama = t.drama;
    const fast = ticker.reducedMotion;
    const art = sprite(t.art, { height: 150, class: 'co-chest' });
    const rays = h('div', { class: 'co-rays' });
    const items = h('div', { class: 'co-items' });
    const done = woodButton('COLLECT', { variant: 'green', sound: 'currency', onActivate: () => finish() });
    done.style.visibility = 'hidden';
    const layer = h('div', { class: `chest-open tier-${t.id}`, style: { '--drama': String(drama) }, attrs: { role: 'dialog', 'aria-label': `${t.name} opening` } },
      h('div', { class: 'co-title title-wood', text: t.name.toUpperCase() }),
      h('div', { class: 'co-stage' }, rays, art),
      items,
      done,
    );
    let finish: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => { finish = resolve; });
    this.board.append(layer);
    await animate(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    // Anticipation: shakes that intensify with tier.
    const shakes = fast ? 0 : 1 + drama;
    for (let i = 0; i < shakes; i++) {
      this.app.audio.play('chest', { intensity: 0.4 + (i / Math.max(1, shakes)) * 0.6, pitch: 1 + i * 0.05 });
      const mag = 4 + i * 2.5;
      await animate(art, [{ transform: 'none' }, { transform: `translateX(${-mag}px) rotate(${-mag * 0.8}deg)` }, { transform: `translateX(${mag}px) rotate(${mag * 0.8}deg)` }, { transform: 'none' }], { duration: Math.max(140, 260 - i * 20), easing: 'ease-in-out' });
      await wait(Math.max(40, 160 - i * 25));
    }
    // Burst.
    layer.classList.add('burst');
    this.app.audio.play('chestJingle', { intensity: Math.min(1, 0.5 + drama * 0.1) });
    void animate(art, [{ transform: 'scale(1)' }, { transform: 'scale(1.35) translateY(-10px)' }, { transform: 'scale(1.05)' }], { duration: 420, easing: 'cubic-bezier(0.34,1.56,0.64,1)' });
    if (!fast) this.confetti(layer, 12 + drama * 10);
    await wait(fast ? 0 : 380);
    for (const it of roll.items) {
      const card = this.itemCard(it);
      items.append(card);
      this.app.audio.play(it.kind === 'hood' ? 'star' : 'scorePop', { pitch: it.kind === 'hood' ? 1 : 1.1 });
      await animate(card, [{ transform: 'translateY(40px) scale(0.3) rotate(-10deg)', opacity: 0 }, { transform: 'translateY(-6px) scale(1.12) rotate(3deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: fast ? 120 : 420, easing: 'ease-out' });
      await wait(fast ? 0 : it.kind === 'hood' ? 420 : 160);
    }
    done.style.visibility = '';
    done.focus({ preventScroll: true });
    await closed;
    await animate(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    layer.remove();
  }

  private itemCard(it: ChestItem): HTMLElement {
    if ((it.kind === 'hood' || it.kind === 'duplicate') && it.hood) {
      const r = RARITIES[it.hood.rarityIndex]!;
      return h('div', { class: `co-item hood ${it.kind}`, style: { '--rc': r.color, '--rg': r.glow } },
        h('img', { attrs: { src: hoodImageUrl(it.hood.id, 1), alt: '', draggable: 'false' } }),
        h('b', { text: it.hood.name }),
        h('span', { class: 'co-rarity', text: r.name }),
        it.kind === 'duplicate' ? h('span', { class: 'co-dupe' }, 'Duplicate → ', currencyIcon('shards', 14), `+${formatCount(it.amount ?? 0)}`) : h('span', { class: 'co-new', text: 'NEW HOOD!' }),
      );
    }
    const c = it.kind === 'icicles' ? 'icicles' : it.kind === 'shards' ? 'shards' : 'fish';
    return h('div', { class: `co-item cur co-${c}` }, currencyIcon(c, 44), h('b', { text: `+${formatCount(it.amount ?? 0)}` }));
  }

  private confetti(layer: HTMLElement, n: number): void {
    const colors = ['#f7c531', '#ef4f6a', '#47c28b', '#5fd4ff', '#9b5de5', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const p = h('span', { class: 'co-confetti', style: { background: colors[i % colors.length]!, left: `${50 + (Math.random() - 0.5) * 20}%` } });
      layer.append(p);
      const dx = (Math.random() - 0.5) * 520, dy = -120 - Math.random() * 260;
      void animate(p, [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy + 420}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ], { duration: 1400 + Math.random() * 600, easing: 'cubic-bezier(0.2,0.6,0.4,1)' }).then(() => p.remove());
    }
  }
}
