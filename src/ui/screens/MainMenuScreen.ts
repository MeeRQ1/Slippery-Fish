/**
 * Main Menu — Batch 5 environment behind, the canonical logo on top, the
 * identity plaque top-left, currencies top-right, and the twelve Batch 6
 * object buttons arranged around the hero igloo.
 */
import { APP_VERSION } from '../../config/versions';
import { IdentityPlaque } from '../components/identity';
import { CurrencyBar } from '../components/currency';
import { objectButton } from '../components/buttons';
import { h, sprite } from '../dom';
import { Screen } from '../screen';

interface MenuEntry { key: string; art: string; label: string; go: () => void; badge?: () => string | null }

export class MainMenuScreen extends Screen {
  readonly id = 'menu';
  override hash = '';

  build(): void {
    this.el.className = 'screen menu-screen';
    const r = this.router;
    const plaque = new IdentityPlaque(this.app.save, () => void r.go('profile'));
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => plaque.destroy());
    this.d.add(() => bar.destroy());
    const quests = this.app.quests;
    const modes: MenuEntry[] = [
      { key: 'adventure', art: 'btn_main_adventure', label: 'Adventure Map', go: () => void r.go('adventure') },
      { key: 'daily', art: 'btn_main_daily', label: 'Daily Challenge', go: () => void r.go('daily') },
      { key: 'infinite', art: 'btn_main_infinite', label: 'Infinite', go: () => void r.go('infinite') },
      { key: 'ranked', art: 'btn_main_ranked', label: 'Ranked', go: () => void r.go('ranked') },
    ];
    const custom: MenuEntry[] = [
      { key: 'waddle', art: 'btn_main_waddle', label: 'Choose Your Waddle', go: () => void r.go('waddle') },
      { key: 'hoods', art: 'btn_main_hoods', label: 'Hoods', go: () => void r.go('hoods') },
      { key: 'quests', art: 'btn_main_quests', label: 'Quests', go: () => void r.go('quests'), badge: () => { const n = quests.claimableCount(); return n > 0 ? String(n) : null; } },
      { key: 'treasure', art: 'btn_main_treasure', label: 'Treasure Chests', go: () => void r.go('chests'), badge: () => { const inv = Object.values(this.app.save.data.chests.inventory).reduce((a, b) => a + b, 0); return inv > 0 ? String(inv) : null; } },
    ];
    const extras: MenuEntry[] = [
      { key: 'purchases', art: 'btn_main_purchases', label: 'Purchases', go: () => void r.go('store') },
      { key: 'watch_ads', art: 'btn_main_watch_ads', label: 'Watch Ads (Fishing)', go: () => void r.go('fishing') },
      { key: 'settings', art: 'btn_main_settings', label: 'Settings', go: () => void r.go('settings') },
      { key: 'profile', art: 'btn_main_profile', label: 'Profile', go: () => void r.go('profile') },
    ];
    const mk = (e: MenuEntry, cls: string) => {
      const b = objectButton(e.art, 'fluid', { personality: e.key, label: e.label, badge: e.badge?.() ?? null, class: cls, onActivate: e.go });
      b.dataset.pop = '';
      return b;
    };
    const logo = h('div', { class: 'menu-logo', attrs: { 'data-pop': '' } }, sprite('ui_logo', { width: 360, alt: 'Slippery Fish' }));
    const storageChip = this.app.save.storageKind === 'memory'
      ? h('span', { class: 'chip warn', text: '⚠ Progress is not being saved (browser storage blocked)' })
      : h('span', { class: 'chip', text: 'Local save on this device' });
    this.el.append(
      h('div', { class: 'menu-top' }, plaque.el, bar.el),
      logo,
      h('nav', { class: 'menu-col menu-modes', attrs: { 'aria-label': 'Game modes' } }, ...modes.map((e) => mk(e, 'menu-btn big'))),
      h('nav', { class: 'menu-col menu-custom', attrs: { 'aria-label': 'Customise and rewards' } }, ...custom.map((e) => mk(e, 'menu-btn big'))),
      h('nav', { class: 'menu-row menu-extras', attrs: { 'aria-label': 'More' } }, ...extras.map((e) => mk(e, 'menu-btn small'))),
      h('div', { class: 'menu-foot' }, storageChip, h('span', { class: 'chip off', text: `v${APP_VERSION}` })),
    );
    // Gentle idle bob on the logo.
    logo.classList.add('bob');
  }
}
