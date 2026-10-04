/**
 * Menu theme rules — MAIN MENU and its submenus only.
 *
 *  Season (menu presets): automatic from the browser-local calendar date using
 *  a configurable Northern Hemisphere schedule (meteorological seasons by
 *  default: spring Mar 1, summer Jun 1, autumn Sep 1, winter Dec 1). The
 *  hemisphere is never inferred from the timezone; a player in the Southern
 *  Hemisphere can pick their season in Settings → Menu theme.
 *
 *  Day phase (menu lighting): browser-local clock — dawn 05:00, day 08:00,
 *  dusk 17:00, night 20:00 (so ~3 AM is night). Visual only: never used for
 *  rewards, quest periods, the pet's economic day or competitive timing.
 *
 * SCOPE: levels, Adventure regions/map backgrounds, seeded geometry, physics
 * and difficulty never read these values (enforced by
 * tests/unit/menuTheme.test.ts, which also checks the inline copy of these
 * rules in index.html).
 */
export type MenuSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export const MENU_SEASONS: readonly MenuSeason[] = ['spring', 'summer', 'autumn', 'winter'];
export const DAY_PHASES: readonly DayPhase[] = ['dawn', 'day', 'dusk', 'night'];

/** Season start dates (month 1–12, day), Northern Hemisphere, meteorological. */
export const SEASON_CALENDAR: ReadonlyArray<{ season: MenuSeason; month: number; day: number }> = [
  { season: 'spring', month: 3, day: 1 },
  { season: 'summer', month: 6, day: 1 },
  { season: 'autumn', month: 9, day: 1 },
  { season: 'winter', month: 12, day: 1 },
];

/** Local-hour boundaries (inclusive start) of each lighting phase. */
export const DAY_PHASE_STARTS: ReadonlyArray<{ phase: DayPhase; hour: number }> = [
  { phase: 'night', hour: 0 },
  { phase: 'dawn', hour: 5 },
  { phase: 'day', hour: 8 },
  { phase: 'dusk', hour: 17 },
  { phase: 'night', hour: 20 },
];

export function seasonFor(date: Date, calendar = SEASON_CALENDAR): MenuSeason {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const sorted = [...calendar].sort((a, b) => a.month * 100 + a.day - (b.month * 100 + b.day));
  let current = sorted[sorted.length - 1]!.season; // wraps around the year end
  for (const s of sorted) if (md >= s.month * 100 + s.day) current = s.season;
  return current;
}

export function dayPhaseFor(date: Date): DayPhase {
  const h = date.getHours() + date.getMinutes() / 60;
  let phase: DayPhase = 'night';
  for (const p of DAY_PHASE_STARTS) if (h >= p.hour) phase = p.phase;
  return phase;
}
