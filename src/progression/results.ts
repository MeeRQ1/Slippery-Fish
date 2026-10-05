/**
 * Shared result processing: Excellence Stars, best times (only replaced when
 * beaten, keyed by mode/level/versions/rules), lifetime stats and quest
 * tracking. Mode-specific rewards live in the drivers.
 */
import { STARS } from '../config/gameplay';
import type { SimStats } from '../gameplay/sim';
import type { Reward } from '../economy/wallet';
import type { QuestService } from '../quests/quests';
import type { SaveData } from '../save/schema';

export interface RunOutcome {
  /** Unique per attempt — makes reward grants idempotent. */
  runId: string;
  timeMs: number;
  stats: SimStats;
  /** True if the run used a failure continue. */
  continued: boolean;
  stashed: number;
  required: number;
  hadEnemies: boolean;
}

export interface ResultSummary {
  stars: number;
  timeMs: number;
  previousBestMs: number | null;
  newBest: boolean;
  parSeconds: number;
  rewards: Reward;
  firstClear: boolean;
  notes: string[];
  milestone?: { index: number; reward: Reward; label: string };
}

/** 1 = completed … 5 = mastery. Losing fish costs stars; continues cap at 3. */
export function computeStars(timeMs: number, parSeconds: number, fishEaten: number, continued: boolean): number {
  let stars = 1;
  const sec = timeMs / 1000;
  for (const t of STARS.thresholds) {
    if (sec <= parSeconds * t.mult) {
      stars = t.stars;
      break;
    }
  }
  stars -= fishEaten * STARS.starsLostPerEatenFish;
  if (continued) stars = Math.min(stars, 3);
  return Math.max(1, Math.min(5, stars));
}

/** Records the best time if beaten. Returns previous best. */
export function recordBest(s: SaveData, key: string, timeMs: number): { previous: number | null; improved: boolean } {
  const prev = s.bestTimes[key] ?? null;
  const improved = prev === null || timeMs < prev;
  if (improved) s.bestTimes[key] = Math.round(timeMs);
  return { previous: prev, improved };
}

/** Lifetime statistics shown on the Profile screen. */
export function addStats(s: SaveData, o: RunOutcome, won: boolean, stars: number): void {
  s.stats.fishStashed += o.stats.fishStashed;
  s.stats.fishEaten += o.stats.fishEaten;
  s.stats.distanceWaddled += Math.round(o.stats.distanceWaddled);
  s.stats.wallBounces += o.stats.wallBounces;
  s.stats.sprintSeconds += Math.round(o.stats.sprintSeconds * 10) / 10;
  s.stats.sprintHits += o.stats.sprintHits;
  s.stats.bankShots += o.stats.bankShots;
  if (won) {
    s.stats.levelsCompleted += 1;
    if (stars >= 5) s.stats.fiveStarLevels += 1;
    if (o.hadEnemies && o.stats.fishEaten === 0) s.stats.cleanEnemyClears += 1;
  }
}

export function trackQuests(q: QuestService, o: RunOutcome, won: boolean, stars: number, extra: { mode: string; hard: boolean }): void {
  q.track('distanceWaddled', Math.round(o.stats.distanceWaddled));
  q.track('sprintSeconds', o.stats.sprintSeconds);
  q.track('staminaEmpty', o.stats.staminaEmpties);
  q.track('fishTouches', o.stats.fishTouches);
  q.track('fishStashed', o.stats.fishStashed);
  q.track('wallBounces', o.stats.wallBounces);
  q.track('sprintHits', o.stats.sprintHits);
  q.track('rareFishStashed', o.stats.rareStashed);
  // Bank shots count only on a win: the level's result is committed then (no farming by quitting).
  if (!won) return;
  q.track('bankShots', o.stats.bankShots);
  q.track('levelsCompleted', 1);
  q.track('starsEarned', stars);
  if (stars >= 3) q.track('threeStarLevels', 1);
  if (stars >= 5) q.track('fiveStarLevels', 1);
  if (o.hadEnemies) q.track('enemyLevelsCompleted', 1);
  if (o.stats.fishEaten === 0) q.track('noLossLevels', 1);
  if (extra.hard) q.track('hardWins', 1);
  if (extra.mode === 'daily') q.track('dailyLevels', 1);
  if (extra.mode === 'infinite') q.track('infiniteLevels', 1);
  if (extra.mode === 'adventure') q.track('adventureLevels', 1);
}

export function newRunId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
