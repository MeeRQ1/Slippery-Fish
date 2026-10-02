/**
 * Adventure — full dedicated screen: 16 region tabs and the selected region's
 * 50 levels as a winding path of ice stepping stones (only one region's
 * nodes are ever in the DOM — virtualized by region). Fixed, shared
 * progression; the next level unlocks on completion.
 */
import { REGIONS, REGION_BY_ID, LEVELS_PER_REGION, type RegionId, regionForAdventureLevel } from '../../config/regions';
import { adventureDriver } from '../../progression/drivers';
import { drawPaperStar } from '../../art/procedural';
import { CurrencyBar } from '../components/currency';
import { iceButton, woodButton, makePhysical } from '../components/buttons';
import { clear, h } from '../dom';
import { Screen } from '../screen';
import { formatTime } from '../../core/format';
import { bestTimeKey } from '../../save/schema';
import { CONTENT_VERSION, GENERATOR_VERSION } from '../../config/versions';
import type { App } from '../../app';
import type { Router } from '../router';
import type { ScreenParams } from '../screen';

let starCache: { on: string; off: string } | null = null;
function starUrls(): { on: string; off: string } {
  if (!starCache) starCache = { on: drawPaperStar(11, 28, true).toDataURL(), off: drawPaperStar(12, 28, false).toDataURL() };
  return starCache;
}

export class AdventureScreen extends Screen {
  readonly id = 'adventure';
  override hash = 'adventure';
  override music = 'adventure' as const;
  private region: RegionId;
  private focus: number;
  private hard = false;
  private map!: HTMLElement;
  private header!: HTMLElement;
  private tabs!: HTMLElement;

  constructor(app: App, router: Router, params: ScreenParams) {
    super(app, router, params);
    const unlocked = app.save.data.adventure.highestUnlocked;
    this.focus = typeof params.focus === 'number' ? params.focus : unlocked;
    this.region = (params.region as RegionId | undefined) ?? regionForAdventureLevel(this.focus).id;
    this.backdrop = { mode: 'adventure', opts: { region: this.region } };
  }

  build(): void {
    this.el.className = 'screen mode-screen adventure-screen';
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    this.header = h('div', { class: 'region-header' });
    this.tabs = h('div', { class: 'region-tabs', attrs: { role: 'tablist', 'aria-label': 'Regions' } });
    this.map = h('div', { class: 'level-map', attrs: { role: 'list' } });
    const hardBtn = iceButton('HARD MODE: OFF', { class: 'hard-toggle', sound: 'ranked', onActivate: () => {
      this.hard = !this.hard;
      hardBtn.querySelector('span')!.textContent = `HARD MODE: ${this.hard ? 'ON' : 'OFF'}`;
      hardBtn.classList.toggle('selected', this.hard);
      this.renderMap();
    } });
    this.el.append(
      h('div', { class: 'mode-top' }, woodButton('BACK', { size: 'small', sound: 'back', onActivate: () => void this.router.go('menu') }), h('h1', { class: 'title-wood mode-title', text: 'ADVENTURE' }), bar.el),
      this.tabs, this.header, this.map,
      h('div', { class: 'mode-bottom' }, hardBtn, h('span', { class: 'chip', text: `${this.app.save.data.adventure.highestUnlocked - 1} / 800 levels cleared` })),
    );
    this.renderTabs();
    this.renderMap();
  }

  private renderTabs(): void {
    clear(this.tabs);
    const unlockedRegion = regionForAdventureLevel(this.app.save.data.adventure.highestUnlocked);
    const unlockedIdx = REGIONS.indexOf(unlockedRegion);
    REGIONS.forEach((r, i) => {
      const locked = i > unlockedIdx;
      const t = h('button', { class: `region-tab ${r.id === this.region ? 'active' : ''} ${locked ? 'locked' : ''}`, attrs: { type: 'button', role: 'tab', 'aria-selected': r.id === this.region ? 'true' : 'false', 'aria-label': `${r.name}${locked ? ' (locked)' : ''}` }, style: { '--accent': r.palette.accent } },
        h('span', { class: 'rt-num', text: String(i + 1) }), h('span', { class: 'rt-name', text: r.name }));
      makePhysical(t, t, { personality: 'ice', sound: locked ? 'denied' : 'clickSoft', disabledReason: 'Finish the previous region to unlock this one.', onActivate: () => {
        if (locked) { this.router.toast(`${r.name} unlocks after ${REGIONS[i - 1]!.name}.`); return; }
        this.region = r.id;
        void this.app.backdrop().setMode('adventure', { region: r.id });
        this.renderTabs();
        this.renderMap();
      } });
      if (locked) t.setAttribute('aria-disabled', 'true');
      this.tabs.append(t);
    });
    this.tabs.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  private renderMap(): void {
    const region = REGION_BY_ID[this.region];
    const idx = REGIONS.indexOf(region);
    const first = idx * LEVELS_PER_REGION + 1;
    const s = this.app.save.data;
    const unlocked = s.adventure.highestUnlocked;
    const stars = this.hard ? s.adventure.hardStars : s.adventure.stars;
    let regionStars = 0;
    for (let n = first; n < first + LEVELS_PER_REGION; n++) regionStars += stars[String(n)] ?? 0;
    this.header.replaceChildren(
      h('div', { class: 'rh-name title-wood', text: region.name }),
      h('div', { class: 'rh-tag', text: region.tagline }),
      h('div', { class: 'rh-stars' }, h('img', { attrs: { src: starUrls().on, alt: '' } }), `${regionStars} / ${LEVELS_PER_REGION * 5}`),
    );
    this.header.style.setProperty('--accent', region.palette.accent);
    clear(this.map);
    const su = starUrls();
    for (let i = 0; i < LEVELS_PER_REGION; i++) {
      const n = first + i;
      const locked = n > unlocked;
      const st = stars[String(n)] ?? 0;
      const best = s.bestTimes[bestTimeKey({ mode: 'adventure', levelKey: String(n), contentVersion: CONTENT_VERSION, generatorVersion: GENERATOR_VERSION, hard: this.hard })];
      const node = h('button', { class: `level-node ${locked ? 'locked' : ''} ${n === unlocked ? 'current' : ''} ${st >= 5 ? 'mastered' : ''}`, attrs: { type: 'button', role: 'listitem', 'aria-label': `Level ${n}${locked ? ', locked' : `, ${st} stars${best ? `, best ${formatTime(best)}` : ''}`}` }, style: { '--row': String(Math.floor(i / 10)), '--accent': region.palette.accent } },
        h('span', { class: 'ln-num', text: String(n) }),
        h('span', { class: 'ln-stars' }, ...Array.from({ length: 5 }, (_, k) => h('img', { attrs: { src: k < st ? su.on : su.off, alt: '' } }))),
        locked ? h('span', { class: 'ln-lock', text: '🔒' }) : null,
      );
      makePhysical(node, node, { personality: 'ice', sound: locked ? 'denied' : 'click', onActivate: () => {
        if (locked) { this.router.toast('Clear the previous level to unlock this one.'); return; }
        void this.router.go('play', { driver: adventureDriver(this.app.driverServices, n, this.hard) });
      } });
      this.map.append(node);
    }
    const cur = this.map.querySelector<HTMLElement>(`.level-node:nth-child(${Math.max(1, Math.min(LEVELS_PER_REGION, this.focus - first + 1))})`);
    requestAnimationFrame(() => cur?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
}
