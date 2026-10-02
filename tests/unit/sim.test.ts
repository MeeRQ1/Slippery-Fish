import { describe, expect, it } from 'vitest';
import { STAMINA } from '../../src/config/gameplay';
import { GameSim, NO_INPUT, type SimEvent, type SimInput } from '../../src/gameplay/sim';
import { makeTestLevel } from './fixtures';

function runFor(sim: GameSim, seconds: number, input: SimInput | ((s: GameSim) => SimInput)): SimEvent[] {
  const all: SimEvent[] = [];
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps && sim.status === 'playing'; i++) {
    sim.step(typeof input === 'function' ? input(sim) : input);
    all.push(...sim.events);
  }
  return all;
}

/** A simple "dribbler": steer behind the fish relative to the stash, then push. */
function dribbleBot(sim: GameSim): SimInput {
  const fish = sim.fish.find((f) => f.state === 'free');
  if (!fish) return NO_INPUT;
  const p = sim.player.body;
  const st = sim.level.stash;
  const fx = fish.body.x, fy = fish.body.y;
  const tx = st.x - fx, ty = st.y - fy;
  const tl = Math.hypot(tx, ty) || 1;
  // Approach point behind the fish.
  const bx = fx - (tx / tl) * 40, by = fy - (ty / tl) * 40;
  const dbx = bx - p.x, dby = by - p.y;
  const dBehind = Math.hypot(dbx, dby);
  if (dBehind > 22) return { moveX: dbx / dBehind, moveY: dby / dBehind, sprint: false };
  return { moveX: tx / tl, moveY: ty / tl, sprint: false };
}

describe('GameSim', () => {
  it('fish are not collected by touch: they must physically reach the stash', () => {
    const sim = new GameSim(makeTestLevel());
    // Walk onto the fish and stop: it gets pushed, not collected.
    runFor(sim, 0.6, { moveX: 1, moveY: 0, sprint: false });
    expect(sim.stashedValue).toBe(0);
    expect(sim.fish[0]!.state).toBe('free');
  });

  it('a dribbling bot can score and win', () => {
    const sim = new GameSim(makeTestLevel());
    const events = runFor(sim, 20, dribbleBot);
    expect(events.some((e) => e.type === 'fishScored')).toBe(true);
    expect(sim.status).toBe('won');
    expect(sim.timeMs).toBeGreaterThan(1000);
  });

  it('sprint drains stamina, stops at zero and regenerates after the delay', () => {
    const sim = new GameSim(makeTestLevel({ fish: [{ x: 1100, y: 100, variant: 'standard' }] }));
    const evs = runFor(sim, 1.0, { moveX: 0, moveY: 1, sprint: true });
    expect(evs.some((e) => e.type === 'sprintStart')).toBe(true);
    expect(sim.player.stamina).toBeLessThan(STAMINA.max - 25);
    runFor(sim, 2.3, { moveX: 0, moveY: -1, sprint: true });
    expect(sim.player.stamina).toBeGreaterThanOrEqual(0);
    expect(sim.player.exhausted).toBe(true);
    // Exhausted: holding sprint does not sprint.
    sim.step({ moveX: 1, moveY: 0, sprint: true });
    expect(sim.player.sprinting).toBe(false);
    const s0 = sim.player.stamina;
    runFor(sim, 2, NO_INPUT);
    expect(sim.player.stamina).toBeGreaterThan(s0);
    expect(sim.player.stamina).toBeLessThanOrEqual(sim.player.maxStamina);
  });

  it('sprinting is faster than walking but walking is still useful', () => {
    const a = new GameSim(makeTestLevel({ fish: [{ x: 1100, y: 700, variant: 'standard' }] }));
    const b = new GameSim(makeTestLevel({ fish: [{ x: 1100, y: 700, variant: 'standard' }] }));
    runFor(a, 1, { moveX: 1, moveY: 0, sprint: false });
    runFor(b, 1, { moveX: 1, moveY: 0, sprint: true });
    expect(b.player.body.x).toBeGreaterThan(a.player.body.x + 80);
    expect(a.player.body.x).toBeGreaterThan(200 + 200);
  });

  it('enemy contact with an exposed fish eats it and fails when impossible', () => {
    const sim = new GameSim(makeTestLevel({
      fish: [{ x: 600, y: 380, variant: 'standard' }],
      enemies: [{ type: 'arcticWolf', x: 800, y: 380, delay: 0 }],
    }));
    const evs = runFor(sim, 8, NO_INPUT);
    expect(evs.some((e) => e.type === 'fishEaten')).toBe(true);
    expect(sim.status).toBe('failed');
    sim.applyContinue();
    expect(sim.status).toBe('playing');
    expect(sim.fish[0]!.state).toBe('free');
  });

  it('enemies navigate around obstacles to reach fish', () => {
    const sim = new GameSim(makeTestLevel({
      player: { x: 100, y: 100 },
      fish: [{ x: 300, y: 380, variant: 'standard' }],
      obstacles: [{ type: 'longHorizontal', x: 600, y: 380, scale: 1, flip: false }, { type: 'thinVertical', x: 520, y: 380, scale: 1.4, flip: false }],
      enemies: [{ type: 'polarBear', x: 900, y: 380, delay: 0 }],
    }));
    runFor(sim, 20, NO_INPUT);
    expect(sim.fish[0]!.state).toBe('eaten');
  });

  it('is deterministic for identical inputs', () => {
    const mk = () => new GameSim(makeTestLevel({ enemies: [{ type: 'seal', x: 900, y: 200, delay: 0 }] }));
    const a = mk(), b = mk();
    runFor(a, 5, dribbleBot);
    runFor(b, 5, dribbleBot);
    expect(a.player.body.x).toBe(b.player.body.x);
    expect(a.fish[0]!.body.y).toBe(b.fish[0]!.body.y);
    expect(a.enemies[0]!.body.x).toBe(b.enemies[0]!.body.x);
  });
});
