/**
 * Adventure — a roadmap through the 16 regions (800 levels).
 *
 * A horizontally scrolling world: each 50-level region is a panel with its
 * own sky, terrain, floor texture, landmarks (picked from that region's
 * decoration pool) and weather; neighbouring panels blend into each other so
 * scrolling feels like travelling. A winding trail connects the level nodes;
 * milestone chests sit on the trail after every 10th level.
 *
 *  - Only the regions near the viewport are mounted (virtualized).
 *  - Region art comes from campaign content and is year-round: the menu
 *    season/day-night never applies here.
 *  - Tapping a node SELECTS it (no accidental launches); PLAY or a second
 *    tap on the selected node starts it. Arrow keys move the selection.
 *  - The current level carries your penguin; "Back to my level" returns.
 *  - Scroll position / selection are restored when you come back.
 */
import { CHEST_TIERS, roadmapChest } from '../../config/economy';
import { REGIONS, LEVELS_PER_REGION, ADVENTURE_LEVEL_COUNT, regionForAdventureLevel, type RegionDef } from '../../config/regions';
import { CONTENT_VERSION, GENERATOR_VERSION } from '../../config/versions';
import { LEVEL_MODIFIERS } from '../../gameplay/levelModifiers';
import { decorPool } from '../../core/assets';
import { formatTime } from '../../core/format';
import { Rng } from '../../core/rng';
import { adventureLevel } from '../../levels/adventure';
import { drawPaperStar } from '../../art/procedural';
import { adventureDriver } from '../../progression/drivers';
import { claimRoadmapChest, roadmapChestReward, roadmapChestState } from '../../progression/roadmap';
import { waddleFrame } from '../../profile/waddles';
import { bestTimeKey } from '../../save/schema';
import { CurrencyBar, currencyIcon } from '../components/currency';
import { iceButton, makePhysical, woodButton } from '../components/buttons';
import { clear, h, sprite } from '../dom';
import { Screen } from '../screen';
import type { App } from '../../app';
import type { Router } from '../router';
import type { ScreenParams } from '../screen';

const NODE_DX = 96;
const REGION_PAD = 220;
const REGION_W = REGION_PAD + LEVELS_PER_REGION * NODE_DX + 40;
const WORLD_W = REGION_W * REGIONS.length;

let starCache: { on: string; off: string } | null = null;
function starUrls(): { on: string; off: string } {
  if (!starCache) starCache = { on: drawPaperStar(11, 28, true).toDataURL(), off: drawPaperStar(12, 28, false).toDataURL() };
  return starCache;
}

/** Remembered between visits in this session (exact scroll), plus the saved lastViewed level. */
let rememberedScroll: number | null = null;

export function levelX(n: number): number {
  const r = Math.floor((n - 1) / LEVELS_PER_REGION);
  return r * REGION_W + REGION_PAD + ((n - 1) % LEVELS_PER_REGION) * NODE_DX + NODE_DX / 2;
}

/** Normalized (0–1) vertical position of a level on the winding trail. */
export function levelY(n: number): number {
  const r = Math.floor((n - 1) / LEVELS_PER_REGION);
  const y = 0.52 + 0.2 * Math.sin(n * 0.37 + r * 1.9) + 0.07 * Math.sin(n * 1.21 + r);
  return Math.min(0.78, Math.max(0.28, y));
}

function chestPos(level: number): { x: number; y: number } {
  const n = Math.min(ADVENTURE_LEVEL_COUNT, level);
  const next = Math.min(ADVENTURE_LEVEL_COUNT, n + 1);
  const x = n === ADVENTURE_LEVEL_COUNT ? levelX(n) + NODE_DX * 0.75 : (levelX(n) + levelX(next)) / 2;
  const y = n === next ? levelY(n) : (levelY(n) + levelY(next)) / 2;
  return { x, y: y > 0.5 ? y - 0.16 : y + 0.16 };
}

function regionSky(r: RegionDef): [string, string] {
  if (r.nightTint > 0.2 || r.id === 'aurora' || r.id === 'arctic_night') return ['#0d1638', '#3a4f8c'];
  const by: Partial<Record<string, [string, string]>> = {
    spring_thaw: ['#8ec9f4', '#f6e3f0'], beach: ['#43aef0', '#cfefff'], summer: ['#3fa8f0', '#d8f4ff'], fall: ['#7fb2e0', '#ffe0bc'],
    ice_cream: ['#9fd8ff', '#ffe6f2'], candy_snow: ['#b8c8ff', '#ffe0f2'], blizzard: ['#9fb3c9', '#e6eef6'], glacier_caves: ['#6f9fd6', '#d6ecff'],
    festival: ['#ff9f7a', '#ffe0a8'], crystal_ice: ['#8fd0f5', '#eaf8ff'], mastery: ['#5a4a9e', '#f2b8d8'],
  };
  return by[r.id] ?? ['#6fb7ee', '#d6effb'];
}

