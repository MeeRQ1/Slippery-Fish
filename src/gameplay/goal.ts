/**
 * Goal geometry — the chicks' igloo courtyard.
 *
 *            igloo (always closes the back / north arc)
 *        ┌──────────────────────┐
 *        │    ╭──── 18 ────╮    │      ring of 24 segments (segment i spans
 *        ╰──╮ 14        21 ╭─╯         direction i → i+1, 15° each;
 *   12 ─┤   courtyard  ├─ 0             0 = east, 6 = south, 12 = west)
 *       │   (scoring   │
 *       ╰─╮ interior) ╭╯                fences close some segments;
 *         ╰─── 6 ─────╯                 gaps are the openings
 *
 * SCORING (the 70% rule): a fish's scoring footprint is its collider disk
 * (radius = body.r — never transparent sprite padding). The goal interior is
 * the disk of radius GOAL.interiorRadius. The contained fraction is the exact
 * circle–circle intersection area divided by the fish's area. Because that
 * fraction is a monotonic function of the centre distance d, the simulation
 * compares d against a precomputed threshold distance d* per fish radius
 * (`scoreDistance`) — exact, and only + − × in the per-step check. The
 * threshold is computed once (bisection on the exact area formula) and
 * rounded to 1e-4 u so every engine uses the same constant.
 *
 * ENTRY VALIDATION: solid fences/igloo physically block the ring, so the only
 * legitimate way in is an opening. The sim additionally records the ring
 * sector in which a fish crossed into the ring; crossing through a solid
 * sector (impossible in normal physics, but possible if a fish were forced
 * through by a solver edge case) marks the entry invalid and that fish cannot
 * score until it leaves the ring again.
 */
import { GOAL } from '../config/gameplay';

export const RING_SEGMENTS = 24;

/** cos/sin of k·15° (y-down screen coordinates), written as literals so geometry is engine-independent. */
export const RING_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.9659258263, 0.2588190451], [0.8660254038, 0.5], [0.7071067812, 0.7071067812],
  [0.5, 0.8660254038], [0.2588190451, 0.9659258263], [0, 1], [-0.2588190451, 0.9659258263],
  [-0.5, 0.8660254038], [-0.7071067812, 0.7071067812], [-0.8660254038, 0.5], [-0.9659258263, 0.2588190451],
  [-1, 0], [-0.9659258263, -0.2588190451], [-0.8660254038, -0.5], [-0.7071067812, -0.7071067812],
  [-0.5, -0.8660254038], [-0.2588190451, -0.9659258263], [0, -1], [0.2588190451, -0.9659258263],
  [0.5, -0.8660254038], [0.7071067812, -0.7071067812], [0.8660254038, -0.5], [0.9659258263, -0.2588190451],
];

/** Per-level goal layout: which ring segments carry a fence (bit i = segment i). */
export interface GoalLayout {
  fenceMask: number;
}

export const OPEN_GOAL: GoalLayout = Object.freeze({ fenceMask: 0 });

export function isIglooSegment(i: number): boolean {
  const [a, b] = GOAL.iglooSegments;
  return i >= a && i <= b;
}

/** Segments available for fences/openings, in clockwise order starting just after the igloo (east side). */
export const OPEN_SLOTS: readonly number[] = (() => {
  const out: number[] = [];
  for (let k = 1; k <= RING_SEGMENTS; k++) {
    const i = (GOAL.iglooSegments[1] + k) % RING_SEGMENTS;
    if (!isIglooSegment(i)) out.push(i);
  }
  return out;
})();

export function isSolidSegment(layout: GoalLayout, i: number): boolean {
  return isIglooSegment(i) || (layout.fenceMask & (1 << i)) !== 0;
}

/** Maximal runs of consecutive open segments (each run = one opening), in slot order. */
export function openings(layout: GoalLayout): number[][] {
  const runs: number[][] = [];
  let cur: number[] = [];
  for (const i of OPEN_SLOTS) {
    if (isSolidSegment(layout, i)) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push(i);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** A layout is legal when it has ≥1 opening and every opening is at least GOAL.minOpeningSegments wide. */
export function isLegalLayout(layout: GoalLayout): boolean {
  const runs = openings(layout);
  return runs.length > 0 && runs.every((r) => r.length >= GOAL.minOpeningSegments);
}

/** Ring point for direction index k (0..23) around centre (cx, cy). */
export function ringPoint(cx: number, cy: number, k: number, radius: number = GOAL.wallRadius): [number, number] {
  const d = RING_DIRS[((k % RING_SEGMENTS) + RING_SEGMENTS) % RING_SEGMENTS]!;
  return [cx + d[0] * radius, cy + d[1] * radius];
}

/** Ring segment containing the direction (dx, dy) from the goal centre (arithmetic only). */
export function sectorOf(dx: number, dy: number): number {
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = RING_DIRS[i]!, b = RING_DIRS[(i + 1) % RING_SEGMENTS]!;
    if (a[0] * dy - a[1] * dx >= 0 && dx * b[1] - dy * b[0] > 0) return i;
  }
  return 0;
}

// ------------------------------------------------------------------ 70% scoring

/** Exact area of intersection of two discs (radii R, r) whose centres are d apart. */
export function discIntersectionArea(R: number, r: number, d: number): number {
  if (d >= R + r) return 0;
  if (d <= Math.abs(R - r)) return Math.PI * Math.min(R, r) * Math.min(R, r);
  const a = (d * d + r * r - R * R) / (2 * d * r);
  const b = (d * d + R * R - r * r) / (2 * d * R);
  const k = (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R);
  return r * r * Math.acos(Math.max(-1, Math.min(1, a))) + R * R * Math.acos(Math.max(-1, Math.min(1, b))) - 0.5 * Math.sqrt(Math.max(0, k));
}

/** Fraction (0–1) of a fish disk of radius r, centred d from the goal centre, inside the interior. */
export function containedFraction(r: number, d: number, R: number = GOAL.interiorRadius): number {
  return discIntersectionArea(R, r, d) / (Math.PI * r * r);
}

const thresholdCache = new Map<string, number>();

/**
 * Largest centre distance at which ≥ `fraction` of the fish disk lies inside
 * the interior. Bisection on the exact formula; rounded to 1e-4 u.
 */
export function scoreDistance(r: number, fraction: number = GOAL.scoreFraction, R: number = GOAL.interiorRadius): number {
  const key = `${r}|${fraction}|${R}`;
  const hit = thresholdCache.get(key);
  if (hit !== undefined) return hit;
  let lo = Math.max(0, R - r), hi = R + r;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (containedFraction(r, mid, R) >= fraction) lo = mid;
    else hi = mid;
  }
  const v = Math.floor(lo * 10000) / 10000;
  thresholdCache.set(key, v);
  return v;
}

/** Squared distance from point (cx, cy) to segment (ax, ay)–(bx, by). */
export function segmentDistanceSq(cx: number, cy: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((cx - ax) * vx + (cy - ay) * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + vx * t - cx, py = ay + vy * t - cy;
  return px * px + py * py;
}

/** Where a scored fish slides to: just inside the igloo doorway (presentation only). */
export function doorPoint(cx: number, cy: number): [number, number] {
  return [cx, cy + GOAL.iglooBaseY - 8];
}
