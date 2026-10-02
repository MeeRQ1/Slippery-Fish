/**
 * Converts a LevelDef into physics statics. Shared by the simulation, the
 * procedural validator and the renderer (so visuals and colliders can never
 * disagree).
 */
import { FISH, STASH } from '../config/gameplay';
import { OBSTACLES, type ColliderDef } from '../config/obstacles';
import { Layer, makeCircle, makePoly, makeRect, type StaticShape } from '../physics/world';
import type { LevelDef, ObstaclePlacement } from '../levels/types';

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

export function buildStatics(level: LevelDef): StaticShape[] {
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
  // Limited collider: the stash rim stops enemies only (fish and penguins pass over it).
  statics.push(makeCircle(level.stash.x, level.stash.y, STASH.radius + STASH.enemyRimExtra, { blocks: Layer.Enemy, restitution: 0.2, tag: 'stashRim' }));
  return statics;
}
