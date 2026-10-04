/**
 * Arena shape templates. Every carved region is a union of CONVEX polygons
 * (the physics engine's static shape), and the snowbank renderer draws those
 * exact polygons — so the visible snow edge is always the real collision edge.
 *
 *  rect       plain rink (corners softened slightly)
 *  cove       2–4 rounded corners (fan of triangles approximating quarter discs)
 *  bay        a rounded snow peninsula bulging in from one side
 *  lroom      offset rooms: one corner block removed (L-shaped floor)
 *  hourglass  peninsulas from two opposite sides leave a waist between two rooms
 *  island     a snow island in the middle — routes loop around it
 *  twinRooms  a long spit from one side splits two rooms joined around its tip
 *
 * Only + − × ÷ and literal direction tables are used (deterministic layouts).
 */
import type { Rng } from '../core/rng';
import type { ArenaShape, WallBlock } from '../levels/types';

export interface ShapeResult {
  walls: WallBlock[];
  /** Rough bounding boxes of carved regions (obstacle/goal placement avoidance). */
  boxes: Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
}

/** cos/sin of 0°, 15°, …, 90° (quarter-circle fan), literal. */
const QUARTER: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.9659258263, 0.2588190451], [0.8660254038, 0.5], [0.7071067812, 0.7071067812],
  [0.5, 0.8660254038], [0.2588190451, 0.9659258263], [0, 1],
];

/** Half-ellipse dome as a convex polygon: base on an edge, bulging inward. */
const DOME: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [-0.9659258263, 0.2588190451], [-0.8660254038, 0.5], [-0.7071067812, 0.7071067812], [-0.5, 0.8660254038], [-0.2588190451, 0.9659258263],
  [0, 1], [0.2588190451, 0.9659258263], [0.5, 0.8660254038], [0.7071067812, 0.7071067812], [0.8660254038, 0.5], [0.9659258263, 0.2588190451], [1, 0],
];

const OUT = 60; // carved shapes extend this far outside the arena so no seam shows against the outer bank

function boxOf(points: Array<[number, number]>) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { minX, minY, maxX, maxY };
}

const r10 = (v: number): number => Math.round(v / 10) * 10;

function cornerCove(res: ShapeResult, corner: number, rc: number, W: number, H: number): void {
  const x0 = corner % 2 === 0 ? 0 : W, y0 = corner < 2 ? 0 : H;
  const sx = corner % 2 === 0 ? 1 : -1, sy = corner < 2 ? 1 : -1;
  const cx = x0 + sx * rc, cy = y0 + sy * rc;
  const p0: [number, number] = [x0 - sx * OUT, y0 - sy * OUT];
  const arc: Array<[number, number]> = QUARTER.map(([c, s]) => [cx - sx * c * rc, cy - sy * s * rc]);
  for (let k = 0; k < arc.length - 1; k++) res.walls.push({ points: [p0, arc[k]!, arc[k + 1]!] });
  res.boxes.push(boxOf([p0, [x0 + sx * rc, y0 + sy * rc]]));
}

/** Dome peninsula from edge `side` (0 top, 1 right, 2 bottom, 3 left) centred at fraction t, half-width hw, depth dep. */
function dome(res: ShapeResult, side: number, t: number, hw: number, dep: number, W: number, H: number): void {
  const pts: Array<[number, number]> = [];
  const base = side === 0 || side === 2 ? t * W : t * H;
  for (const [u, v] of DOME) {
    const along = base + u * hw, inward = v * dep;
    if (side === 0) pts.push([along, inward]);
    else if (side === 2) pts.push([along, H - inward]);
    else if (side === 3) pts.push([inward, along]);
    else pts.push([W - inward, along]);
  }
  // Close the polygon outside the arena so it merges with the bank.
  if (side === 0) pts.push([base + hw, -OUT], [base - hw, -OUT]);
  else if (side === 2) pts.push([base + hw, H + OUT], [base - hw, H + OUT]);
  else if (side === 3) pts.push([-OUT, base + hw], [-OUT, base - hw]);
  else pts.push([W + OUT, base + hw], [W + OUT, base - hw]);
  res.walls.push({ points: pts });
  res.boxes.push(boxOf(pts));
}

