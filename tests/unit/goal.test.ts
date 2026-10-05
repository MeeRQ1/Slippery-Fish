import { describe, expect, it } from 'vitest';
import { GOAL } from '../../src/config/gameplay';
import {
  OPEN_SLOTS, RING_DIRS, containedFraction, isLegalLayout, isSolidSegment, openings, ringPoint, scoreDistance, sectorOf,
} from '../../src/gameplay/goal';
import { GameSim, NO_INPUT, type FishEntity } from '../../src/gameplay/sim';
import { buildStatics } from '../../src/gameplay/arena';
import { adventureLevel } from '../../src/levels/adventure';
import { makeTestLevel } from './fixtures';

const C = { x: 600, y: 400 };

/** Places a free fish at (x, y) with velocity, as if it just arrived there from outside the ring. */
function put(_sim: GameSim, f: FishEntity, x: number, y: number, vx = 0, vy = 0, fromOutside = true): void {
  f.body.x = f.body.px = x;
  f.body.y = f.body.py = y;
  f.body.vx = vx;
  f.body.vy = vy;
  if (fromOutside) f.ringInside = false;
}

function runUntil(sim: GameSim, steps: number, stop: () => boolean): number {
  for (let i = 0; i < steps; i++) {
    sim.step(NO_INPUT);
    if (stop()) return i + 1;
  }
  return -1;
}

const southFence = (() => {
  // Fence the five segments around due south (dir 6): 4,5,6,7,8.
  let m = 0;
  for (const i of [4, 5, 6, 7, 8]) m |= 1 << i;
  return { fenceMask: m };
})();

describe('70% scoring geometry', () => {
  it('contained fraction is exact at the extremes and monotonic', () => {
    const r = 15, R = GOAL.interiorRadius;
    expect(containedFraction(r, 0)).toBeCloseTo(1, 10);
    expect(containedFraction(r, R - r)).toBeCloseTo(1, 10);
    expect(containedFraction(r, R + r)).toBe(0);
    let prev = 1;
    for (let d = R - r; d <= R + r; d += 0.5) {
      const f = containedFraction(r, d);
      expect(f).toBeLessThanOrEqual(prev + 1e-12);
      prev = f;
    }
  });

  it('threshold distance corresponds to 70% contained area for every fish size', () => {
    for (const r of [12, 15, 17, 21]) {
      const d = scoreDistance(r);
      expect(containedFraction(r, d)).toBeGreaterThanOrEqual(0.7);
      expect(containedFraction(r, d + 0.01)).toBeLessThan(0.7);
      // Sanity: the threshold sits inside the interior edge, not at the centre or the rim.
      expect(d).toBeGreaterThan(GOAL.interiorRadius - r);
      expect(d).toBeLessThan(GOAL.interiorRadius);
    }
  });

  it('sector lookup matches the direction table', () => {
    for (let i = 0; i < 24; i++) {
      const a = RING_DIRS[i]!, b = RING_DIRS[(i + 1) % 24]!;
      expect(sectorOf(a[0] + b[0], a[1] + b[1])).toBe(i);
    }
  });

  it('layout rules: igloo always solid, openings at least the minimum width', () => {
    expect(isLegalLayout({ fenceMask: 0 })).toBe(true);
    expect(isSolidSegment({ fenceMask: 0 }, 18)).toBe(true); // north = igloo
    // Fence everything except a 3-segment gap → illegal (too narrow).
    let m = 0;
    OPEN_SLOTS.forEach((seg, k) => { if (k < 6 || k > 8) m |= 1 << seg; });
    expect(isLegalLayout({ fenceMask: m })).toBe(false);
    // Fence everything → no opening → illegal.
    let all = 0;
    for (const seg of OPEN_SLOTS) all |= 1 << seg;
    expect(isLegalLayout({ fenceMask: all })).toBe(false);
    expect(openings(southFence).every((run) => run.length >= GOAL.minOpeningSegments)).toBe(true);
  });
});

