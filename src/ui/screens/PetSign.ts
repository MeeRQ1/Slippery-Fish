/**
 * Pet — hanging sign for the goldfish: live habitat, daily feeding (Fish
 * currency, never DribbleFish), the Shard benefit, care tiers and the habitat
 * customization presets (fish looks, tanks, decorations, foods).
 *
 * Economy actions call src/pet/petService.ts (idempotent, per UTC economic
 * day); the eating animation is presentation only and never gates payment
 * or rewards.
 */
import { DECOR_PRESETS, FISH_LOOKS, FOOD_PRESETS, PET_DECOR_SLOTS, PET_MAX_TIER, PET_TIERS, TANK_STYLES, petTier } from '../../config/pet';
import { formatCount, formatCountdown } from '../../core/format';
import { msUntilReset } from '../../levels/daily';
import { PetHabitat, type HabitatState } from '../../pet/habitat';
import { decorIcon, fishLookIcon, foodIcon, tankIcon } from '../../pet/icons';
import { choosePetCosmetic, collectPetBenefit, feedPet, petStatus, renamePet, upgradePet, type CosmeticKind } from '../../pet/petService';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { makePhysical, woodButton } from '../components/buttons';
import { clear, h } from '../dom';
import { SignScreen } from '../screen';

type Tab = CosmeticKind;
const TAB_LABEL: Record<Tab, string> = { looks: 'Fish looks', tanks: 'Tanks', decor: 'Decorations', foods: 'Food' };

export class PetSign extends SignScreen {
  readonly id = 'pet';
  readonly title = 'GOLDFISH';
  protected override boardClass = 'wide pet-board';
  private habitat: PetHabitat | null = null;
  private care!: HTMLElement;
  private tiers!: HTMLElement;
  private tabs!: HTMLElement;
  private grid!: HTMLElement;
  private activity!: HTMLElement;
  private tab: Tab = 'looks';
  /** Unowned preset being previewed in the tank (not saved). */
  private preview: { kind: Tab; id: string } | null = null;
  private feeding = false;

  protected buildContent(c: HTMLElement): void {
    const bar = new CurrencyBar(this.app.wallet, ['icicles', 'shards', 'fish']);
    this.d.add(() => bar.destroy());
    const canvas = h('canvas', { class: 'pet-canvas', attrs: { role: 'img', 'aria-label': 'Your goldfish in its tank' } });
    this.activity = h('div', { class: 'pet-activity small', attrs: { 'aria-live': 'polite' } });
    this.care = h('div', { class: 'pet-care paper-panel' });
    this.tiers = h('div', { class: 'pet-tiers' });
    this.tabs = h('div', { class: 'pet-tabs', attrs: { role: 'tablist' } });
    this.grid = h('div', { class: 'pet-grid', attrs: { role: 'listbox' } });
    c.append(
      h('div', { class: 'sign-toolbar' }, h('span', { class: 'muted small', text: 'Feeding uses Fish (the currency) — never the DribbleFish you play with.' }), bar.el),
      h('div', { class: 'pet-top' }, h('div', { class: 'pet-tank-wrap' }, canvas, this.activity), this.care),
      h('h3', { text: 'CARE LEVEL' }),
      this.tiers,
      h('h3', { text: 'HABITAT' }),
      this.tabs,
      this.grid,
    );
    this.habitat = new PetHabitat(canvas, () => this.habitatState(), {
      reducedMotion: () => this.app.settings.get().reducedMotion,
      quality: () => this.app.settings.get().quality,
      sound: (id) => this.app.audio.play(id),
    });
    this.habitat.start();
    this.d.add(() => this.habitat?.destroy());
    this.d.add(this.app.save.changes.on('change', () => { this.renderCare(); this.renderTiers(); this.renderGrid(); }));
    this.d.add(this.app.menuTheme.changes.on('change', () => undefined));
    this.d.interval(() => { this.activity.textContent = `${this.app.save.data.pet.name}: ${this.habitat?.activity ?? ''}`; this.renderCountdown(); }, 1000);
    this.renderCare();
    this.renderTiers();
    this.renderTabs();
    this.renderGrid();
  }

