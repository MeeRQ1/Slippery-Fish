/**
 * Converts a LevelDef into physics statics. Shared by the simulation, the
 * procedural validator and the renderer (so visuals and colliders can never
 * disagree).
 */
import { FISH, GOAL } from '../config/gameplay';
import { OBSTACLES, type ColliderDef } from '../config/obstacles';
import { Layer, makeCircle, makePoly, makeRect, type StaticShape } from '../physics/world';
import type { LevelDef, ObstaclePlacement } from '../levels/types';
import { RING_SEGMENTS, isSolidSegment, ringPoint } from './goal';

/** cos/sin of k·2π/14, written as literals. */
const UNIT_CIRCLE_14: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.9009688679, 0.4338837391], [0.6234898019, 0.7818314825], [0.2225209340, 0.9749279122],
  [-0.2225209340, 0.9749279122], [-0.6234898019, 0.7818314825], [-0.9009688679, 0.4338837391], [-1, 0],
  [-0.9009688679, -0.4338837391], [-0.6234898019, -0.7818314825], [-0.2225209340, -0.9749279122],
  [0.2225209340, -0.9749279122], [0.6234898019, -0.7818314825], [0.9009688679, -0.4338837391],
];

/** Thickness of the invisible-backed snow-bank walls outside the arena (u). */
export const WALL_THICKNESS = 240;

export function obstacleColliders(o: ObstaclePlacement): StaticShape[] {
  const def = OBSTACLES[o.type];
  if (!def) throw new Error(`unknown obstacle ${o.type}`);
  const sx = o.scale * (o.flip ? -1 : 1);
  const sy = o.scale;
  const out: StaticShape[] = [];
  const opts = { blocks: Layer.All, restitution: FISH.obstacleRestitution, tag: 'obstacle' as const };
  for (const c of def.colliders) out.push(colliderToStatic(c, o.x, o.y, sx, sy, o.scale, opts));
  return out;
}

function colliderToStatic(c: ColliderDef, ox: number, oy: number, sx: number, sy: number, s: number,
  opts: { blocks: number; restitution: number; tag: 'obstacle' }): StaticShape {
  switch (c.type) {
    case 'rect':
      return makeRect(ox + c.cx * sx, oy + c.cy * sy, c.w * s, c.h * s, { ...opts, radius: (c.radius ?? 0) * s });
    case 'circle':
      return makeCircle(ox + c.cx * sx, oy + c.cy * sy, c.r * s, opts);
    case 'poly':
      return makePoly(c.points.map(([x, y]) => [ox + x * sx, oy + y * sy] as [number, number]), { ...opts, radius: (c.radius ?? 0) * s });
    case 'ellipse': {
      // Literal unit-circle table (no runtime trig) keeps colliders bit-identical across browsers.
      const pts: Array<[number, number]> = UNIT_CIRCLE_14.map(([cx, cy]) => [ox + (c.cx + cx * c.rx) * sx, oy + (c.cy + cy * c.ry) * sy] as [number, number]);
      return makePoly(pts, opts);
    }
  }
}

export function buildStatics(level: LevelDef, opts: { goal?: boolean } = {}): StaticShape[] {
  const { width: w, height: h } = level.arena;
  const t = WALL_THICKNESS;
  const wall = { blocks: Layer.All, restitution: FISH.wallRestitution, tag: 'wall' as const };
  const statics: StaticShape[] = [
    makeRect(w / 2, -t / 2, w + t * 2, t, wall),
    makeRect(w / 2, h + t / 2, w + t * 2, t, wall),
    makeRect(-t / 2, h / 2, t, h + t * 2, wall),
    makeRect(w + t / 2, h / 2, t, h + t * 2, wall),
  ];
  for (const block of level.arena.walls) statics.push(makePoly(block.points, { ...wall, radius: 10 }));
  for (const o of level.obstacles) statics.push(...obstacleColliders(o));
  if (opts.goal !== false) statics.push(...goalColliders(level));
  return statics;
}

/**
 * Goal colliders: a capsule along every solid ring segment (fences + the
 * igloo's front wall), the igloo body, and an enemy-only disk over the whole
 * courtyard (a limited collider: enemies never wander into the chicks' yard).
 */
export function goalColliders(level: LevelDef): StaticShape[] {
  const { x: cx, y: cy } = level.stash;
  const out: StaticShape[] = [];
  const half = GOAL.wallThickness / 2;
  const fence = { blocks: Layer.All, restitution: FISH.obstacleRestitution, tag: 'fence' as const, radius: half - 1 };
  for (let i = 0; i < RING_SEGMENTS; i++) {
    if (!isSolidSegment(level.goal, i)) continue;
    const [ax, ay] = ringPoint(cx, cy, i);
    const [bx, by] = ringPoint(cx, cy, i + 1);
    // Thin rectangle along the segment; the rounding radius turns it into a capsule.
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / len) * 1, ny = (dx / len) * 1;
    out.push(makePoly([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]], fence));
  }
  const ib = GOAL.iglooBody;
  out.push(makeRect(cx + ib.cx, cy + ib.cy, ib.w, ib.h, { blocks: Layer.All, restitution: FISH.wallRestitution, tag: 'obstacle', radius: ib.radius }));
  out.push(makeCircle(cx, cy, GOAL.wallRadius + half + GOAL.enemyBlockExtra, { blocks: Layer.Enemy, restitution: 0.2, tag: 'stashRim' }));
  return out;
}
