/**
 * Main Menu — a living, populated menu world (menu backdrop behind):
 *
 *  - top: identity plaque (icon, name, equipped title) and grouped currencies
 *  - centre: the hero igloo with your penguin (wearing its Hood) and the
 *    dominant CONTINUE action, plus small next-action notes (only real,
 *    actionable states: Daily progress, quests ready, route chests)
 *  - left: game modes with live info (Adventure, Daily, Infinite, Ranked)
 *  - right: customization & rewards (Waddle, Hoods, Quests, Treasure)
 *  - bottom: quieter utilities (Purchases, Watch Ads, Settings, Profile)
 *  - the pet goldfish's tank sits in the scene beside the pond
 *
 * Badges appear only for real actionable states (claimable quests, chests in
 * the inventory, a route chest waiting). No startup promotions.
 */
import { DAILY_LEVELS } from '../../levels/daily';
import { ADVENTURE_CHEST_EVERY, roadmapChest } from '../../config/economy';
import { DECOR_PRESETS, FISH_LOOKS, FOOD_PRESETS, TANK_STYLES } from '../../config/pet';
import { DAY_PHASES, MENU_SEASONS, type DayPhase, type MenuSeason } from '../../config/menuTheme';
import { regionForAdventureLevel } from '../../config/regions';
import { APP_VERSION } from '../../config/versions';
import { PetHabitat } from '../../pet/habitat';
import { petStatus } from '../../pet/petService';
import { adventureDriver, syncDailyCycle } from '../../progression/drivers';
import { HOOD_BY_ID } from '../../progression/hoods';
import { availableRoadmapChests } from '../../progression/roadmap';
import { WADDLE_BY_ID } from '../../profile/waddles';
import { IdentityPlaque } from '../components/identity';
import { CurrencyBar } from '../components/currency';
import { makePhysical, objectButton } from '../components/buttons';
import { penguinPreview } from '../components/preview';
import { h, sprite } from '../dom';
import { Screen } from '../screen';

interface MenuEntry { key: string; art: string; label: string; go: () => void; badge?: () => string | null; info?: () => { text: string; hot?: boolean } | null }

export class MainMenuScreen extends Screen {
  readonly id = 'menu';
  override hash = '';
  private habitat: PetHabitat | null = null;

  build(): void {
    this.el.className = 'screen menu-screen living';
    const r = this.router;
    const s = () => this.app.save.data;
    const plaque = new IdentityPlaque(this.app.save, () => void r.go('profile'));
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => plaque.destroy());
    this.d.add(() => bar.destroy());
    const quests = this.app.quests;
    syncDailyCycle(this.app.driverServices);
    const daily = { done: new Set([...s().daily.completed, ...s().daily.completedHard]).size };
    const modes: MenuEntry[] = [
      { key: 'adventure', art: 'btn_main_adventure', label: 'Adventure Map', go: () => void r.go('adventure'), info: () => ({ text: `${Object.keys(s().adventure.stars).length} / 800` }), badge: () => (availableRoadmapChests(s()).length ? '!' : null) },
      { key: 'daily', art: 'btn_main_daily', label: 'Daily Challenge', go: () => void r.go('daily'), info: () => ({ text: `${daily.done} / ${DAILY_LEVELS} today`, hot: daily.done === 0 }) },
      { key: 'infinite', art: 'btn_main_infinite', label: 'Infinite', go: () => void r.go('infinite'), info: () => (s().infinite.highestLevel ? { text: `Best: ${s().infinite.highestLevel}` } : null) },
      { key: 'ranked', art: 'btn_main_ranked', label: 'Ranked', go: () => void r.go('ranked'), info: () => ({ text: this.app.ranked.status().state === 'ready' ? 'Online' : 'Practice' }) },
    ];
    const custom: MenuEntry[] = [
      { key: 'waddle', art: 'btn_main_waddle', label: 'Choose Your Waddle', go: () => void r.go('waddle'), info: () => ({ text: WADDLE_BY_ID[s().waddles.selected]?.name ?? 'Classic' }) },
      { key: 'hoods', art: 'btn_main_hoods', label: 'Hoods', go: () => void r.go('hoods'), info: () => { const hd = s().hoods.equipped ? HOOD_BY_ID[s().hoods.equipped!] : undefined; return { text: hd ? hd.name : 'None equipped' }; } },
      { key: 'quests', art: 'btn_main_quests', label: 'Quests', go: () => void r.go('quests'), badge: () => { const n = quests.claimableCount(); return n > 0 ? String(n) : null; } },
      { key: 'treasure', art: 'btn_main_treasure', label: 'Treasure Chests', go: () => void r.go('chests'), badge: () => { const inv = Object.values(s().chests.inventory).reduce((a, b) => a + b, 0); return inv > 0 ? String(inv) : null; } },
    ];
    const extras: MenuEntry[] = [
      { key: 'purchases', art: 'btn_main_purchases', label: 'Purchases', go: () => void r.go('store') },
      { key: 'watch_ads', art: 'btn_main_watch_ads', label: 'Watch Ads (Fishing)', go: () => void r.go('fishing') },
      { key: 'settings', art: 'btn_main_settings', label: 'Settings', go: () => void r.go('settings') },
      { key: 'profile', art: 'btn_main_profile', label: 'Profile', go: () => void r.go('profile') },
    ];
    const mk = (e: MenuEntry, cls: string) => {
      const b = objectButton(e.art, 'fluid', { personality: e.key, label: e.label, badge: e.badge?.() ?? null, class: cls, onActivate: e.go });
      const info = e.info?.();
      const wrap = h('div', { class: 'mode-card', attrs: { 'data-pop': '' } }, b, info ? h('span', { class: `mode-info ${info.hot ? 'hot' : ''}`, text: info.text }) : null);
      if (info) b.setAttribute('aria-label', `${e.label} — ${info.text}`);
      return wrap;
    };
    const logo = h('div', { class: 'menu-logo', attrs: { 'data-pop': '' } }, sprite('ui_logo', { width: 330, alt: 'Slippery Fish' }));
    const storageChip = this.app.save.storageKind === 'memory'
      ? h('span', { class: 'chip warn', text: '⚠ Progress is not being saved (browser storage blocked)' })
      : h('span', { class: 'chip', text: 'Local save on this device' });