  private habitatState(): HabitatState {
    const p = this.app.save.data.pet;
    const pv = this.preview;
    const look = FISH_LOOKS.find((x) => x.id === (pv?.kind === 'looks' ? pv.id : p.look)) ?? FISH_LOOKS[0]!;
    const tank = TANK_STYLES.find((x) => x.id === (pv?.kind === 'tanks' ? pv.id : p.tank)) ?? TANK_STYLES[0]!;
    const food = FOOD_PRESETS.find((x) => x.id === (pv?.kind === 'foods' ? pv.id : p.food)) ?? FOOD_PRESETS[0]!;
    let decorIds = p.decor;
    if (pv?.kind === 'decor' && !decorIds.includes(pv.id)) decorIds = [...decorIds, pv.id].slice(-PET_DECOR_SLOTS);
    const decor = DECOR_PRESETS.filter((d) => decorIds.includes(d.id));
    return { look, tank, decor, food, tier: p.tier, night: this.app.menuTheme.current.phase === 'night', hungry: petStatus(this.app.save.data, Date.now()).status === 'notFed' };
  }

  private renderCountdown(): void {
    const el = this.care.querySelector('.pet-reset');
    if (el) el.textContent = `New day (UTC) in ${formatCountdown(msUntilReset(Date.now()))}`;
  }

