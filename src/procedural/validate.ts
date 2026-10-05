/**
 * Procedural layout validation at ACTUAL collider sizes (spec §76).
 *
 * Uses navigation grids inflated by the penguin radius (and each enemy
 * radius) so "reachable" means a real penguin can get there and dribble a
 * fish along the route — not just point reachability.
 */
import { ENEMIES, FISH, GOAL, PLAYER } from '../config/gameplay';
import { buildStatics } from '../gameplay/arena';
import { isLegalLayout } from '../gameplay/goal';
import { NavGrid } from '../enemies/nav';
import type { LevelDef } from '../levels/types';
import { Layer, PhysicsWorld, type StaticShape } from '../physics/world';

export interface ValidationResult {
  ok: boolean;
  problems: string[];
  /** Grid path length (u) from stash to each fish (Infinity if unreachable). */
  fishToStash: number[];
  playerToFish: number[];
}

const CELL = 20;
/** sqrt-based distance (Math.hypot is not guaranteed bit-identical across engines). */
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

export function pathFieldDistance(grid: NavGrid, field: Float32Array, x: number, y: number, searchRadius: number): number {
  // Shortest field value among open cells within `searchRadius` of (x,y).
  const r = Math.ceil(searchRadius / grid.cell);
  const cx = Math.floor(x / grid.cell), cy = Math.floor(y / grid.cell);
  let best = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
      const px = (nx + 0.5) * grid.cell, py = (ny + 0.5) * grid.cell;
      const dd = Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
      if (dd > searchRadius) continue;
      const v = field[ny * grid.cols + nx]!;
      if (v + dd / grid.cell < best) best = v + dd / grid.cell;
    }
  }
  return best === Infinity ? Infinity : best * grid.cell;
}

export function validateLevel(level: LevelDef, statics: StaticShape[] = buildStatics(level), minEnemyFishGap = 0): ValidationResult {
  const problems: string[] = [];
  const world = new PhysicsWorld();
  world.statics = statics;
  const W = level.arena.width, H = level.arena.height;
  const pGrid = new NavGrid(W, H, CELL, PLAYER.radius + 2, statics, Layer.Player);

  const inside = (x: number, y: number, r: number) => x - r >= 0 && y - r >= 0 && x + r <= W && y + r <= H;

  // --- spawn overlap / collider problems
  if (!inside(level.player.x, level.player.y, PLAYER.radius) || world.overlapsStatic(level.player.x, level.player.y, PLAYER.radius + 4, Layer.Player)) problems.push('player spawn overlaps a collider');
  level.fish.forEach((f, i) => {
    const r = FISH.variants[f.variant].radius;
    if (!inside(f.x, f.y, r) || world.overlapsStatic(f.x, f.y, r + 6, Layer.Fish)) problems.push(`fish ${i} overlaps a collider`);
    const dS = dist(f.x, f.y, level.stash.x, level.stash.y);
    if (dS < GOAL.wallRadius + GOAL.wallThickness + r + 24) problems.push(`fish ${i} starts inside/near the goal courtyard`);
    if (dist(f.x, f.y, level.player.x, level.player.y) < PLAYER.radius + r + 30) problems.push(`fish ${i} overlaps player spawn`);
    level.fish.forEach((g, j) => {
      if (j <= i) return;
      if (dist(f.x, f.y, g.x, g.y) < r + FISH.variants[g.variant].radius + 24) problems.push(`fish ${i}/${j} overlap`);
    });
  });
  const ib = GOAL.iglooBody;
  const ringOuter = GOAL.wallRadius + GOAL.wallThickness;
  if (!inside(level.stash.x, level.stash.y, ringOuter + 8) || level.stash.y + ib.cy - ib.h / 2 < 0) problems.push('goal too close to the edge');
  if (!isLegalLayout(level.goal)) problems.push('goal fence layout has no legal opening');
  // The courtyard and igloo must not overlap carved walls or obstacles (goal colliders excluded from this test).
  const nonGoal = new PhysicsWorld();
  nonGoal.statics = buildStatics(level, { goal: false });
  if (nonGoal.overlapsStatic(level.stash.x, level.stash.y, ringOuter + 4, Layer.Fish | Layer.Player)) problems.push('goal courtyard overlaps an obstacle or wall');
  if (nonGoal.overlapsStatic(level.stash.x + ib.cx, level.stash.y + ib.cy, ib.w / 2, Layer.Fish | Layer.Player)) problems.push('igloo overlaps an obstacle or wall');

  // --- reachability at penguin size
  const pCell = pGrid.cellOf(level.player.x, level.player.y);
  const fromPlayer = pGrid.buildField(pCell);
  const stashCell = pGrid.cellOf(level.stash.x, level.stash.y);
  const fromStash = pGrid.buildField(stashCell);
  if (fromPlayer[stashCell] === Infinity) problems.push('stash unreachable for the penguin');
  const fishToStash: number[] = [];
  const playerToFish: number[] = [];
  level.fish.forEach((f, i) => {
    const r = FISH.variants[f.variant].radius;
    // The penguin must be able to get right next to the fish…
    const pf = pathFieldDistance(pGrid, fromPlayer, f.x, f.y, r + PLAYER.radius + 26);
    // …and a penguin-wide route must exist from the fish to the stash.
    const fs = pathFieldDistance(pGrid, fromStash, f.x, f.y, r + PLAYER.radius + 10);
    playerToFish.push(pf);
    fishToStash.push(fs);
    if (pf === Infinity) problems.push(`fish ${i} unreachable for the penguin`);
    if (fs === Infinity) problems.push(`fish ${i} has no dribble route to the stash`);
  });
  const reachable = fishToStash.filter((d) => d < Infinity).length;
  if (reachable < level.fishRequired) problems.push('not enough reachable fish');

  // --- enemy fairness & navigation
  const grids = new Map<number, NavGrid>();
  level.enemies.forEach((e, i) => {
    const cfg = ENEMIES[e.type];
    if (!inside(e.x, e.y, cfg.radius) || world.overlapsStatic(e.x, e.y, cfg.radius + 4, Layer.Enemy)) problems.push(`enemy ${i} overlaps a collider`);
    const dP = dist(e.x, e.y, level.player.x, level.player.y);
    if (dP < 300) problems.push(`enemy ${i} spawns too close to the player`);
    let grid = grids.get(cfg.radius);
    if (!grid) {
      grid = new NavGrid(W, H, CELL, cfg.radius, statics, Layer.Enemy);
      grids.set(cfg.radius, grid);
    }
    const field = grid.buildField(grid.cellOf(e.x, e.y));
    let nearest = Infinity;
    for (const f of level.fish) nearest = Math.min(nearest, pathFieldDistance(grid, field, f.x, f.y, cfg.radius + FISH.variants[f.variant].radius + 12));
    if (nearest === Infinity) problems.push(`enemy ${i} cannot reach any fish`);
    else if (nearest < minEnemyFishGap) problems.push(`enemy ${i} starts too close to a fish (${Math.round(nearest)}u)`);
  });

  return { ok: problems.length === 0, problems, fishToStash, playerToFish };
}