    this.el.append(
      h('div', { class: 'lm-top' }, plaque.el, bar.el),
      logo,
      this.hero(),
      h('nav', { class: 'lm-left menu-modes', attrs: { 'aria-label': 'Game modes' } }, ...modes.map((e, i) => mk(e, `menu-btn ${i < 2 ? 'big' : 'medium'}`))),
      h('nav', { class: 'lm-right menu-custom', attrs: { 'aria-label': 'Customise and rewards' } }, ...custom.map((e) => mk(e, 'menu-btn medium'))),
      this.center(daily),
      this.pet(),
      h('nav', { class: 'lm-bottom menu-extras', attrs: { 'aria-label': 'More' } }, ...extras.map((e) => mk(e, 'menu-btn small'))),
      h('div', { class: 'menu-foot' }, storageChip, h('span', { class: 'chip off', text: `v${APP_VERSION}` })),
    );
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('themePreview')) this.el.append(this.themePreview());
    logo.classList.add('bob');
  }

  /** The dominant play action + honest next-action notes. */
  private center(daily: { done: number }): HTMLElement {
    const s = this.app.save.data;
    const next = Math.min(800, s.adventure.highestUnlocked);
    const fresh = Object.keys(s.adventure.stars).length === 0;
    const region = regionForAdventureLevel(next);
    const cta = h('button', { class: 'play-cta', attrs: { type: 'button', 'aria-label': fresh ? 'Start the Adventure at level 1' : `Continue Adventure: level ${next}, ${region.name}` } },
      h('span', { class: 'cta-snow', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'cta-ico', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'cta-text' }, h('span', { class: 'cta-main', text: fresh ? 'PLAY' : 'CONTINUE' }), h('span', { class: 'cta-sub', text: `Level ${next} · ${region.name}` })),
    );
    makePhysical(cta, cta, { personality: 'wood', sound: 'click', onActivate: () => void this.router.go('play', { driver: adventureDriver(this.app.driverServices, next, false) }) });
    const notes = h('div', { class: 'next-notes' });
    const note = (html: Array<Node | string>, go: () => void, label: string) => {
      const b = h('button', { class: 'next-note', attrs: { type: 'button', 'aria-label': label } }, ...html);
      makePhysical(b, b, { personality: 'paper', sound: 'clickSoft', onActivate: go });
      notes.append(b);
    };
    const chests = availableRoadmapChests(s);
    if (chests.length) note([h('b', { text: '🎁' }), `Route chest ready (Level ${chests[0]})`], () => void this.router.go('adventure', { focus: chests[0] }), 'Open the route chest on the Adventure map');
    else {
      const upcoming = Math.ceil(next / ADVENTURE_CHEST_EVERY) * ADVENTURE_CHEST_EVERY;
      const def = roadmapChest(upcoming);
      if (def) note([h('b', { text: '🎁' }), `${def.kind === 'region' ? 'Region Treasure' : 'Next chest'}: Level ${upcoming}`], () => void this.router.go('adventure', { focus: upcoming }), `Next route chest at level ${upcoming}`);
    }
    if (s.tutorial.lessonsDone.length === 0 && Object.keys(s.adventure.stars).length < 15) note([h('b', { text: '⛸' }), 'New here? Training Rink'], () => void this.router.go('training'), 'Open the optional Training Rink tutorial');
    const q = this.app.quests.claimableCount();
    if (q > 0) note([h('b', { text: '✔' }), `${q} quest reward${q > 1 ? 's' : ''} ready`], () => void this.router.go('quests'), 'Claim quest rewards');
    if (daily.done < DAILY_LEVELS) note([h('b', { text: '🍦' }), `Daily ${daily.done} / ${DAILY_LEVELS}`], () => void this.router.go('daily'), `Daily Challenge: ${daily.done} of ${DAILY_LEVELS} done today`);
    return h('div', { class: 'lm-center', attrs: { 'data-pop': '' } }, cta, notes);
  }

  /** Your penguin, wearing its Hood, beside the igloo. */
  private hero(): HTMLElement {
    const s = this.app.save.data;
    const btn = h('button', { class: 'lm-hero', attrs: { type: 'button', 'aria-label': 'Choose your Waddle' } }, penguinPreview(s.waddles.selected, s.hoods.equipped, 96));
    makePhysical(btn, btn, { personality: 'waddle', sound: 'clickSoft', onActivate: () => void this.router.go('waddle') });
    return btn;
  }

  /** The goldfish habitat, part of the menu scene. */
  private pet(): HTMLElement {
    const canvas = h('canvas', { attrs: { 'aria-hidden': 'true' } });
    const badge = h('span', { class: 'pet-badge' });
    const btn = h('button', { class: 'lm-pet', attrs: { type: 'button' } }, badge, canvas, h('div', { class: 'pet-shelf', attrs: { 'aria-hidden': 'true' } }));
    makePhysical(btn, btn, { personality: 'ice', sound: 'petBubble', onActivate: () => void this.router.go('pet') });
    const refresh = () => {
      const s = this.app.save.data;
      const st = petStatus(s, Date.now());
      const ready = st.pendingBenefit !== null || st.status === 'benefitAvailable';
      badge.textContent = ready ? `${s.pet.name}: Shards ready!` : st.status === 'notFed' ? `${s.pet.name} · snack time?` : `${s.pet.name} · fed ✓`;
      badge.classList.toggle('ready', ready || st.status === 'notFed');
      btn.setAttribute('aria-label', `Pet goldfish ${s.pet.name}: ${badge.textContent}. Open the tank.`);
    };
    refresh();
    this.d.add(this.app.save.changes.on('change', refresh));
    this.habitat = new PetHabitat(canvas, () => {
      const p = this.app.save.data.pet;
      return {
        look: FISH_LOOKS.find((x) => x.id === p.look) ?? FISH_LOOKS[0]!,
        tank: TANK_STYLES.find((x) => x.id === p.tank) ?? TANK_STYLES[0]!,
        decor: DECOR_PRESETS.filter((d) => p.decor.includes(d.id)),
        food: FOOD_PRESETS.find((x) => x.id === p.food) ?? FOOD_PRESETS[0]!,
        tier: p.tier,
        night: this.app.menuTheme.current.phase === 'night',
        hungry: petStatus(this.app.save.data, Date.now()).status === 'notFed',
      };
    }, { reducedMotion: () => this.app.settings.get().reducedMotion, quality: () => this.app.settings.get().quality });
    this.d.timeout(() => this.habitat?.start(), 0);
    this.d.add(() => this.habitat?.destroy());
    return btn;
  }

  /** Development preview of every menu season × lighting combination (dev builds or ?themePreview). */
  private themePreview(): HTMLElement {
    const box = h('div', { class: 'theme-preview', attrs: { role: 'group', 'aria-label': 'Menu theme preview (development)' } });
    let season: MenuSeason | undefined;
    let phase: DayPhase | undefined;
    const render = () => {
      box.replaceChildren(h('span', { text: 'Preview:' }));
      for (const x of [undefined, ...MENU_SEASONS]) {
        const b = h('button', { class: season === x ? 'on' : '', attrs: { type: 'button' }, text: x ?? 'auto' });
        b.addEventListener('click', () => { season = x; this.app.menuTheme.setPreview({ ...(season ? { season } : {}), ...(phase ? { phase } : {}) }); render(); });
        box.append(b);
      }
      box.append(h('span', { text: '·' }));
      for (const x of [undefined, ...DAY_PHASES]) {
        const b = h('button', { class: phase === x ? 'on' : '', attrs: { type: 'button' }, text: x ?? 'auto' });
        b.addEventListener('click', () => { phase = x; this.app.menuTheme.setPreview({ ...(season ? { season } : {}), ...(phase ? { phase } : {}) }); render(); });
        box.append(b);
      }
    };
    render();
    return box;
  }
}
