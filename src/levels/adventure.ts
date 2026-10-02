/**
 * Adventure — exactly 800 fixed, shared levels across 16 regions.
 *
 * Levels are produced by the versioned generator from FIXED seeds
 * ("adventure:<n>"), so every player gets identical layouts for a given
 * CONTENT/GENERATOR version. Levels 1–8 carry curated teaching overrides
 * (movement, dribbling, sprint, stamina, bank shots, enemies, stars). These
 * are generated-and-curated, not hand-drawn — documented honestly in docs.
 */
import { ADVENTURE_LEVEL_COUNT, regionForAdventureLevel } from '../config/regions';
import { adventureDifficulty } from '../procedural/difficulty';
import { generateLevel, type GenRequest } from '../procedural/generator';
import type { LevelDef, TutorialInfo } from './types';

interface Teaching {
  tutorial: TutorialInfo;
  overrides: NonNullable<GenRequest['overrides']>;
}

const TEACHING: Record<number, Teaching> = {
  1: { tutorial: { hint: 'Waddle with WASD (or the joystick). Bump the fish into the stash!', showStashArrow: true, teaches: 'movement' },
    overrides: { fishCount: 1, fishRequired: 1, enemyCount: 0, obstacleCount: 0, arenaW: 960, arenaH: 600, stashAnchor: [0.72, 0.5], fishDistance: 0.12, noEnemies: true } },
  2: { tutorial: { hint: 'Fish are slippery! Push from behind to dribble them where you want.', showStashArrow: true, teaches: 'dribbling' },
    overrides: { fishCount: 2, fishRequired: 2, enemyCount: 0, obstacleCount: 0, arenaW: 1000, arenaH: 620, stashAnchor: [0.5, 0.5], fishDistance: 0.18, noEnemies: true } },
  3: { tutorial: { hint: 'Hold LEFT SHIFT (or SPRINT) to dash. Sprint hits launch fish further!', showStashArrow: false, teaches: 'sprint' },
    overrides: { fishCount: 2, fishRequired: 2, enemyCount: 0, obstacleCount: 1, arenaW: 1180, arenaH: 680, fishDistance: 0.3, noEnemies: true } },
  4: { tutorial: { hint: 'Sprinting drains STAMINA. Let go to refill the icy meter.', showStashArrow: false, teaches: 'stamina' },
    overrides: { fishCount: 3, fishRequired: 3, enemyCount: 0, obstacleCount: 2, arenaW: 1200, arenaH: 700, fishDistance: 0.3, noEnemies: true, motifs: ['scatter'] } },
  5: { tutorial: { hint: 'Fish bounce off ice and snow. Try a bank shot!', showStashArrow: false, teaches: 'bank' },
    overrides: { fishCount: 2, fishRequired: 2, enemyCount: 0, obstacleCount: 3, arenaW: 1160, arenaH: 700, fishDistance: 0.3, noEnemies: true, occludedFishChance: 0.9, motifs: ['pillars'] } },
  6: { tutorial: { hint: 'Uh oh — a polar bear! Enemies eat exposed fish. Get them stashed or block the bear!', showStashArrow: false, teaches: 'enemies' },
    overrides: { fishCount: 3, fishRequired: 2, enemyCount: 1, enemyTypes: ['polarBear'], obstacleCount: 2, arenaW: 1200, arenaH: 720, enemySpeed: 0.75, enemyFishGap: 520 } },
  7: { tutorial: { hint: 'Finish fast for more Excellence Stars. Five stars = mastery!', showStashArrow: false, teaches: 'stars' },
    overrides: { fishCount: 3, fishRequired: 3, enemyCount: 1, enemyTypes: ['polarBear'], obstacleCount: 3, enemySpeed: 0.78 } },
  8: { tutorial: { hint: 'Watch the red edges of the screen — they glow when danger is near.', showStashArrow: false, teaches: 'enemies' },
    overrides: { fishCount: 3, fishRequired: 3, enemyCount: 1, enemyTypes: ['polarBear'], obstacleCount: 3, enemySpeed: 0.8 } },
};

const cache = new Map<string, LevelDef>();

export function adventureLevel(n: number, hard = false): LevelDef {
  if (!Number.isInteger(n) || n < 1 || n > ADVENTURE_LEVEL_COUNT) throw new Error(`adventure level out of range: ${n}`);
  const key = `${n}:${hard}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const region = regionForAdventureLevel(n);
  const teach = TEACHING[n];
  const level = generateLevel({
    seed: `adventure:${n}`,
    id: `adv-${n}`,
    mode: 'adventure',
    index: n,
    region: region.id,
    difficulty: adventureDifficulty(n),
    hard,
    ...(teach ? { tutorial: teach.tutorial, overrides: teach.overrides } : {}),
  });
  if (cache.size > 40) cache.clear();
  cache.set(key, level);
  return level;
}
