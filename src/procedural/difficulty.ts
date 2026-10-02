/**
 * Difficulty model. A single scalar `d` maps to MANY knobs (spec §77: never
 * a single multiplier). Adventure caps d at a practical ceiling (level 800
 * feels "I have become a pro", not unfair); Infinite keeps d rising linearly
 * while entity counts stay bounded and challenge continues via speed,
 * reaction, layout complexity and placement.
 */
import type { EnemyType } from '../config/gameplay';

export const ADVENTURE_CEILING = 60;

export interface DifficultyKnobs {
  arenaW: number;
  arenaH: number;
  fishCount: number;
  fishRequired: number;
  enemyCount: number;
  enemyTypes: EnemyType[];
  /** Multiplier on enemy max speed (applied via level placement & delays). */
  enemySpeed: number;
  /** Seconds between enemy activations. */
  enemyStagger: number;
  obstacleCount: number;
  /** 0–1: share of complex motifs (maze, channel, ring). */
  complexity: number;
  /** Minimum fish→stash distance as a fraction of the arena diagonal. */
  fishDistance: number;
  /** 0 centre … 1 corners/pockets. */
  stashEdge: number;
  surfaceChance: number;
  wallBlockChance: number;
  /** Prefer fish without a straight line to the stash (bank shots). */
  occludedFishChance: number;
  /** Minimum start distance enemy→nearest fish (u). */
  enemyFishGap: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
/**
 * Concave ease using only + - * (no Math.pow): generation must give the same
 * discrete results in every browser so shared Daily/Ranked layouts match.
 */
const easeOut = (t: number, k: number) => t * (1 + k - k * t);

/** Adventure: level 1..800 → d. Gentle teaching start, saw-tooth per region, ceiling at the end. */
export function adventureDifficulty(level: number): number {
  const n = Math.max(1, Math.min(800, level));
  const global = easeOut((n - 1) / 799, 0.18) * ADVENTURE_CEILING;
  const inRegion = ((n - 1) % 50) / 49;
  // Each region starts slightly easier (introducing its theme) and ends on its hardest levels.
  const saw = (inRegion - 0.5) * 3.2;
  return Math.max(0, Math.min(ADVENTURE_CEILING, global + saw));
}

/** Infinite: approximately linear and unbounded. */
export function infiniteDifficulty(level: number): number {
  return 8 + Math.max(0, level - 1) * 0.9;
}

/** Daily: 40 levels ramping from friendly to tough; level 40 is the summit. */
export function dailyDifficulty(index: number): number {
  return 4 + ((Math.max(1, Math.min(40, index)) - 1) / 39) * 46;
}

export function knobs(d: number, hard: boolean): DifficultyKnobs {
  const t = Math.min(1, d / ADVENTURE_CEILING); // 0..1 across Adventure
  const beyond = Math.max(0, d - ADVENTURE_CEILING); // Infinite past the ceiling
  // Arena grows during Adventure then stays bounded.
  const arenaW = Math.round(lerp(980, 1500, t) + Math.min(200, beyond * 2));
  const arenaH = Math.round(lerp(620, 940, t) + Math.min(120, beyond * 1.2));
  const fishCount = Math.min(8, Math.round(lerp(1, 6, easeOut(t, 0.25)) + (d > 4 ? 0 : 0) + Math.min(2, beyond / 40)));
  const extra = d < 8 ? 0 : t < 0.5 ? 1 : t < 0.85 ? 1 : 0;
  const fishRequired = Math.max(1, fishCount - (beyond > 20 ? 0 : extra));
  let enemyCount = d < 5 ? 0 : Math.round(lerp(1, 4, (d - 5) / (ADVENTURE_CEILING - 5)));
  enemyCount = Math.min(6, enemyCount + Math.floor(beyond / 30));
  if (hard && d >= 5) enemyCount = Math.min(6, enemyCount + (d > 20 ? 1 : 0));
  const enemyTypes: EnemyType[] = ['polarBear'];
  if (d >= 9) enemyTypes.push('arcticWolf');
  if (d >= 16) enemyTypes.push('seal');
  return {
    arenaW,
    arenaH,
    fishCount,
    fishRequired,
    enemyCount,
    enemyTypes,
    enemySpeed: lerp(0.78, 1.0, t) + Math.min(0.4, beyond * 0.004),
    enemyStagger: lerp(3.0, 0.6, t),
    obstacleCount: Math.min(14, Math.round(lerp(0, 8, easeOut(t, 0.35)) + (d > 1.5 ? 1 : 0) + Math.min(4, beyond / 25))),
    complexity: Math.min(1, lerp(0, 0.75, t) + beyond * 0.004),
    fishDistance: lerp(0.14, 0.4, t) + Math.min(0.1, beyond * 0.001),
    stashEdge: lerp(0, 0.85, t),
    surfaceChance: d < 12 ? 0 : lerp(0.2, 0.7, t),
    wallBlockChance: d < 14 ? 0 : lerp(0.15, 0.6, t),
    occludedFishChance: d < 10 ? 0 : lerp(0.15, 0.7, t),
    enemyFishGap: Math.max(230, lerp(520, 300, t) - beyond * 0.5),
  };
}
