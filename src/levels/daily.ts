/**
 * Daily Challenge — exactly 40 levels per shared daily cycle.
 *
 * TIME AUTHORITY (standalone build): the cycle is the UTC calendar date of
 * the device clock, identical for every timezone. Device clocks are editable,
 * so local daily progress/claims are convenience only — NOT secure reward
 * protection. Online rewards would require a server clock (see
 * docs/SERVICES.md). Identifier = date + content + generator version.
 */
import { REGIONS, type RegionId } from '../config/regions';
import { CONTENT_VERSION, GENERATOR_VERSION } from '../config/versions';
import { Rng } from '../core/rng';
import { dailyDifficulty } from '../procedural/difficulty';
import { generateLevel } from '../procedural/generator';
import type { LevelDef } from './types';

export const DAILY_LEVELS = 40;
export const DAILY_MILESTONES = 8;
export const LEVELS_PER_MILESTONE = 5;

export function utcDateKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function dailyCycleId(nowMs: number): string {
  return `daily-${utcDateKey(nowMs)}-c${CONTENT_VERSION}-g${GENERATOR_VERSION}`;
}

/** Milliseconds until the next 00:00 UTC rollover. */
export function msUntilReset(nowMs: number): number {
  const d = new Date(nowMs);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - nowMs;
}

export function milestoneOf(levelIndex: number): number {
  return Math.ceil(levelIndex / LEVELS_PER_MILESTONE);
}

/** The day's region per Popsicle milestone (deterministic per date). */
export function dailyRegions(dateKey: string): RegionId[] {
  const rng = new Rng(`daily-regions:${dateKey}`);
  const ids = REGIONS.map((r) => r.id);
  rng.shuffle(ids);
  return ids.slice(0, DAILY_MILESTONES);
}

export function dailyLevel(dateKey: string, index: number, hard = false): LevelDef {
  if (index < 1 || index > DAILY_LEVELS) throw new Error(`daily index out of range: ${index}`);
  const regions = dailyRegions(dateKey);
  return generateLevel({
    seed: `daily:${dateKey}:${index}`,
    id: `daily-${dateKey}-${index}`,
    mode: 'daily',
    index,
    region: regions[milestoneOf(index) - 1]!,
    difficulty: dailyDifficulty(index),
    hard,
  });
}
