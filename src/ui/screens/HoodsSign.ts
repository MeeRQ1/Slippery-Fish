/**
 * Hoods — hanging sign. Ten rarity tabs × 20 Hoods (only the active rarity's
 * cards are in the DOM). Shows price, rarity, ability, strength, ownership
 * and equipped state; buy with Icicle Shards; equip/unequip.
 */
import { FAMILY_BY_ID, HOODS, RARITIES, describeHood, type HoodDef, type RarityId } from '../../progression/hoods';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { iceButton, makePhysical, woodButton } from '../components/buttons';
import { hoodImageUrl, penguinPreview } from '../components/preview';
import { clear, h } from '../dom';
import { SignScreen } from '../screen';

export class HoodsSign extends SignScreen {
  readonly id = 'hoods';
  readonly title = 'HOODS';
  override music = 'hoods' as const;
  protected override boardClass = 'wide';
  private rarity: RarityId = 'pollution';
  private focus: HoodDef | null = null;
  private tabs!: HTMLElement;
  private grid!: HTMLElement;
  private detail!: HTMLElement;

  protected buildContent(c: HTMLElement): void {
    const s = this.app.save.data;
    const eq = s.hoods.equipped ? HOODS.find((x) => x.id === s.hoods.equipped) : undefined;
    if (eq) { this.rarity = eq.rarity; this.focus = eq; }
    const bar = new CurrencyBar(this.app.wallet, ['shards']);
    this.d.add(() => bar.destroy());
    this.tabs = h('div', { class: 'rarity-tabs', attrs: { role: 'tablist' } });
    this.grid = h('div', { class: 'hood-grid', attrs: { role: 'listbox', 'aria-label': 'Hoods' } });
    this.detail = h('div', { class: 'hood-detail' });
    c.append(
      h('div', { class: 'sign-toolbar' }, h('span', { class: 'muted', text: `${s.hoods.owned.length} / ${HOODS.length} collected` }), bar.el),
      this.tabs, this.detail, this.grid,
    );
    this.d.add(this.app.save.changes.on('change', () => { this.renderGrid(); this.renderDetail(); }));
    this.renderTabs();
    this.renderGrid();
    this.renderDetail();
  }

  private renderTabs(): void {
    clear(this.tabs);
    const owned = new Set(this.app.save.data.hoods.owned);
    for (const r of RARITIES) {
      const count = HOODS.filter((x) => x.rarity === r.id && owned.has(x.id)).length;
      const t = h('button', { class: `rarity-tab ${r.id === this.rarity ? 'active' : ''}`, attrs: { type: 'button', role: 'tab', 'aria-selected': r.id === this.rarity ? 'true' : 'false' }, style: { '--rc': r.color, '--rg': r.glow } },
        h('span', { class: 'rt-label', text: r.name }), h('span', { class: 'rt-count', text: `${count}/20` }));
      makePhysical(t, t, { personality: 'ice', sound: 'clickSoft', onActivate: () => { this.rarity = r.id; this.focus = null; this.renderTabs(); this.renderGrid(); this.renderDetail(); } });
      this.tabs.append(t);
    }
  }

  private renderGrid(): void {
    const s = this.app.save.data;
    const owned = new Set(s.hoods.owned);
    clear(this.grid);
    const r = RARITIES.find((x) => x.id === this.rarity)!;
    for (const hd of HOODS.filter((x) => x.rarity === this.rarity)) {
      const isOwned = owned.has(hd.id);
      const isEq = s.hoods.equipped === hd.id;
      const card = h('button', { class: `hood-card ${isOwned ? 'owned' : ''} ${isEq ? 'equipped' : ''} ${this.focus?.id === hd.id ? 'focused' : ''}`, attrs: { type: 'button', role: 'option', 'aria-label': `${hd.name}, ${r.name}, ${describeHood(hd)}${isEq ? ', equipped' : isOwned ? ', owned' : `, ${hd.price} shards`}` }, style: { '--rc': r.color, '--rg': r.glow } },
        h('img', { class: 'hc-art', attrs: { src: hoodImageUrl(hd.id, 1), alt: '', draggable: 'false', loading: 'lazy' } }),
        h('span', { class: 'hc-name', text: hd.name }),
        h('span', { class: 'hc-fam', text: FAMILY_BY_ID[hd.family].label }),
        isEq ? h('span', { class: 'hc-tag eq', text: 'EQUIPPED' }) : isOwned ? h('span', { class: 'hc-tag', text: 'OWNED' }) : h('span', { class: 'hc-price' }, currencyIcon('shards', 16), String(hd.price)),
      );
      makePhysical(card, card, { personality: 'hoods', sound: 'clickSoft', onActivate: () => { this.focus = hd; this.renderGrid(); this.renderDetail(); } });
      this.grid.append(card);
    }
  }

  private renderDetail(): void {
    const s = this.app.save.data;
    const hd = this.focus;
    if (!hd) {
      this.detail.replaceChildren(h('p', { class: 'muted', text: 'Tap a Hood to see what it does. Higher rarities are stronger. In Ranked, Hoods are cosmetic only.' }));
      return;
    }
    const r = RARITIES.find((x) => x.id === hd.rarity)!;
    const owned = s.hoods.owned.includes(hd.id);
    const eq = s.hoods.equipped === hd.id;
    const action = eq
      ? woodButton('UNEQUIP', { size: 'small', sound: 'hoodEquip', onActivate: () => this.equip(null) })
      : owned
        ? woodButton('EQUIP', { variant: 'green', sound: 'hoodEquip', onActivate: () => this.equip(hd) })
        : woodButton(`BUY · ${hd.price}`, { variant: 'gold', icon: currencyIcon('shards', 24), sound: 'chaChing', disabled: this.app.wallet.balance('shards') < hd.price, disabledReason: `You need ${hd.price} Icicle Shards (earn them from quests and Daily Popsicles).`, onActivate: () => this.buy(hd) });
    this.detail.replaceChildren(
      penguinPreview(s.waddles.selected, hd.id, 92),
      h('div', { class: 'hd-text' },
        h('div', { class: 'hd-name', text: hd.name }),
        h('div', { class: 'hd-rarity', style: { '--rc': r.color }, text: r.name }),
        h('div', { class: 'hd-ability' }, h('b', { text: `${FAMILY_BY_ID[hd.family].label}: ` }), describeHood(hd)),
        h('div', { class: 'hd-actions' }, action, iceButton('PREVIEW ON PENGUIN', { class: 'small', sound: 'clickSoft', onActivate: () => this.wiggle() })),
      ),
    );
  }

  private wiggle(): void {
    const p = this.detail.querySelector('.peng-preview');
    p?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(0)' }], { duration: 500 });
  }

  private equip(hd: HoodDef | null): void {
    this.app.save.mutate((s) => { s.hoods.equipped = hd ? hd.id : null; }, { immediate: true });
    if (hd) this.app.quests.track('hoodsEquipped', 1);
    this.wiggle();
  }

  private buy(hd: HoodDef): void {
    const ok = this.app.wallet.spend(`hood:${hd.id}`, { shards: hd.price }, (s) => { if (!s.hoods.owned.includes(hd.id)) s.hoods.owned.push(hd.id); });
    if (!ok) {
      this.router.toast(this.app.save.data.hoods.owned.includes(hd.id) ? 'Already in your closet!' : 'Not enough Icicle Shards.');
      return;
    }
    this.app.quests.track('hoodsBought', 1);
    this.router.toast(`${hd.name} acquired!`);
    this.renderTabs();
  }
}