export function buildShape(shape: ArenaShape, W: number, H: number, rng: Rng): ShapeResult {
  const res: ShapeResult = { walls: [], boxes: [] };
  const m = Math.min(W, H);
  switch (shape) {
    case 'rect': {
      // Softened corners only (tiny coves) so even plain rinks feel hand-shaped.
      for (let c = 0; c < 4; c++) cornerCove(res, c, r10(m * 0.07), W, H);
      break;
    }
    case 'cove': {
      const corners = [0, 1, 2, 3];
      rng.shuffle(corners);
      const n = rng.int(2, 4);
      for (let i = 0; i < 4; i++) cornerCove(res, corners[i]!, r10(i < n ? m * rng.range(0.2, 0.28) : m * 0.07), W, H);
      break;
    }
    case 'bay': {
      for (let c = 0; c < 4; c++) cornerCove(res, c, r10(m * 0.08), W, H);
      const side = rng.int(0, 3);
      const horizontal = side === 0 || side === 2;
      dome(res, side, rng.range(0.35, 0.65), r10((horizontal ? W : H) * rng.range(0.13, 0.18)), r10((horizontal ? H : W) * rng.range(0.2, 0.27)), W, H);
      break;
    }
    case 'lroom': {
      const c = rng.int(0, 3);
      const bw = r10(W * rng.range(0.3, 0.38)), bh = r10(H * rng.range(0.3, 0.38));
      const x0 = c % 2 === 0 ? -OUT : W - bw, x1 = c % 2 === 0 ? bw : W + OUT;
      const y0 = c < 2 ? -OUT : H - bh, y1 = c < 2 ? bh : H + OUT;
      const pts: Array<[number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      res.walls.push({ points: pts });
      res.boxes.push(boxOf(pts));
      // Round the inner elbow and the opposite corners.
      for (let k = 0; k < 4; k++) if (k !== c) cornerCove(res, k, r10(m * 0.09), W, H);
      break;
    }
    case 'hourglass': {
      for (let c = 0; c < 4; c++) cornerCove(res, c, r10(m * 0.08), W, H);
      const vertical = W >= H; // domes from top & bottom on wide arenas
      const t = rng.range(0.42, 0.58);
      const span = vertical ? H : W;
      const dep = r10(span * rng.range(0.24, 0.3));
      const hw = r10((vertical ? W : H) * rng.range(0.09, 0.12));
      dome(res, vertical ? 0 : 3, t, hw, dep, W, H);
      dome(res, vertical ? 2 : 1, t, hw, dep, W, H);
      break;
    }
    case 'island': {
      for (let c = 0; c < 4; c++) cornerCove(res, c, r10(m * 0.08), W, H);
      const cx = W * rng.range(0.44, 0.56), cy = H * rng.range(0.44, 0.56);
      const rx = r10(m * rng.range(0.13, 0.17)), ry = r10(rx * rng.range(0.7, 0.95));
      const pts: Array<[number, number]> = [];
      for (const [c, s] of QUARTER.slice(0, 6)) pts.push([cx + c * rx, cy + s * ry]);
      for (const [c, s] of QUARTER.slice(0, 6)) pts.push([cx - s * rx, cy + c * ry]);
      for (const [c, s] of QUARTER.slice(0, 6)) pts.push([cx - c * rx, cy - s * ry]);
      for (const [c, s] of QUARTER.slice(0, 6)) pts.push([cx + s * rx, cy - c * ry]);
      res.walls.push({ points: pts });
      res.boxes.push(boxOf(pts));
      break;
    }
    case 'twinRooms': {
      for (let c = 0; c < 4; c++) cornerCove(res, c, r10(m * 0.08), W, H);
      const wide = W >= H;
      const fromStart = rng.chance(0.5);
      const at = (wide ? W : H) * rng.range(0.44, 0.56);
      const len = (wide ? H : W) * rng.range(0.52, 0.6);
      const th = r10(rng.range(70, 96));
      const tip = r10(th * 0.5);
      let pts: Array<[number, number]>;
      if (wide) {
        const y0 = fromStart ? -OUT : H + OUT, y1 = fromStart ? len : H - len;
        pts = [[at - th / 2, y0], [at + th / 2, y0], [at + th / 2, y1 - (fromStart ? tip : -tip)], [at, y1], [at - th / 2, y1 - (fromStart ? tip : -tip)]];
      } else {
        const x0 = fromStart ? -OUT : W + OUT, x1 = fromStart ? len : W - len;
        pts = [[x0, at - th / 2], [x0, at + th / 2], [x1 - (fromStart ? tip : -tip), at + th / 2], [x1, at], [x1 - (fromStart ? tip : -tip), at - th / 2]];
      }
      res.walls.push({ points: pts });
      res.boxes.push(boxOf(pts));
      break;
    }
  }
  return res;
}

/** Shape choice by difficulty and the region's layout language. */
export function chooseShape(rng: Rng, d: number, layout: Partial<Record<string, number>>): ArenaShape {
  const w: Array<{ s: ArenaShape; w: number }> = [
    { s: 'rect', w: d < 6 ? 3 : 1.2 },
    { s: 'cove', w: d < 3 ? 0.6 : 2 },
    { s: 'bay', w: d < 4 ? 0 : 1.6 },
    { s: 'lroom', w: d < 12 ? 0 : 1.4 },
    { s: 'island', w: d < 12 ? 0 : 1.2 + (layout.island ?? 0) * 0.3 },
    { s: 'hourglass', w: d < 18 ? 0 : 1.2 + (layout.channel ?? 0) * 0.3 },
    { s: 'twinRooms', w: d < 28 ? 0 : 1.1 + (layout.channel ?? 0) * 0.3 },
  ];
  return rng.weighted(w, (x) => x.w).s;
}