describe('scoring in the simulation', () => {
  const level = (goal = { fenceMask: 0 }, extra = {}) => makeTestLevel({ stash: C, goal, fish: [{ x: 200, y: 200, variant: 'standard' }], fishRequired: 1, ...extra });

  it('just below 70% does not score; at 70% scores', () => {
    const thr = scoreDistance(15);
    const sim = new GameSim(level());
    const f = sim.fish[0]!;
    put(sim, f, C.x, C.y + thr + 0.6);
    sim.step(NO_INPUT);
    expect(f.state).toBe('free');
    expect(sim.stashedValue).toBe(0);
    const sim2 = new GameSim(level());
    const f2 = sim2.fish[0]!;
    put(sim2, f2, C.x, C.y + thr - 0.6);
    sim2.step(NO_INPUT);
    expect(f2.state).toBe('stashed');
    expect(sim2.status).toBe('won');
  });

  it('touching or overlapping the rim does not count', () => {
    const sim = new GameSim(level());
    const f = sim.fish[0]!;
    // Centre exactly on the interior edge: only ~50% inside.
    put(sim, f, C.x, C.y + GOAL.interiorRadius);
    sim.step(NO_INPUT);
    expect(f.state).toBe('free');
  });

  it('a fish fired at a fenced side bounces off and never scores', () => {
    const sim = new GameSim(level(southFence));
    const f = sim.fish[0]!;
    put(sim, f, C.x, C.y + 230, 0, -900);
    const hit = runUntil(sim, 240, () => f.state !== 'free');
    expect(hit).toBe(-1);
    expect(f.body.y).toBeGreaterThan(C.y + GOAL.wallRadius); // still outside, below the fence
  });

  it('the same shot through an opening scores (straight and angled)', () => {
    const sim = new GameSim(level(southFence));
    const f = sim.fish[0]!;
    put(sim, f, C.x + 260, C.y, -700, 0); // from the east: open
    expect(runUntil(sim, 120, () => f.state === 'stashed')).toBeGreaterThan(0);
    const sim2 = new GameSim(level(southFence));
    const g = sim2.fish[0]!;
    const [ox, oy] = ringPoint(C.x, C.y, 2, GOAL.wallRadius + 160); // south-east diagonal (segment 2 is open)
    put(sim2, g, ox, oy, (C.x - ox) * 3, (C.y - oy) * 3);
    expect(runUntil(sim2, 120, () => g.state === 'stashed')).toBeGreaterThan(0);
  });

  it('fast crossings are caught by the swept test and commit exactly once', () => {
    const sim = new GameSim(level());
    const f = sim.fish[0]!;
    put(sim, f, C.x, C.y + 200, 0, -940);
    let scored = 0;
    for (let i = 0; i < 80; i++) {
      sim.step(NO_INPUT);
      scored += sim.events.filter((e) => e.type === 'fishScored').length;
    }
    expect(scored).toBe(1);
    expect(sim.stats.fishStashed).toBe(1);
    expect(sim.world.bodies.includes(f.body)).toBe(false);
  });

  it('entering through a solid sector (forced past a fence) cannot score until the fish leaves', () => {
    const sim = new GameSim(level(southFence, { fish: [{ x: 200, y: 200, variant: 'standard' }, { x: 220, y: 600, variant: 'standard' }], fishRequired: 2 }));
    const f = sim.fish[0]!;
    // Teleport through the fenced south side to deep inside.
    put(sim, f, C.x, C.y + 20);
    sim.step(NO_INPUT);
    expect(f.state).toBe('free');
    expect(f.entryValid).toBe(false);
    // Leave the ring, come back through the open east side → scores.
    put(sim, f, C.x + 200, C.y, 0, 0, false);
    sim.step(NO_INPUT);
    expect(f.entryValid).toBe(true);
    put(sim, f, C.x + 30, C.y);
    sim.step(NO_INPUT);
    expect(f.state).toBe('stashed');
  });

  it('multiple fish in one step all count, and victory fires once', () => {
    const lv = level({ fenceMask: 0 }, { fish: [{ x: 200, y: 200, variant: 'standard' }, { x: 260, y: 200, variant: 'small' }], fishRequired: 2 });
    const sim = new GameSim(lv);
    put(sim, sim.fish[0]!, C.x - 25, C.y + 10);
    put(sim, sim.fish[1]!, C.x + 25, C.y + 10);
    sim.step(NO_INPUT);
    const scoredEvents = sim.events.filter((e) => e.type === 'fishScored').length;
    const wins = sim.events.filter((e) => e.type === 'won').length;
    expect(scoredEvents).toBe(2);
    expect(wins).toBe(1);
    expect(sim.status).toBe('won');
    sim.step(NO_INPUT);
    expect(sim.events.length).toBe(0);
  });

  it('scoring is resolved before an enemy capture in the same step', () => {
    const lv = level({ fenceMask: 0 }, {
      fish: [{ x: 200, y: 200, variant: 'standard' }, { x: 240, y: 680, variant: 'standard' }], fishRequired: 2,
      enemies: [{ type: 'arcticWolf', x: 1100, y: 700, delay: 0 }],
    });
    const sim = new GameSim(lv);
    const f = sim.fish[0]!;
    const wolf = sim.enemies[0]!;
    wolf.state = 'chasing';
    wolf.wait = 0;
    const thr = scoreDistance(15);
    put(sim, f, C.x, C.y + thr - 1);
    // Force the wolf into reach of the fish (bypassing its courtyard blocker).
    wolf.body.x = wolf.body.px = C.x;
    wolf.body.y = wolf.body.py = C.y + thr + 30;
    sim.step(NO_INPUT);
    expect(f.state).toBe('stashed');
    expect(sim.stats.fishEaten).toBe(0);
  });

  it('a scored fish leaves enemy targeting and the exposed-fish count immediately', () => {
    const lv = level({ fenceMask: 0 }, {
      fish: [{ x: 200, y: 200, variant: 'standard' }, { x: 240, y: 680, variant: 'standard' }], fishRequired: 2,
      enemies: [{ type: 'polarBear', x: 1100, y: 120, delay: 0 }],
    });
    const sim = new GameSim(lv);
    const bear = sim.enemies[0]!;
    bear.targetFish = 0;
    put(sim, sim.fish[0]!, C.x, C.y + 10);
    sim.step(NO_INPUT);
    expect(sim.exposedFish.map((f) => f.id)).toEqual([1]);
    expect(bear.targetFish).not.toBe(0);
  });

  it('bank shots are detected (wall contact after a penguin touch)', () => {
    const sim = new GameSim(level());
    const f = sim.fish[0]!;
    f.touched = true;
    f.bankArmed = true;
    put(sim, f, C.x, C.y + 10);
    sim.step(NO_INPUT);
    const ev = sim.events.find((e) => e.type === 'fishScored');
    expect(ev && ev.type === 'fishScored' && ev.bank).toBe(true);
    expect(sim.stats.bankShots).toBe(1);
  });

  it('fences block the penguin and fish physically; the enemy disk blocks enemies only', () => {
    const lv = level(southFence);
    const statics = buildStatics(lv);
    const fences = statics.filter((s) => s.tag === 'fence');
    // 8 igloo segments + 5 fenced segments.
    expect(fences.length).toBe(13);
    const rim = statics.find((s) => s.tag === 'stashRim')!;
    expect(rim.blocks).toBe(4);
  });
});

describe('generated goals', () => {
  it('every sampled Adventure goal is legal with openings wide enough for the largest fish and the penguin', () => {
    for (const n of [1, 2, 5, 9, 25, 60, 140, 333, 500, 777, 800]) {
      const l = adventureLevel(n);
      expect(isLegalLayout(l.goal)).toBe(true);
      for (const run of openings(l.goal)) {
        const [ax, ay] = ringPoint(0, 0, run[0]!);
        const [bx, by] = ringPoint(0, 0, run[run.length - 1]! + 1);
        const clear = Math.hypot(bx - ax, by - ay) - GOAL.wallThickness;
        expect(clear).toBeGreaterThan(21 * 2 + 30);
      }
    }
  });

  it('intro levels are open, later levels use gates', () => {
    expect(adventureLevel(1).goal.fenceMask).toBe(0);
    const late = [600, 650, 700, 750].map((n) => adventureLevel(n).goal.fenceMask);
    expect(late.every((m) => m !== 0)).toBe(true);
  });
});