export class AdventureScreen extends Screen {
  readonly id = 'adventure';
  override hash = 'adventure';
  override music = 'adventure' as const;
  override backdrop = { mode: 'plain' as const };
  private hard = false;
  private viewport!: HTMLElement;
  private world!: HTMLElement;
  private panels = new Map<number, HTMLElement>();
  private selected: number;
  private regionLabel!: HTMLElement;
  private info!: HTMLElement;
  private backBtn!: HTMLElement;
  private weather!: HTMLElement;
  private shownRegion = -1;
  private scrollRaf = 0;
  private popover: HTMLElement | null = null;
  private drag: { x: number; left: number; moved: boolean } | null = null;

  constructor(app: App, router: Router, params: ScreenParams) {
    super(app, router, params);
    const s = app.save.data;
    const cur = Math.min(ADVENTURE_LEVEL_COUNT, s.adventure.highestUnlocked);
    this.selected = typeof params.focus === 'number' ? Math.max(1, Math.min(cur, params.focus)) : Math.min(cur, s.adventure.lastViewed || cur);
  }

  private get current(): number {
    return Math.min(ADVENTURE_LEVEL_COUNT, this.app.save.data.adventure.highestUnlocked);
  }

  build(): void {
    this.el.className = 'screen roadmap-screen';
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    this.regionLabel = h('div', { class: 'rm-region', attrs: { 'aria-live': 'polite' } });
    this.world = h('div', { class: 'rm-world', style: { width: `${WORLD_W}px` } });
    this.viewport = h('div', { class: 'rm-viewport', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Adventure route. Use the arrow keys to choose a level and Enter to play.' } }, this.world);
    this.weather = h('div', { class: 'rm-weather', attrs: { 'aria-hidden': 'true' } });
    this.info = h('div', { class: 'rm-info' });
    const hardBtn = iceButton('HARD: OFF', { class: 'hard-toggle small', sound: 'ranked', onActivate: () => {
      this.hard = !this.hard;
      hardBtn.querySelector('span')!.textContent = `HARD: ${this.hard ? 'ON' : 'OFF'}`;
      hardBtn.classList.toggle('selected', this.hard);
      this.remountAll();
      this.renderInfo();
    } });
    this.backBtn = iceButton('↩ Back to my level', { class: 'rm-return small', sound: 'clickSoft', onActivate: () => this.scrollToLevel(this.current, true, true) });
    this.el.append(
      this.viewport,
      this.weather,
      h('div', { class: 'rm-top' },
        woodButton('BACK', { size: 'small', sound: 'back', onActivate: () => void this.router.go('menu') }),
        this.regionLabel,
        bar.el),
      h('div', { class: 'rm-bottom' }, h('div', { class: 'rm-left' }, hardBtn, h('span', { class: 'chip', text: `${Object.keys(this.app.save.data.adventure.stars).length} / ${ADVENTURE_LEVEL_COUNT} cleared` })), this.info, this.backBtn),
    );
    this.viewport.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.viewport.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.viewport.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    this.viewport.addEventListener('keydown', (e) => this.onKey(e));
    // Mouse drag-to-scroll (touch uses native panning).
    this.viewport.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      this.drag = { x: e.clientX, left: this.viewport.scrollLeft, moved: false };
    });
    this.d.listen(window, 'pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      if (Math.abs(dx) > 6) this.drag.moved = true;
      if (this.drag.moved) this.viewport.scrollLeft = this.drag.left - dx;
    });
    this.d.listen(window, 'pointerup', () => { setTimeout(() => { this.drag = null; }, 0); });
    this.d.add(this.app.save.changes.on('change', () => this.renderInfo()));
    this.d.add(() => { if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf); });
    // Initial position: remembered scroll, else centre the selected level.
    requestAnimationFrame(() => {
      if (rememberedScroll !== null && this.params.focus === undefined) this.viewport.scrollLeft = rememberedScroll;
      else this.scrollToLevel(this.selected, false, false);
      this.onScroll();
      this.renderInfo();
    });
  }

  override destroy(): void {
    rememberedScroll = this.viewport?.scrollLeft ?? null;
    if (this.app.save.data.adventure.lastViewed !== this.selected) this.app.save.mutate((s) => { s.adventure.lastViewed = this.selected; });
    super.destroy();
  }

  // ------------------------------------------------------------------ scrolling & virtualization

  private scrollToLevel(n: number, smooth: boolean, select: boolean): void {
    if (select) this.select(n, false);
    const target = Math.max(0, levelX(n) - this.viewport.clientWidth / 2);
    this.viewport.scrollTo({ left: target, behavior: smooth && !this.app.settings.get().reducedMotion ? 'smooth' : 'auto' });
    if (!smooth) this.onScroll();
  }

  private onScroll(): void {
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = 0;
      const left = this.viewport.scrollLeft, vw = this.viewport.clientWidth;
      const a = Math.max(0, Math.floor((left - vw * 0.6) / REGION_W));
      const b = Math.min(REGIONS.length - 1, Math.floor((left + vw * 1.6) / REGION_W));
      for (const [r, el] of this.panels) if (r < a || r > b) { el.remove(); this.panels.delete(r); }
      for (let r = a; r <= b; r++) if (!this.panels.has(r)) this.mountRegion(r);
      const center = Math.min(REGIONS.length - 1, Math.max(0, Math.floor((left + vw / 2) / REGION_W)));
      if (center !== this.shownRegion) this.showRegion(center);
      const cx = levelX(this.current);
      this.backBtn.classList.toggle('hidden', cx > left + 40 && cx < left + vw - 40);
    });
  }

  private remountAll(): void {
    for (const el of this.panels.values()) el.remove();
    this.panels.clear();
    this.shownRegion = -1;
    this.onScroll();
  }

  private showRegion(r: number): void {
    this.shownRegion = r;
    const region = REGIONS[r]!;
    const s = this.app.save.data;
    const stars = this.hard ? s.adventure.hardStars : s.adventure.stars;
    let got = 0;
    for (let n = r * LEVELS_PER_REGION + 1; n <= (r + 1) * LEVELS_PER_REGION; n++) got += stars[String(n)] ?? 0;
    this.regionLabel.replaceChildren(
      h('span', { class: 'rm-region-num', text: String(r + 1) }),
      h('span', { class: 'rm-region-text' }, h('b', { text: region.name }), h('small', { text: region.tagline })),
      h('span', { class: 'rm-region-stars' }, h('img', { attrs: { src: starUrls().on, alt: '' } }), `${got} / ${LEVELS_PER_REGION * 5}`),
    );
    this.regionLabel.style.setProperty('--accent', region.palette.accent);
    void this.regionLabel.animate?.([{ opacity: 0.3, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
    // Region ambience (weather follows the region you are looking at).
    const kind = region.weather.kind;
    this.weather.className = `rm-weather w-${kind}`;
    if (!this.weather.childElementCount && !this.app.settings.get().reducedMotion) {
      for (let i = 0; i < 18; i++) this.weather.append(h('i', { style: { left: `${(i * 37) % 100}%`, animationDelay: `${-(i * 0.73) % 9}s`, animationDuration: `${7 + (i % 5)}s` } }));
    }
  }

  private mountRegion(r: number): void {
    const region = REGIONS[r]!;
    const next = REGIONS[r + 1] ?? region;
    const [skyA, skyB] = regionSky(region);
    const [nSkyA, nSkyB] = regionSky(next);
    const blend = `calc(100% - 520px)`;
    const panel = h('div', { class: `rm-panel r-${region.id}`, style: { left: `${r * REGION_W}px`, width: `${REGION_W}px` } });
    // sky + ground, each blending into the next region over the last 520 px
    panel.append(
      h('div', { class: 'rm-sky', style: { background: `linear-gradient(180deg, ${skyA}, ${skyB})` } }),
      h('div', { class: 'rm-sky-next', style: { background: `linear-gradient(180deg, ${nSkyA}, ${nSkyB})`, maskImage: `linear-gradient(to right, transparent ${blend}, #000 100%)`, webkitMaskImage: `linear-gradient(to right, transparent ${blend}, #000 100%)` } as Record<string, string> }),
    );
    const rng = new Rng(`roadmap:${region.id}`);
    // far hills (two depths, tinted toward the region accent), faded in/out at region edges
    const hills = h('div', { class: 'rm-hills' });
    panel.append(hills);
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 7; i++) {
        const w = rng.range(520, 900);
        const x = Math.max(0, Math.min(REGION_W - w, i * (REGION_W / 6) - rng.range(80, 200) + layer * 240));
        hills.append(h('div', { class: 'rm-hill', style: { left: `${x}px`, width: `${w}px`, height: `${layer === 0 ? rng.range(22, 32) : rng.range(12, 20)}%`,
          background: layer === 0 ? `color-mix(in srgb, ${region.palette.bankShade} 70%, ${region.palette.accent} 30%)` : region.palette.bankShade, opacity: layer === 0 ? '0.75' : '1' } }));
      }
    }
    const texOf = (rg: RegionDef) => (rg.floorTexture.startsWith('tex_') ? `url("${import.meta.env.BASE_URL}assets/images/${rg.floorTexture}.webp")` : 'none');
    const fade = `linear-gradient(to right, transparent ${blend}, #000 100%)`;
    panel.append(
      h('div', { class: 'rm-ground', style: { backgroundColor: region.palette.floor, backgroundImage: texOf(region) } }),
      h('div', { class: 'rm-ground', style: { backgroundColor: next.palette.floor, backgroundImage: texOf(next), maskImage: fade, webkitMaskImage: fade } as Record<string, string> }),
    );
    // landmarks: real decoration art from this region's pool, kept clear of the trail and nodes
    const pool = decorPool(region.id, 'outside').filter((f) => f.h >= 60);
    const H = Math.max(320, this.viewport.clientHeight || 700);
    if (pool.length) {
      for (let x = 140; x < REGION_W - 120; x += rng.range(170, 260)) {
        const f = rng.pick(pool);
        const size = rng.range(70, 130);
        const k = (x - REGION_PAD) / NODE_DX;
        const near: number[] = [];
        for (let j = Math.floor(k) - 1; j <= Math.ceil(k) + 1; j++) {
          const n = r * LEVELS_PER_REGION + 1 + j;
          if (n >= r * LEVELS_PER_REGION + 1 && n <= (r + 1) * LEVELS_PER_REGION + 1 && n <= ADVENTURE_LEVEL_COUNT) near.push(levelY(n));
        }
        if (!near.length) near.push(0.5);
        const hi = Math.min(...near), lo = Math.max(...near);
        const hFrac = (size * 1.05) / H;
        // Above the trail: bottom ≤ hi − clearance; below: top ≥ lo + clearance (bottom = top + height).
        const aboveMax = hi - 0.09, belowMin = lo + 0.1 + hFrac;
        const canAbove = aboveMax - hFrac > 0.2, canBelow = belowMin < 0.97;
        if (!canAbove && !canBelow) continue;
        const above = canAbove && (!canBelow || rng.chance(0.5));
        const bottom = above ? rng.range(Math.max(0.2 + hFrac, aboveMax - 0.08), aboveMax) : rng.range(belowMin, Math.min(0.97, belowMin + 0.1));
        const sp = sprite(f.id, { height: above ? size * 0.8 : size, class: 'rm-landmark' });
        sp.style.left = `${x}px`;
        sp.style.top = `${bottom * 100}%`;
        sp.style.transform = `translate(-50%, -100%)${rng.chance(0.5) ? ' scaleX(-1)' : ''}`;
        panel.append(sp);
      }
    }
    // region gate: signpost with the region name
    panel.append(h('div', { class: 'rm-gate', style: { left: '60px', '--accent': region.palette.accent } },
      h('div', { class: 'rm-gate-board' }, h('span', { class: 'rm-gate-num', text: `REGION ${r + 1}` }), h('b', { text: region.name })),
      h('div', { class: 'rm-gate-post' })));
    // trail (includes the link to the next region's first level)
    const first = r * LEVELS_PER_REGION + 1, last = (r + 1) * LEVELS_PER_REGION;
    const pts: string[] = [];
    if (r > 0) pts.push(`${levelX(first - 1) - r * REGION_W},${levelY(first - 1) * 100}`);
    for (let n = first; n <= Math.min(ADVENTURE_LEVEL_COUNT, last + 1); n++) pts.push(`${levelX(n) - r * REGION_W},${levelY(n) * 100}`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rm-trail');
    svg.setAttribute('viewBox', `0 0 ${REGION_W} 100`);
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const [cls, w] of [['edge', 22], ['bed', 16], ['dash', 3]] as const) {
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', pts.join(' '));
      pl.setAttribute('class', cls);
      pl.setAttribute('stroke-width', String(w));
      pl.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(pl);
    }
    panel.append(svg);
    // nodes
    const s = this.app.save.data;
    const stars = this.hard ? s.adventure.hardStars : s.adventure.stars;
    const su = starUrls();
    for (let n = first; n <= last; n++) {
      const locked = n > this.current;
      const st = stars[String(n)] ?? 0;
      const isCur = n === this.current;
      const node = h('button', {
        class: `rm-node ${locked ? 'locked' : st > 0 ? 'done' : 'open'} ${isCur ? 'current' : ''} ${st >= 5 ? 'mastered' : ''} ${n === this.selected ? 'selected' : ''} ${n % 10 === 0 ? 'milestone' : ''}`,
        attrs: { type: 'button', 'data-level': String(n), 'aria-label': `Level ${n}${locked ? ', locked' : st ? `, ${st} of 5 stars` : isCur ? ', your next level' : ''}` },
        style: { left: `${levelX(n) - r * REGION_W}px`, top: `${levelY(n) * 100}%`, '--accent': region.palette.accent },
      }, h('span', { class: 'rm-num', text: String(n) }),
      st ? h('span', { class: 'rm-stars' }, ...Array.from({ length: 5 }, (_, k) => h('img', { attrs: { src: k < st ? su.on : su.off, alt: '' } }))) : null,
      locked ? h('span', { class: 'rm-lock', attrs: { 'aria-hidden': 'true' } }) : null);
      makePhysical(node, node, { personality: 'ice', sound: locked ? 'denied' : 'click', onActivate: () => this.onNode(n) });
      panel.append(node);
      if (isCur) panel.append(this.marker(n, r));
    }
    // milestone chests on the trail
    for (let n = first; n <= last; n++) {
      const def = roadmapChest(n);
      if (!def) continue;
      const state = roadmapChestState(s, n);
      const p = chestPos(n);
      const chest = h('button', {
        class: `rm-chest ${state} ${def.kind}`,
        attrs: { type: 'button', 'aria-label': `${def.name} after level ${n}: ${state === 'claimed' ? 'claimed' : state === 'available' ? 'ready to open' : `unlocks when you clear level ${n}`}` },
        style: { left: `${p.x - r * REGION_W}px`, top: `${p.y * 100}%` },
      }, sprite(def.kind === 'region' ? 'chest_tuna_trunk' : 'chest_minnow_crate', { height: def.kind === 'region' ? 58 : 44 }), state === 'available' ? h('span', { class: 'rm-chest-glow', attrs: { 'aria-hidden': 'true' } }) : null, state === 'claimed' ? h('span', { class: 'rm-chest-check', text: '✓' }) : null);
      makePhysical(chest, chest, { personality: 'treasure', sound: 'clickSoft', onActivate: () => this.openChest(n, chest) });
      panel.append(chest);
    }
    this.world.append(panel);
    this.panels.set(r, panel);
  }

  private marker(n: number, r: number): HTMLElement {
    const m = h('div', { class: 'rm-marker', style: { left: `${levelX(n) - r * REGION_W}px`, top: `${levelY(n) * 100}%` }, attrs: { 'aria-hidden': 'true' } },
      sprite(waddleFrame(this.app.save.data.waddles.selected), { height: 52 }),
      h('span', { class: 'rm-flag', text: 'YOU ARE HERE' }));
    return m;
  }

  // ------------------------------------------------------------------ selection & info

  private onNode(n: number): void {
    if (this.drag?.moved) return;
    if (n > this.current) {
      this.router.toast(`Clear level ${n - 1} to reach level ${n}.`);
      return;
    }
    if (n === this.selected) { this.play(n); return; }
    this.select(n, true);
  }

  private select(n: number, focusNode: boolean): void {
    this.selected = n;
    for (const el of this.world.querySelectorAll('.rm-node.selected')) el.classList.remove('selected');
    const node = this.world.querySelector<HTMLElement>(`.rm-node[data-level="${n}"]`);
    node?.classList.add('selected');
    if (focusNode) node?.focus({ preventScroll: true });
    this.renderInfo();
  }

  private renderInfo(): void {
    const n = this.selected;
    const s = this.app.save.data;
    const region = regionForAdventureLevel(n);
    const stars = (this.hard ? s.adventure.hardStars : s.adventure.stars)[String(n)] ?? 0;
    const best = s.bestTimes[bestTimeKey({ mode: 'adventure', levelKey: String(n), contentVersion: CONTENT_VERSION, generatorVersion: GENERATOR_VERSION, hard: this.hard })];
    // Level twists are part of the level definition (generated once for the selected level only).
    const mods = adventureLevel(n, this.hard).modifiers;
    const su = starUrls();
    const play = woodButton(n === this.current && stars === 0 ? `PLAY LEVEL ${n}` : `PLAY ${n}`, { variant: 'green', size: 'big', sound: 'click', onActivate: () => this.play(n) });
    clear(this.info);
    this.info.append(
      h('div', { class: 'rm-info-text' },
        h('b', { text: `Level ${n} · ${region.name}${this.hard ? ' · HARD' : ''}` }),
        h('span', { class: 'rm-info-stars' }, ...Array.from({ length: 5 }, (_, k) => h('img', { attrs: { src: k < stars ? su.on : su.off, alt: '' } })), h('span', { class: 'small', text: best ? `Best ${formatTime(best)}` : 'No best time yet' })),
        mods.length ? h('span', { class: 'rm-info-mods small' }, ...mods.map((m) => h('span', { class: 'mod-chip', attrs: { title: LEVEL_MODIFIERS[m].description } }, h('b', { text: LEVEL_MODIFIERS[m].icon }), LEVEL_MODIFIERS[m].name))) : null,
      ),
      play,
    );
  }

  private play(n: number): void {
    if (n > this.current) return;
    this.selected = n;
    void this.router.go('play', { driver: adventureDriver(this.app.driverServices, n, this.hard) });
  }

  private onKey(e: KeyboardEvent): void {
    const cur = this.current;
    let n = this.selected;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = Math.min(cur, n + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = Math.max(1, n - 1);
    else if (e.key === 'Home') n = cur;
    else if (e.key === 'PageDown') n = Math.min(cur, n + 10);
    else if (e.key === 'PageUp') n = Math.max(1, n - 10);
    else if (e.key === 'Enter' && e.target === this.viewport) { this.play(n); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    this.select(n, false);
    this.scrollToLevel(n, true, false);
  }

  // ------------------------------------------------------------------ chests

  private openChest(level: number, el: HTMLElement): void {
    if (this.drag?.moved) return;
    this.popover?.remove();
    const def = roadmapChest(level)!;
    const s = this.app.save.data;
    const state = roadmapChestState(s, level);
    const reward = roadmapChestReward(s, def);
    const bonus = def.bonusChest ? CHEST_TIERS.find((c) => c.id === def.bonusChest)?.name : null;
    const items = h('div', { class: 'rm-pop-items' },
      ...(['icicles', 'shards', 'fish'] as const).filter((c) => reward[c]).map((c) => h('span', { class: 'reward-chip' }, currencyIcon(c, 22), h('b', { text: `+${reward[c]}` }))),
      bonus ? h('span', { class: 'reward-chip' }, h('b', { text: `+1 ${bonus}` })) : null);
    const close = () => { this.popover?.remove(); this.popover = null; };
    const action = state === 'available'
      ? woodButton('OPEN', { variant: 'gold', sound: 'chestJingle', onActivate: () => {
        const r = el.getBoundingClientRect();
        const res = claimRoadmapChest(this.app.save, this.app.wallet, level, { x: r.left + r.width / 2, y: r.top });
        if (res.ok) {
          this.app.quests.track('roadmapChests', 1);
          this.router.toast(`${def.name} opened!${res.bonusChest ? ` ${res.bonusChest} added to your Treasure.` : ''}`);
          void el.animate?.([{ transform: 'translate(-50%, -50%) scale(1)' }, { transform: 'translate(-50%, -50%) scale(1.35) rotate(-8deg)' }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 420 });
        }
        close();
        this.remountAll();
      } })
      : h('span', { class: 'small', text: state === 'claimed' ? 'Already opened ✓' : `Clear level ${level} to open it.` });
    this.popover = h('div', { class: 'rm-pop paper-panel', attrs: { role: 'dialog', 'aria-label': def.name } },
      h('b', { text: `${def.name} · after level ${level}` }), items, action,
      iceButton('✕', { round: true, class: 'rm-pop-close', label: 'Close', sound: 'back', onActivate: close }));
    this.el.append(this.popover);
    const r = el.getBoundingClientRect();
    this.popover.style.left = `${Math.min(window.innerWidth - 270, Math.max(10, r.left + r.width / 2 - 130))}px`;
    this.popover.style.top = `${Math.max(70, r.top - 150)}px`;
    this.popover.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }
}
