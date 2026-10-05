/**
 * Pet routines — cosmetic personality animations chosen from pools that fit
 * the browser-LOCAL time of day. These are not chores and never touch the
 * economy: Math.random here is presentation-only and is kept apart from
 * seeded gameplay and reward logic.
 *
 * Clock rule: routines follow the real local clock even if the menu lighting
 * is pinned in Settings (the lighting override changes what you SEE — dark
 * water, the lamp — not the fish's body clock).
 */
export type TimeBand = 'morning' | 'day' | 'evening' | 'night';

export type RoutineId =
  | 'shower' | 'brushTeeth' | 'stretch'
  | 'swimLaps' | 'playBall' | 'explore' | 'chaseBubbles'
  | 'floatRelax' | 'readBook' | 'stargaze'
  | 'fishflex' | 'couchDoze' | 'sleep';

export interface RoutineDef {
  id: RoutineId;
  label: string;
  weight: number;
  /** Duration range in seconds. */
  dur: [number, number];
}

/** morning 05–11, day 11–17, evening 17–21, night 21–05 (local hours). */
export function timeBandFor(d: Date): TimeBand {
  const h = d.getHours();
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
}

export const ROUTINE_POOLS: Record<TimeBand, readonly RoutineDef[]> = {
  morning: [
    { id: 'shower', label: 'Morning shower', weight: 3, dur: [14, 22] },
    { id: 'brushTeeth', label: 'Brushing teeth', weight: 3, dur: [10, 16] },
    { id: 'stretch', label: 'Morning stretches', weight: 2, dur: [10, 16] },
    { id: 'swimLaps', label: 'Wake-up laps', weight: 1, dur: [12, 20] },
  ],
  day: [
    { id: 'swimLaps', label: 'Swimming laps', weight: 3, dur: [14, 26] },
    { id: 'playBall', label: 'Playing with a ball', weight: 3, dur: [14, 22] },
    { id: 'explore', label: 'Exploring', weight: 2, dur: [14, 24] },
    { id: 'chaseBubbles', label: 'Chasing bubbles', weight: 2, dur: [10, 18] },
  ],
  evening: [
    { id: 'floatRelax', label: 'Relaxing', weight: 3, dur: [16, 28] },
    { id: 'readBook', label: 'Reading a tiny book', weight: 2, dur: [16, 26] },
    { id: 'fishflex', label: 'Watching Fishflex', weight: 2, dur: [18, 30] },
    { id: 'stargaze', label: 'Gazing at the lamp', weight: 1, dur: [12, 20] },
  ],
  night: [
    { id: 'fishflex', label: 'Watching Fishflex', weight: 2, dur: [18, 30] },
    { id: 'couchDoze', label: 'Dozing on the couch', weight: 3, dur: [22, 40] },
    { id: 'sleep', label: 'Sleeping', weight: 4, dur: [30, 60] },
  ],
};

/** Weighted pick that avoids repeating the previous routine when the pool allows. */
export function pickRoutine(band: TimeBand, previous: RoutineId | null, rand: () => number = Math.random): { def: RoutineDef; seconds: number } {
  const pool = ROUTINE_POOLS[band].filter((r) => r.id !== previous || ROUTINE_POOLS[band].length === 1);
  let total = 0;
  for (const r of pool) total += r.weight;
  let x = rand() * total;
  let def = pool[pool.length - 1]!;
  for (const r of pool) {
    x -= r.weight;
    if (x < 0) { def = r; break; }
  }
  return { def, seconds: def.dur[0] + rand() * (def.dur[1] - def.dur[0]) };
}

/**
 * Scheduler: holds the current routine; a time-band change never interrupts
 * it — the next routine simply comes from the new band once it ends.
 * Resuming the page re-evaluates the band (`resume`).
 */
export class RoutineScheduler {
  current: RoutineDef;
  remaining: number;
  /** Seconds since the current routine started (for transitions). */
  elapsed = 0;
  private band: TimeBand;

  constructor(private now: () => Date = () => new Date(), private rand: () => number = Math.random) {
    this.band = timeBandFor(this.now());
    const p = pickRoutine(this.band, null, this.rand);
    this.current = p.def;
    this.remaining = p.seconds;
  }

  get timeBand(): TimeBand {
    return this.band;
  }

  /** Advances time; returns true when a new routine started. */
  update(dt: number): boolean {
    this.elapsed += dt;
    this.remaining -= dt;
    if (this.remaining > 0) return false;
    this.band = timeBandFor(this.now());
    const p = pickRoutine(this.band, this.current.id, this.rand);
    this.current = p.def;
    this.remaining = p.seconds;
    this.elapsed = 0;
    return true;
  }

  /** Page resumed after being hidden: if the band changed, wrap up the current routine soon. */
  resume(): void {
    const b = timeBandFor(this.now());
    if (b !== this.band && !ROUTINE_POOLS[b].some((r) => r.id === this.current.id)) this.remaining = Math.min(this.remaining, 1.2);
  }
}