  private renderCare(): void {
    const s = this.app.save.data;
    const st = petStatus(s, Date.now());
    const food = FOOD_PRESETS.find((f) => f.id === s.pet.food) ?? FOOD_PRESETS[0]!;
    clear(this.care);
    const nameInput = h('input', { class: 'sf-input pet-name', attrs: { type: 'text', value: s.pet.name, maxlength: 14, 'aria-label': 'Goldfish name', autocomplete: 'off', spellcheck: 'false' } });
    nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') nameInput.blur();
    });
    nameInput.addEventListener('change', () => { nameInput.value = renamePet(this.app.save, nameInput.value); });
    let statusText: string;
    let action: HTMLElement | null = null;
    if (st.pendingBenefit) {
      statusText = `You fed ${s.pet.name} on ${st.pendingBenefit.day} — that day's Shards are still waiting.`;
      action = woodButton(h('span', { class: 'btn-row' }, `COLLECT ${st.pendingBenefit.shards}`, currencyIcon('shards', 22)), { variant: 'gold', sound: 'questClaim', onActivate: () => this.collect() });
    } else if (st.status === 'notFed') {
      statusText = `${s.pet.name} is ready for a snack. Feeding today makes ${st.feedBenefit} Icicle Shards available.`;
      action = woodButton(h('span', { class: 'btn-row' }, `FEED · ${st.feedCost}`, currencyIcon('fish', 22)), {
        variant: 'green', size: 'big', sound: 'click', disabled: !st.canAffordFeed || this.feeding,
        disabledReason: `Feeding costs ${st.feedCost} Fish. Earn Fish from daily quests, Daily Popsicles and Adventure route chests.`,
        onActivate: () => void this.feed(),
      });
    } else if (st.status === 'benefitAvailable') {
      statusText = `${s.pet.name} is full and happy! Today's ${s.pet.fedBenefit} Shards are ready.`;
      action = woodButton(h('span', { class: 'btn-row' }, `COLLECT ${s.pet.fedBenefit}`, currencyIcon('shards', 22)), { variant: 'gold', size: 'big', sound: 'questClaim', onActivate: () => this.collect() });
    } else {
      statusText = `All done for today — ${s.pet.name} got a full belly and you got your Shards. Come back tomorrow!`;
    }
    this.care.append(
      h('div', { class: 'pet-name-row' }, h('label', { class: 'small muted', text: 'Name' }), nameInput),
      h('p', { class: 'pet-status', text: statusText }),
      h('div', { class: 'pet-food-row small' }, h('img', { attrs: { src: foodIcon(food), alt: '', width: 28, height: 24 } }), `Serving: ${food.name}`),
      action ?? h('div', { class: 'pet-done', text: '✓ Fed today' }),
      h('p', { class: 'small muted pet-rules', text: `One feeding per day (UTC). Today's cost and Shards are locked in when you feed. Missing a day costs nothing — no debt, nothing is spent automatically, and ${s.pet.name} is always fine.` }),
      h('div', { class: 'pet-reset small muted' }),
    );
    this.renderCountdown();
  }

  private async feed(): Promise<void> {
    if (this.feeding) return;
    const r = feedPet(this.app.save, this.app.wallet, Date.now(), () => this.app.quests.track('petFed', 1));
    if (!r.ok) {
      this.router.toast(r.reason === 'insufficient' ? 'Not enough Fish.' : r.reason === 'pendingFirst' ? 'Collect the waiting Shards first.' : 'Already fed today.');
      return;
    }
    // Payment + benefit availability are committed. The animation is presentation only.
    this.feeding = true;
    this.renderCare();
    await this.habitat?.feed();
    this.feeding = false;
    this.renderCare();
  }

  private collect(): void {
    const btn = this.care.querySelector('button');
    const r = btn?.getBoundingClientRect();
    const n = collectPetBenefit(this.app.save, this.app.wallet, Date.now(), r ? { x: r.left + r.width / 2, y: r.top } : undefined);
    if (n > 0) this.router.toast(`+${n} Icicle Shards from ${this.app.save.data.pet.name}!`);
    this.renderCare();
  }

  private renderTiers(): void {
    const s = this.app.save.data;
    const cur = s.pet.tier;
    const st = petStatus(s, Date.now());
    clear(this.tiers);
    const table = h('div', { class: 'tier-table', attrs: { role: 'table', 'aria-label': 'Care levels' } },
      h('div', { class: 'tier-row head', attrs: { role: 'row' } }, ...['Level', 'Feed cost / day', 'Shards / day', 'Upgrade', 'Habitat perk'].map((t) => h('span', { attrs: { role: 'columnheader' }, text: t }))));
    for (const t of PET_TIERS) {
      const state = t.tier < cur ? 'past' : t.tier === cur ? 'current' : t.tier === cur + 1 ? 'next' : 'future';
      table.append(h('div', { class: `tier-row ${state}`, attrs: { role: 'row' } },
        h('span', { attrs: { role: 'cell' } }, h('b', { text: `${t.tier}. ${t.name}` }), state === 'current' ? h('em', { text: ' (yours)' }) : null),
        h('span', { attrs: { role: 'cell' } }, `${t.feedCost} `, currencyIcon('fish', 16)),
        h('span', { attrs: { role: 'cell' } }, `${t.dailyShards} `, currencyIcon('shards', 16)),
        h('span', { attrs: { role: 'cell' } }, t.upgradePrice ? h('span', {}, `${formatCount(t.upgradePrice)} `, currencyIcon('icicles', 16)) : '—'),
        h('span', { class: 'small', attrs: { role: 'cell' }, text: t.perk }),
      ));
    }
    this.tiers.append(table);
    if (cur < PET_MAX_TIER) {
      const next = petTier(cur + 1);
      const fedToday = st.status !== 'notFed';
      this.tiers.append(h('div', { class: 'tier-next' },
        h('p', { class: 'small', text: `Next: ${next.name} — feeding costs ${next.feedCost} Fish and makes ${next.dailyShards} Shards available each day (now ${petTier(cur).feedCost} → ${petTier(cur).dailyShards}).${fedToday ? ' You already fed today, so the new level starts with tomorrow\'s feeding — no extra charge today.' : ' Upgrade before feeding to use it today.'}` }),
        woodButton(h('span', { class: 'btn-row' }, `UPGRADE · ${formatCount(next.upgradePrice)}`, currencyIcon('icicles', 20)), {
          variant: 'gold', sound: 'chaChing', disabled: s.wallet.icicles < next.upgradePrice,
          disabledReason: `You need ${formatCount(next.upgradePrice)} Icicles.`,
          onActivate: () => {
            const r = upgradePet(this.app.save, this.app.wallet, Date.now());
            if (r.ok) this.router.toast(`${r.tier.name}! ${r.appliesToday ? 'Applies to today\'s feeding.' : 'Starts with tomorrow\'s feeding.'}`);
          },
        })));
    } else this.tiers.append(h('p', { class: 'small muted', text: 'Top care level reached — your goldfish wears the crown.' }));
  }

  private renderTabs(): void {
    clear(this.tabs);
    for (const t of Object.keys(TAB_LABEL) as Tab[]) {
      const b = h('button', { class: `pet-tab ${t === this.tab ? 'active' : ''}`, attrs: { type: 'button', role: 'tab', 'aria-selected': t === this.tab ? 'true' : 'false' }, text: TAB_LABEL[t] });
      makePhysical(b, b, { personality: 'ice', sound: 'clickSoft', onActivate: () => { this.tab = t; this.preview = null; this.renderTabs(); this.renderGrid(); } });
      this.tabs.append(b);
    }
  }

  private renderGrid(): void {
    const s = this.app.save.data;
    clear(this.grid);
    const kind = this.tab;
    const items: Array<{ id: string; name: string; price: number; icon: string; note?: string }> =
      kind === 'looks' ? FISH_LOOKS.map((x) => ({ id: x.id, name: x.name, price: x.price, icon: fishLookIcon(x) }))
        : kind === 'tanks' ? TANK_STYLES.map((x) => ({ id: x.id, name: x.name, price: x.price, icon: tankIcon(x) }))
          : kind === 'decor' ? DECOR_PRESETS.map((x) => ({ id: x.id, name: x.name, price: x.price, icon: decorIcon(x) }))
            : FOOD_PRESETS.map((x) => ({ id: x.id, name: x.name, price: x.price, icon: foodIcon(x), note: x.description }));
    const selected = (id: string) => (kind === 'looks' ? s.pet.look === id : kind === 'tanks' ? s.pet.tank === id : kind === 'foods' ? s.pet.food === id : s.pet.decor.includes(id));
    if (kind === 'decor') this.grid.append(h('p', { class: 'small muted pet-grid-note', text: `Show up to ${PET_DECOR_SLOTS} decorations. Tap a shown one again to put it away.` }));
    if (kind === 'foods') this.grid.append(h('p', { class: 'small muted pet-grid-note', text: 'Every food has exactly the same feeding effect and cost — only the look changes.' }));
    for (const it of items) {
      const owned = s.pet.owned[kind].includes(it.id);
      const on = selected(it.id);
      const previewing = this.preview?.kind === kind && this.preview.id === it.id;
      const card = h('div', { class: `pet-card ${on ? 'on' : ''} ${owned ? 'owned' : 'locked'} ${previewing ? 'previewing' : ''}`, attrs: { role: 'option', 'aria-selected': on ? 'true' : 'false', tabindex: '0', 'aria-label': `${it.name}${owned ? (on ? ', in use' : ', owned') : `, ${it.price} Icicles`}` } },
        h('img', { class: 'pc-art', attrs: { src: it.icon, alt: '', draggable: 'false' } }),
        h('span', { class: 'pc-name', text: it.name }),
        it.note ? h('span', { class: 'pc-note small muted', text: it.note }) : null,
        owned ? h('span', { class: 'pc-tag', text: on ? 'IN USE' : it.price === 0 ? 'FREE' : 'OWNED' }) : h('span', { class: 'pc-price' }, currencyIcon('icicles', 14), formatCount(it.price)),
      );
      if (previewing && !owned) {
        card.append(woodButton(`BUY · ${formatCount(it.price)}`, {
          size: 'small', variant: 'gold', sound: 'chaChing', disabled: s.wallet.icicles < it.price, disabledReason: `You need ${formatCount(it.price)} Icicles.`,
          onActivate: () => {
            const r = choosePetCosmetic(this.app.save, this.app.wallet, kind, it.id);
            if (r === 'bought') { this.preview = null; this.router.toast(`${it.name} added to your habitat!`); }
            else if (r === 'insufficient') this.router.toast('Not enough Icicles.');
          },
        }));
      }
      makePhysical(card, card, {
        personality: 'ice', sound: 'clickSoft',
        onActivate: () => {
          if (owned) {
            this.preview = null;
            choosePetCosmetic(this.app.save, this.app.wallet, kind, it.id);
          } else {
            this.preview = { kind, id: it.id };
            this.renderGrid();
          }
        },
      });
      this.grid.append(card);
    }
  }
}
