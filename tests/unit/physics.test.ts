import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../src/config/gameplay';
import { collideCircleStatic, createBody, Layer, makeCircle, makeRect, PhysicsWorld } from '../../src/physics/world';

function boxWorld(w = 800, h = 600): PhysicsWorld {
  const world = new PhysicsWorld();
  const t = 200;
  world.statics = [
    makeRect(w / 2, -t / 2, w + 2 * t, t, { tag: 'wall', restitution: 0.75 }),
    makeRect(w / 2, h + t / 2, w + 2 * t, t, { tag: 'wall', restitution: 0.75 }),
    makeRect(-t / 2, h / 2, t, h + 2 * t, { tag: 'wall', restitution: 0.75 }),
    makeRect(w + t / 2, h / 2, t, h + 2 * t, { tag: 'wall', restitution: 0.75 }),
  ];
  world.bounds = { minX: 0, minY: 0, maxX: w, maxY: h };
  return world;
}

function run(world: PhysicsWorld, seconds: number): void {
  const steps = Math.round(seconds / PHYSICS.fixedStep);
  for (let i = 0; i < steps; i++) world.step(PHYSICS.fixedStep);
}

describe('collideCircleStatic', () => {
  it('detects overlap with a rectangle and pushes outward', () => {
    const r = makeRect(100, 100, 50, 50);
    const out = { nx: 0, ny: 0, pen: 0, cx: 0, cy: 0 };
    expect(collideCircleStatic(140, 100, 20, r, out)).toBe(true);
    expect(out.nx).toBeCloseTo(1);
    expect(out.pen).toBeCloseTo(5);
    expect(collideCircleStatic(200, 100, 20, r, out)).toBe(false);
  });

  it('handles a centre inside the polygon', () => {
    const r = makeRect(0, 0, 100, 100);
    const out = { nx: 0, ny: 0, pen: 0, cx: 0, cy: 0 };
    expect(collideCircleStatic(40, 0, 10, r, out)).toBe(true);
    expect(out.nx).toBeCloseTo(1);
    expect(out.pen).toBeCloseTo(20);
  });

  it('supports rounded corners', () => {
    const r = makeRect(0, 0, 100, 100, { radius: 20 });
    const out = { nx: 0, ny: 0, pen: 0, cx: 0, cy: 0 };
    // A circle touching the sharp corner region but outside the rounded corner.
    expect(collideCircleStatic(58, 58, 5, r, out)).toBe(false);
    expect(collideCircleStatic(45, 45, 5, r, out)).toBe(true);
  });
});

describe('PhysicsWorld', () => {
  it('rebounds a fish off a wall with the configured restitution', () => {
    const world = boxWorld();
    const fish = world.add(createBody({ x: 400, y: 300, r: 15, layer: Layer.Fish, invMass: 1 / 0.34, damping: 0, maxSpeed: 2000 }));
    fish.vx = 600;
    run(world, 1.0);
    expect(fish.vx).toBeLessThan(0);
    expect(Math.abs(fish.vx)).toBeGreaterThan(600 * 0.7);
    expect(Math.abs(fish.vx)).toBeLessThan(600 * 0.8);
  });

  it('never tunnels through a thin obstacle at max speed', () => {
    const world = boxWorld(2000, 600);
    world.statics.push(makeRect(1000, 300, 30, 600, { tag: 'obstacle' }));
    const fish = world.add(createBody({ x: 200, y: 300, r: 12, layer: Layer.Fish, damping: 0, maxSpeed: 940 }));
    fish.vx = 940;
    for (let i = 0; i < 120; i++) {
      world.step(PHYSICS.fixedStep);
      expect(fish.x).toBeLessThan(1000 - 15 + 1);
    }
  });

  it('gradually loses momentum through damping', () => {
    const world = boxWorld(5000, 5000);
    const fish = world.add(createBody({ x: 2500, y: 2500, r: 15, layer: Layer.Fish, damping: 1, maxSpeed: 2000 }));
    fish.vx = 500;
    run(world, 1);
    expect(fish.vx).toBeGreaterThan(150);
    expect(fish.vx).toBeLessThan(220);
  });

  it('transfers momentum from a heavier striker and applies the kick bonus', () => {
    const world = boxWorld(3000, 600);
    const penguin = world.add(createBody({ x: 300, y: 300, r: 24, layer: Layer.Player, invMass: 1, damping: 0, kick: 0.3 }));
    const fish = world.add(createBody({ x: 345, y: 300, r: 15, layer: Layer.Fish, invMass: 1 / 0.34, damping: 0, kickable: true, maxSpeed: 2000 }));
    world.pairRestitution = () => 0.55;
    penguin.vx = 300;
    run(world, 0.2);
    expect(fish.vx).toBeGreaterThan(300);
    expect(penguin.vx).toBeLessThan(300);
  });

  it('respects limited colliders (stash rim blocks enemies only)', () => {
    const world = boxWorld();
    world.statics.push(makeCircle(400, 300, 60, { blocks: Layer.Enemy, tag: 'stashRim' }));
    const fish = world.add(createBody({ x: 250, y: 300, r: 15, layer: Layer.Fish, damping: 0, maxSpeed: 2000 }));
    const enemy = world.add(createBody({ x: 250, y: 200, r: 25, layer: Layer.Enemy, damping: 0, maxSpeed: 2000 }));
    fish.vx = 200;
    enemy.vx = 150; enemy.vy = 100;
    run(world, 0.75);
    expect(fish.x).toBeGreaterThan(380); // passed through the stash area
    const d = Math.hypot(enemy.x - 400, enemy.y - 300);
    expect(d).toBeGreaterThan(60 + 25 - 2);
  });

  it('fish trapped in a corner still settles inside the arena', () => {
    const world = boxWorld();
    const fish = world.add(createBody({ x: 20, y: 20, r: 15, layer: Layer.Fish, damping: 1, maxSpeed: 2000 }));
    fish.vx = -800; fish.vy = -800;
    run(world, 2);
    expect(fish.x).toBeGreaterThanOrEqual(15);
    expect(fish.y).toBeGreaterThanOrEqual(15);
  });
});
