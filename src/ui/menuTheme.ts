/**
 * MenuThemeController — the single source of the current menu season and
 * lighting phase for menu UI (DOM) and the menu backdrop scene.
 *
 * - Auto values come from src/config/menuTheme.ts rules; Settings can pin a
 *   season and/or lighting (explicit visual preference wins for display).
 *   The pet's routines always follow the real local clock (documented).
 * - Re-evaluated when the page resumes and on a gentle 5-minute check; a
 *   change is applied as a smooth crossfade and never closes or rebuilds an
 *   open submenu.
 * - Written to <html data-season data-daynight> for CSS. Gameplay screens are
 *   excluded by CSS scope (.play-screen never uses menu-season rules) and the
 *   gameplay scene never reads this controller.
 */
import { Emitter } from '../core/events';
import { dayPhaseFor, seasonFor, DAY_PHASES, MENU_SEASONS, type DayPhase, type MenuSeason } from '../config/menuTheme';
import type { SettingsStore } from '../save/settings';

export interface MenuThemeState {
  season: MenuSeason;
  phase: DayPhase;
  /** Whether each value is automatic (true) or pinned in Settings / dev preview. */
  autoSeason: boolean;
  autoPhase: boolean;
}

export class MenuThemeController {
  readonly changes = new Emitter<{ change: MenuThemeState }>();
  private state: MenuThemeState;
  private preview: { season?: MenuSeason; phase?: DayPhase } = {};
  private timer = 0;

  constructor(private settings: SettingsStore, private now: () => Date = () => new Date()) {
    this.state = this.compute();
    this.apply();
    settings.changes.on('change', () => this.refresh());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
    window.addEventListener('pageshow', () => this.refresh());
    this.timer = window.setInterval(() => this.refresh(), 5 * 60 * 1000);
  }

  get current(): Readonly<MenuThemeState> {
    return this.state;
  }

  /** Development preview: temporarily force a season/phase (not persisted). */
  setPreview(p: { season?: MenuSeason; phase?: DayPhase }): void {
    this.preview = p;
    this.refresh();
  }

  private compute(): MenuThemeState {
    const s = this.settings.get();
    const d = this.now();
    const pinnedSeason = this.preview.season ?? (MENU_SEASONS.includes(s.menuSeason as MenuSeason) ? (s.menuSeason as MenuSeason) : undefined);
    const pinnedPhase = this.preview.phase ?? (DAY_PHASES.includes(s.menuDayNight as DayPhase) ? (s.menuDayNight as DayPhase) : undefined);
    return { season: pinnedSeason ?? seasonFor(d), phase: pinnedPhase ?? dayPhaseFor(d), autoSeason: !pinnedSeason, autoPhase: !pinnedPhase };
  }

  refresh(): void {
    const next = this.compute();
    if (next.season === this.state.season && next.phase === this.state.phase && next.autoSeason === this.state.autoSeason && next.autoPhase === this.state.autoPhase) return;
    this.state = next;
    this.apply();
    this.changes.emit('change', next);
  }

  private apply(): void {
    const root = document.documentElement;
    root.setAttribute('data-season', this.state.season);
    root.setAttribute('data-daynight', this.state.phase);
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }
}
