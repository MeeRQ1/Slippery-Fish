/**
 * Training Rink — the optional, replayable, skippable in-depth tutorial.
 *
 * Each lesson is a small HANDCRAFTED arena played on the real simulation
 * (same physics, goal, 70% rule and enemies as every other mode), with a
 * short demonstration line and one hands-on objective. Lessons give no
 * currency (nothing to farm); finishing one records it in the save.
 * Info-only lessons (stars, Hoods, roadmap rewards) explain and link to the
 * real screen instead of burying the player in text.
 */
import { CONTENT_VERSION, GENERATOR_VERSION } from '../config/versions';
import type { GameSim } from '../gameplay/sim';
import { OPEN_SLOTS } from '../gameplay/goal';
import type { LevelDef } from './types';

export interface TrainingLesson {
  id: string;
  title: string;
  /** One-line demonstration shown before/while playing. */
  demo: string;
  /** Controls reminder (keyboard · touch). */
  controls: string;
  objective: string;
  /** Lessons with an arena; info lessons link to a screen instead. */
  level?: () => LevelDef;
  /** Non-scoring objective checked every frame (scoring lessons just need the win). */
  met?: (sim: GameSim) => boolean;
  link?: { screen: string; label: string };
}

/** Fence every open slot except those listed (ring segments; 0 = east, 6 = south, 12 = west). */
function fenceAllBut(open: number[]): number {
  let m = 0;
  for (const seg of OPEN_SLOTS) if (!open.includes(seg)) m |= 1 << seg;
  return m;
}

function arena(id: string, over: Partial<LevelDef>): LevelDef {
  return {
    id: `train-${id}`, mode: 'training', index: 1, seed: `training:${id}`, contentVersion: CONTENT_VERSION, generatorVersion: GENERATOR_VERSION,
    region: 'classic_winter', arena: { width: 1100, height: 680, walls: [], shape: 'rect' },
    player: { x: 180, y: 340 }, stash: { x: 880, y: 360 }, goal: { fenceMask: 0 }, modifiers: [],
    fish: [], fishRequired: 1, enemies: [], obstacles: [], surfaces: [], enemySpeed: 0.8, parSeconds: 20, difficulty: 0, hard: false,
    ...over,
  };
}

export const TRAINING_LESSONS: readonly TrainingLesson[] = [
  {
    id: 'move', title: 'Waddle', demo: 'Your penguin is round and slippery: it turns to face where it goes and keeps a little momentum.',
    controls: 'WASD / arrow keys · drag the joystick (left thumb)', objective: 'Waddle 12 metres around the rink.',
    level: () => arena('move', { fish: [{ x: 520, y: 200, variant: 'standard' }], fishRequired: 1 }),
    met: (sim) => sim.stats.distanceWaddled >= 12 * 48,
  },
  {
    id: 'sprint', title: 'Sprint & stamina', demo: 'Hold sprint for a burst of speed. The stamina bar drains while you hold it and refills when you let go.',
    controls: 'Hold Shift or Space · hold the sprint button (right thumb)', objective: 'Hold sprint for 2 seconds.',
    level: () => arena('sprint', { fish: [{ x: 620, y: 520, variant: 'standard' }] }),
    met: (sim) => sim.stats.sprintSeconds >= 2,
  },
  {
    id: 'dribble', title: 'Dribbling', demo: 'You never carry a fish — you bump it. Small taps keep it close; a sprint hit launches it.',
    controls: 'Walk into the fish to nudge it', objective: 'Bump fish 6 times.',
    level: () => arena('dribble', { fish: [{ x: 360, y: 340, variant: 'standard' }, { x: 420, y: 470, variant: 'small' }], fishRequired: 2 }),
    met: (sim) => sim.stats.fishTouches >= 6,
  },
  {
    id: 'gate', title: 'The igloo yard & the 70% rule', demo: 'Fences guard part of the yard. Line up with the gap: a fish counts only when at least 70% of it slides inside the yard.',
    controls: 'Push the fish through the opening on the left of the yard', objective: 'Get the fish into the yard through the gate.',
    level: () => arena('gate', { fish: [{ x: 420, y: 360, variant: 'standard' }], goal: { fenceMask: fenceAllBut([9, 10, 11, 12, 13]) } }),
  },
  {
    id: 'momentum', title: 'Momentum', demo: 'Fish keep sliding on the ice. Ease off before the yard so they glide in instead of bouncing off a fence.',
    controls: 'Gentle bumps near the goal', objective: 'Stash both fish.',
    level: () => arena('momentum', { fish: [{ x: 360, y: 200, variant: 'standard' }, { x: 360, y: 520, variant: 'standard' }], fishRequired: 2, goal: { fenceMask: fenceAllBut([8, 9, 10, 11, 12, 13]) } }),
  },
  {
    id: 'bank', title: 'Bank shots', demo: 'The yard faces the bottom wall. Bump the fish into the snow bank and let it rebound through the gate — a bank shot!',
    controls: 'Aim for the wall below the yard', objective: 'Stash the fish (a bank shot gets a special cheer).',
    level: () => arena('bank', { stash: { x: 760, y: 300 }, player: { x: 200, y: 160 }, fish: [{ x: 420, y: 230, variant: 'standard' }], goal: { fenceMask: fenceAllBut([4, 5, 6, 7, 8]) } }),
  },
  {
    id: 'enemies', title: 'Predators', demo: 'Seals, wolves and bears hunt loose fish. The screen edge glows as they get close — keep your fish moving and stash them first.',
    controls: 'Watch the danger glow · fish inside the yard are safe', objective: 'Stash both fish before the seal eats them.',
    level: () => arena('enemies', { fish: [{ x: 420, y: 240, variant: 'standard' }, { x: 420, y: 470, variant: 'standard' }], fishRequired: 2, enemies: [{ type: 'seal', x: 560, y: 620, delay: 3 }], enemySpeed: 0.7 }),
  },
  {
    id: 'stars', title: 'Excellence Stars', demo: 'Every clear earns 1–5 stars: faster clears earn more, losing a fish costs stars, and a continue caps the level at 3.',
    controls: '', objective: 'Read how stars work, then try any Adventure level for 5 stars.', link: { screen: 'adventure', label: 'OPEN THE MAP' },
  },
  {
    id: 'hoods', title: 'Hoods', demo: 'Hoods are bought with Icicle Shards. Each gives one bonus — stamina, speed, control or rewards. In Ranked they are cosmetic only.',
    controls: '', objective: 'Peek at the Hood rack.', link: { screen: 'hoods', label: 'OPEN HOODS' },
  },
  {
    id: 'roadmap', title: 'Route rewards', demo: 'Chests wait on the Adventure route after every 10th level, with a bigger Region Treasure every 50. Tap one to see exactly what it holds.',
    controls: '', objective: 'Find the next chest on your route.', link: { screen: 'adventure', label: 'OPEN THE MAP' },
  },
];

export const TRAINING_BY_ID: Record<string, TrainingLesson> = Object.fromEntries(TRAINING_LESSONS.map((l) => [l.id, l]));
