/**
 * CHOOSE YOUR WADDLE — full screen. Preview, name, ownership, equipped state.
 * Penguins are cosmetic; gameplay silhouettes stay round and purely 2D.
 */
import { WADDLES, WADDLE_BY_ID, type WaddleDef } from '../../profile/waddles';
import { animate, SPRING, SpringTransform } from '../anim';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { makePhysical, woodButton } from '../components/buttons';
import { penguinPreview } from '../components/preview';
import { clear, h, sprite } from '../dom';
import { Screen } from '../screen';

export class WaddleScreen extends Screen {
  readonly id = 'waddle';
  override hash = 'waddle';
  override music = 'character_select' as const;
  override backdrop = { mode: 'menu' as const, opts: { dim: 0.35 } };
  private focus: string;
  private left!: HTMLElement;
  private grid!: HTMLElement;

  constructor(...args: ConstructorParameters<typeof Screen>) {
    super(...args);
    this.focus = this.app.save.data.waddles.selected;
  }

  build(): void {
    this.el.className = 'screen mode-screen waddle-screen';
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    this.left = h('div', { class: 'waddle-preview ice-panel' });
    this.grid = h('div', { class: 'waddle-grid', attrs: { role: 'listbox', 'aria-label': 'Penguins' } });
    this.el.append(
      h('div', { class: 'mode-top' }, woodButton('BACK', { size: 'small', sound: 'back', onActivate: () => void this.router.go('menu') }), h('h1', { class: 'title-wood mode-title', text: 'CHOOSE YOUR WADDLE' }), bar.el),
      h('div', { class: 'waddle-body' }, this.left, this.grid),
    );
    this.d.add(this.app.save.changes.on('change', () => this.renderGrid()));
    this.renderPreview();
    this.renderGrid();
  }

  private renderPreview(): void {
    const w = WADDLE_BY_ID[this.focus] ?? WADDLES[0]!;
    const s = this.app.save.data;
    const owned = s.waddles.owned.includes(w.id);
    const equipped = s.waddles.selected === w.id;
    const prev = penguinPreview(w.id, s.hoods.equipped, 190);
    const st = new SpringTransform(prev, SPRING.wobbly);
    st.snap({ s: 0.6 });
    st.set({ s: 1 });
    st.kick({ rot: 300 });
    const action = equipped
      ? woodButton('EQUIPPED ✓', { disabled: true, disabledReason: 'Already waddling with this one!', onActivate: () => undefined })
      : owned
        ? woodButton('EQUIP', { variant: 'green', size: 'big', sound: 'hoodEquip', onActivate: () => this.equip(w) })
        : woodButton(h('span', {}, `BUY · ${w.price.toLocaleString('en-US')}`), { variant: 'gold', size: 'big', icon: currencyIcon('icicles', 28), sound: 'chaChing', disabled: this.app.wallet.balance('icicles') < w.price, disabledReason: `You need ${w.price.toLocaleString('en-US')} Icicles.`, onActivate: () => this.buy(w) });
    this.left.replaceChildren(
      h('div', { class: 'wp-stage' }, h('div', { class: 'wp-shadow' }), prev),
      h('h2', { class: 'title-ice wp-name', text: w.name.toUpperCase() }),
      h('div', { class: 'wp-kind chip', text: w.kind === 'species' ? 'Penguin species' : 'Signature Waddle' }),
      h('p', { class: 'wp-blurb', text: w.blurb }),
      action,
      h('p', { class: 'muted small', text: 'Penguins are cosmetic — every waddle plays the same. Hoods change stats.' }),
    );
  }

  private renderGrid(): void {
    const s = this.app.save.data;
    clear(this.grid);
    const section = (title: string, list: WaddleDef[]) => {
      this.grid.append(h('h3', { class: 'grid-title', text: title }));
      const row = h('div', { class: 'waddle-cards' });
      for (const w of list) {
        const owned = s.waddles.owned.includes(w.id);
        const equipped = s.waddles.selected === w.id;
        const card = h('button', { class: `waddle-card ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''} ${w.id === this.focus ? 'focused' : ''}`, attrs: { type: 'button', role: 'option', 'aria-selected': w.id === this.focus ? 'true' : 'false', 'aria-label': `${w.name}${equipped ? ', equipped' : owned ? ', owned' : `, ${w.price} Icicles`}` } },
          h('span', { class: 'wc-art' }, sprite(w.frame, { height: 82 })),
          h('span', { class: 'wc-name', text: w.name }),
          equipped ? h('span', { class: 'wc-tag eq', text: 'EQUIPPED' }) : owned ? h('span', { class: 'wc-tag', text: 'OWNED' }) : h('span', { class: 'wc-price' }, currencyIcon('icicles', 16), w.price.toLocaleString('en-US')),
        );
        makePhysical(card, card, { personality: 'waddle', sound: 'clickSoft', onActivate: () => { this.focus = w.id; this.renderPreview(); this.renderGrid(); } });
        row.append(card);
      }
      this.grid.append(row);
    };
    section('PENGUIN SPECIES', WADDLES.filter((w) => w.kind === 'species'));
    section('SIGNATURE WADDLES', WADDLES.filter((w) => w.kind === 'outfit'));
  }

  private equip(w: WaddleDef): void {
    this.app.save.mutate((s) => { s.waddles.selected = w.id; }, { immediate: true });
    this.renderPreview();
  }

  private buy(w: WaddleDef): void {
    const ok = this.app.wallet.spend(`waddle:${w.id}`, { icicles: w.price }, (s) => {
      if (!s.waddles.owned.includes(w.id)) s.waddles.owned.push(w.id);
      s.waddles.selected = w.id;
    });
    if (!ok) {
      this.router.toast(this.app.save.data.waddles.owned.includes(w.id) ? 'Already yours!' : 'Not enough Icicles.');
      return;
    }
    this.router.toast(`${w.name} joined your colony!`);
    this.renderPreview();
    const stage = this.left.querySelector('.wp-stage');
    if (stage) void animate(stage, [{ transform: 'scale(1)' }, { transform: 'scale(1.15) rotate(-4deg)' }, { transform: 'none' }], { duration: 480, easing: 'ease-out' });
  }
}
