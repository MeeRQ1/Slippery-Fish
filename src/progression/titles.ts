/**
 * Earned titles — evaluation, unlock persistence and selection.
 *
 * `evaluateProgressTitles` reads only committed save counters, so it is safe
 * to run at load (backfill for existing saves) and after every committed
 * result/claim. `evaluateRunTitles` runs once per WON run with the run's
 * rule conditions. Unlocks are written once (`titles.unlocked[id]` keeps the
 * first unlock time); titles carry no currency, so there is nothing to
 * double-pay.
 */
import { REGIONS, LEVELS_PER_REGION } from '../config/regions';
import { TITLES, TITLE_BY_ID, type TitleDef, type TitleMetric } from '../config/titles';
import type { SaveData } from '../save/schema';
import type { SaveManager } from '../save/saveManager';
import { HOOD_BY_ID, FAMILY_BY_ID } from './hoods';

export function titleMetric(s: Readonly<SaveData>, m: TitleMetric): number {
  switch (m) {
    case 'distinctAdventure': return Object.keys(s.adventure.stars).length;
    case 'regionsCompleted': {
      let n = 0;
      for (let r = 1; r <= REGIONS.length; r++) if (typeof s.adventure.stars[String(r * LEVELS_PER_REGION)] === 'number') n++;
      return n;
    }
    case 'adventureStars': return Object.values(s.adventure.stars).reduce((a, b) => a + b, 0);
    case 'fiveStarAdventure': return Object.values(s.adventure.stars).filter((v) => v >= 5).length;
    case 'bankShots': return s.stats.bankShots;
    case 'hoodsOwned': return s.hoods.owned.length;
    case 'cleanEnemyClears': return s.stats.cleanEnemyClears;
    case 'petDaysFed': return s.pet.daysFed;
    case 'dailyFullClears': return s.stats.dailyFullClears;
    case 'fishStashed': return s.stats.fishStashed;
  }
}

export interface TitleView {
  def: TitleDef;
  unlocked: boolean;
  unlockedAt: number | null;
  /** For progress titles: current/target (null for run-based titles). */
  progress: { value: number; target: number } | null;
}

export function titleViews(s: Readonly<SaveData>): TitleView[] {
  return TITLES.map((def) => {
    const at = s.titles.unlocked[def.id];
    const c = def.criterion;
    return {
      def,
      unlocked: at !== undefined,
      unlockedAt: at ?? null,
      progress: c.kind === 'progress' ? { value: Math.min(c.target, titleMetric(s, c.metric)), target: c.target } : null,
    };
  });
}

/** Unlocks any progress title whose counter reached its target. Returns newly unlocked defs. */
export function evaluateProgressTitles(save: SaveManager, nowMs: number): TitleDef[] {
  const fresh = TITLES.filter((t) => t.criterion.kind === 'progress' && !(t.id in save.data.titles.unlocked)
    && titleMetric(save.data, t.criterion.metric) >= t.criterion.target);
  if (fresh.length) save.mutate((s) => { for (const t of fresh) if (!(t.id in s.titles.unlocked)) s.titles.unlocked[t.id] = nowMs; });
  return fresh;
}

/** Conditions of one finished run that run-based titles care about. */
export interface RunConditions {
  mode: string;
  won: boolean;
  level: number | null;
  hard: boolean;
  timeMs: number;
  fishTotal: number;
  continued: boolean;
  paused: boolean;
  modifiers: readonly string[];
  hoodId: string | null;
}

/** "Default rules": no gameplay-stat Hood (economy Hoods are fine), no continue, never paused, no level twist. */
export function isDefaultRules(c: RunConditions): boolean {
  const hood = c.hoodId ? HOOD_BY_ID[c.hoodId] : undefined;
  const statHood = !!hood && FAMILY_BY_ID[hood.family].kind === 'gameplay';
  return !statHood && !c.continued && !c.paused && c.modifiers.length === 0;
}

export function evaluateRunTitles(save: SaveManager, c: RunConditions, nowMs: number): TitleDef[] {
  if (!c.won) return [];
  const fresh = TITLES.filter((t) => {
    const k = t.criterion;
    if (k.kind !== 'run' || t.id in save.data.titles.unlocked) return false;
    if (c.mode !== k.mode || c.level === null || c.level < k.minLevel) return false;
    if (k.hard !== undefined && k.hard !== c.hard) return false;
    if (k.minFish !== undefined && c.fishTotal < k.minFish) return false;
    if (k.defaultRules && !isDefaultRules(c)) return false;
    return c.timeMs <= k.maxSeconds * 1000;
  });
  if (fresh.length) save.mutate((s) => { for (const t of fresh) if (!(t.id in s.titles.unlocked)) s.titles.unlocked[t.id] = nowMs; });
  return fresh;
}

/** Equip an unlocked title, or null for the neutral "no title" choice. */
export function equipTitle(save: SaveManager, id: string | null): boolean {
  if (id !== null && !(id in save.data.titles.unlocked && TITLE_BY_ID[id])) return false;
  save.mutate((s) => { s.titles.equipped = id; }, { immediate: true });
  return true;
}

export function equippedTitleName(s: Readonly<SaveData>): string | null {
  const id = s.titles.equipped;
  return id && TITLE_BY_ID[id] && id in s.titles.unlocked ? TITLE_BY_ID[id]!.name : null;
}
