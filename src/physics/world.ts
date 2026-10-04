/**
 * SlipPhysics — a small, purpose-built 2D physics engine for Slippery Fish.
 *
 * Why not Matter.js? Every dynamic object in the game (penguins, fish,
 * enemies) is a circle sliding on a flat surface, and the whole design depends
 * on *predictable* air-hockey rebounds. A focused circle-vs-(circle|convex
 * polygon) solver gives us:
 *   - exact control over restitution, damping and the penguin "kick";
 *   - fixed sub-stepping + velocity caps that make tunnelling impossible for
 *     the speeds we allow (max travel per sub-step << smallest radius);
 *   - pure TypeScript with no DOM/Phaser dependency, so the same code runs in
 *     unit tests (Node) and could run on a ranked validation server;
 *   - only +, -, *, / and sqrt inside the step loop (no trig/exp), which keeps
 *     results reproducible for identical inputs within one JS engine.
 *     Cross-browser bit-identical results are NOT promised.
 *
 * Static colliders are convex polygons (optionally with rounded corners) or
 * circles. Each static has a `blocks` bitmask so "limited colliders" (e.g. the
 * stash rim that only stops enemies) are explicit.
 */

import { PHYSICS } from '../config/gameplay';

export const Layer = {
  Player: 1,
  Fish: 2,
  Enemy: 4,
  All: 7,
} as const;

export type StaticTag = 'wall' | 'obstacle' | 'fence' | 'stashRim' | 'backup';

export interface Body {
  id: number;
  layer: number;
  /** Which layers this body physically collides with. */
  mask: number;
  x: number;
  y: number;
  /** Previous fixed-step position for render interpolation. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  invMass: number;
  /** Bounciness used against statics (pairs use the max of both). */
  restitution: number;
  /** 1/s damping applied every sub-step (set per frame by the sim for surfaces). */
  damping: number;
  maxSpeed: number;
  /** Visual-only spin (radians, rad/s). */
  angle: number;
  angVel: number;
  angularDamping: number;
  /** Fraction of this body's approach speed added to a struck kickable body. */
  kick: number;
  kickable: boolean;
  enabled: boolean;
}

export interface StaticPoly {
  kind: 'poly';
  /** Flat [x0,y0,x1,y1,...] counter-clockwise in y-down screen space is NOT assumed; normals are computed robustly. */
  pts: number[];
  /** Outward unit normals per edge i (from vertex i to i+1). */
  nrm: number[];
  /** Corner rounding radius (u). */
  radius: number;
  minX: number; minY: number; maxX: number; maxY: number;
  blocks: number;
  restitution: number;
  tag: StaticTag;
}

export interface StaticCircle {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
  minX: number; minY: number; maxX: number; maxY: number;
  blocks: number;
  restitution: number;
  tag: StaticTag;
}

export type StaticShape = StaticPoly | StaticCircle;

export interface ContactEvent {
  a: Body;
  /** Other body, or null when the contact is with a static. */
  b: Body | null;
  staticTag: StaticTag | null;
  /** Approach speed along the normal (u/s, positive). */
  speed: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
}

let nextBodyId = 1;

export function createBody(init: Partial<Body> & { x: number; y: number; r: number }): Body {
  return {
    id: nextBodyId++,
    layer: Layer.Fish,
    mask: Layer.All,
    px: init.x,
    py: init.y,
    vx: 0,
    vy: 0,
    invMass: 1,
    restitution: 0.5,
    damping: 1,
    maxSpeed: 1000,
    angle: 0,
    angVel: 0,
    angularDamping: 2,
    kick: 0,
    kickable: false,
    enabled: true,
    ...init,
  };
}

/** Builds a convex polygon collider. Points may be in either winding. */
export function makePoly(points: ReadonlyArray<readonly [number, number]>, opts: { radius?: number; blocks?: number; restitution?: number; tag?: StaticTag } = {}): StaticPoly {
  const n = points.length;
  if (n < 3) throw new Error('polygon needs >= 3 points');
  // Determine winding via signed area so normals always point outward.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  const ordered = area < 0 ? [...points].reverse() : [...points];
  const pts: number[] = [];
  for (const p of ordered) pts.push(p[0], p[1]);
  const nrm: number[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x0 = pts[i * 2]!, y0 = pts[i * 2 + 1]!;
    const x1 = pts[((i + 1) % n) * 2]!, y1 = pts[((i + 1) % n) * 2 + 1]!;
    const ex = x1 - x0, ey = y1 - y0;
    const l = Math.sqrt(ex * ex + ey * ey) || 1;
    // With positive (CCW in math coords) area, outward normal is (ey, -ex).
    nrm.push(ey / l, -ex / l);
    minX = Math.min(minX, x0); minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x0); maxY = Math.max(maxY, y0);
  }
  const radius = opts.radius ?? 0;
  return {
    kind: 'poly', pts, nrm, radius,
    minX: minX - radius, minY: minY - radius, maxX: maxX + radius, maxY: maxY + radius,
    blocks: opts.blocks ?? Layer.All,
    restitution: opts.restitution ?? 0.7,
    tag: opts.tag ?? 'obstacle',
  };
}

export function makeRect(cx: number, cy: number, w: number, h: number, opts: { radius?: number; blocks?: number; restitution?: number; tag?: StaticTag } = {}): StaticPoly {
  const r = opts.radius ?? 0;
  // Shrink the core so the rounded rect keeps the requested outer size.
  const hw = Math.max(0.5, w / 2 - r), hh = Math.max(0.5, h / 2 - r);
  return makePoly([[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]], opts);
}

export function makeCircle(x: number, y: number, r: number, opts: { blocks?: number; restitution?: number; tag?: StaticTag } = {}): StaticCircle {
  return {
    kind: 'circle', x, y, r,
    minX: x - r, minY: y - r, maxX: x + r, maxY: y + r,
    blocks: opts.blocks ?? Layer.All,
    restitution: opts.restitution ?? 0.7,
    tag: opts.tag ?? 'obstacle',
  };
}

interface ClosestResult { nx: number; ny: number; pen: number; cx: number; cy: number }

/** Circle (x,y,r) vs static. Writes into `out` and returns true on overlap. */
export function collideCircleStatic(x: number, y: number, r: number, s: StaticShape, out: ClosestResult): boolean {
  if (x + r < s.minX || x - r > s.maxX || y + r < s.minY || y - r > s.maxY) return false;
  if (s.kind === 'circle') {
    const dx = x - s.x, dy = y - s.y;
    const d2 = dx * dx + dy * dy;
    const rr = r + s.r;
    if (d2 >= rr * rr) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) { out.nx = 0; out.ny = -1; } else { out.nx = dx / d; out.ny = dy / d; }
    out.pen = rr - d;
    out.cx = s.x + out.nx * s.r;
    out.cy = s.y + out.ny * s.r;
    return true;
  }
  const pts = s.pts, nrm = s.nrm, n = pts.length / 2;
  const reach = r + s.radius;
  // Max signed distance across edge planes.
  let maxD = -Infinity, maxI = 0;
  for (let i = 0; i < n; i++) {
    const d = (x - pts[i * 2]!) * nrm[i * 2]! + (y - pts[i * 2 + 1]!) * nrm[i * 2 + 1]!;
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > reach) return false;
  if (maxD <= 0) {
    // Centre inside the core polygon: push out along the least-penetrated edge.
    out.nx = nrm[maxI * 2]!;
    out.ny = nrm[maxI * 2 + 1]!;
    out.pen = reach - maxD;
    out.cx = x - out.nx * maxD;
    out.cy = y - out.ny * maxD;
    return true;
  }
  // Outside: find the closest point on the boundary.
  let best = Infinity, bx = 0, by = 0;
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2]!, ay = pts[i * 2 + 1]!;
    const j = (i + 1) % n;
    const ex = pts[j * 2]! - ax, ey = pts[j * 2 + 1]! - ay;
    const el2 = ex * ex + ey * ey;
    let t = el2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / el2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t, qy = ay + ey * t;
    const dx = x - qx, dy = y - qy;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; bx = qx; by = qy; }
  }
  if (best >= reach * reach) return false;
  const d = Math.sqrt(best);
  if (d < 1e-6) return false;
  out.nx = (x - bx) / d;
  out.ny = (y - by) / d;
  out.pen = reach - d;
  out.cx = bx + out.nx * s.radius;
  out.cy = by + out.ny * s.radius;
  return true;
}

export class PhysicsWorld {
  readonly bodies: Body[] = [];
  statics: StaticShape[] = [];
  /** Contacts recorded during the last `step` (first solver pass only). */
  readonly contacts: ContactEvent[] = [];
  /** Hard backup bounds: bodies can never leave this rectangle. */
  bounds = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };
  /** Pair restitution override hook (e.g. penguin↔fish uses a tuned value). */
  pairRestitution: (a: Body, b: Body) => number = (a, b) => Math.max(a.restitution, b.restitution);
  /** Friction coefficient for tangential impulses (spin). */
  friction = 0.15;
  private tmp: ClosestResult = { nx: 0, ny: 0, pen: 0, cx: 0, cy: 0 };

  add(body: Body): Body {
    this.bodies.push(body);
    return body;
  }

  remove(body: Body): void {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  /** Advances by one fixed step split into sub-steps. */
  step(dt: number, substeps: number = PHYSICS.substeps): void {
    this.contacts.length = 0;
    for (const b of this.bodies) {
      b.px = b.x;
      b.py = b.y;
    }
    const h = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      this.integrate(h);
      for (let it = 0; it < PHYSICS.solverIterations; it++) {
        this.solvePairs(it === 0 && s === 0);
        this.solveStatics(it === 0 && s === 0);
      }
      this.enforceBounds();
    }
  }

  private integrate(h: number): void {
    for (const b of this.bodies) {
      if (!b.enabled) continue;
      // Linear damping (first-order; h is tiny so this matches exp closely).
      const k = 1 - b.damping * h;
      const f = k < 0 ? 0 : k;
      b.vx *= f;
      b.vy *= f;
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > b.maxSpeed * b.maxSpeed) {
        const sc = b.maxSpeed / Math.sqrt(sp2);
        b.vx *= sc;
        b.vy *= sc;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      const ka = 1 - b.angularDamping * h;
      b.angVel *= ka < 0 ? 0 : ka;
      b.angle += b.angVel * h;
    }
  }

  private solvePairs(record: boolean): void {
    const list = this.bodies;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i]!;
      if (!a.enabled) continue;
      for (let j = i + 1; j < n; j++) {
        const b = list[j]!;
        if (!b.enabled) continue;
        if ((a.mask & b.layer) === 0 || (b.mask & a.layer) === 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 1;
        const ny = d > 1e-6 ? dy / d : 0;
        const pen = rr - d;
        const im = a.invMass + b.invMass;
        if (im <= 0) continue;
        // Positional correction split by inverse mass.
        const corr = Math.max(pen - PHYSICS.slop, 0) * PHYSICS.positionCorrection / im;
        a.x -= nx * corr * a.invMass;
        a.y -= ny * corr * a.invMass;
        b.x += nx * corr * b.invMass;
        b.y += ny * corr * b.invMass;
        // Relative velocity along normal (positive = separating).
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0) continue;
        const approach = -vn;
        const e = approach < PHYSICS.restingSpeed ? 0 : this.pairRestitution(a, b);
        const jn = (1 + e) * approach / im;
        a.vx -= nx * jn * a.invMass;
        a.vy -= ny * jn * a.invMass;
        b.vx += nx * jn * b.invMass;
        b.vy += ny * jn * b.invMass;
        // Kick: a striker adds part of its own approach speed to a kickable target.
        if (a.kick > 0 && b.kickable) {
          const av = a.vx * nx + a.vy * ny;
          if (av > 0) { b.vx += nx * av * a.kick; b.vy += ny * av * a.kick; }
        } else if (b.kick > 0 && a.kickable) {
          const bv = -(b.vx * nx + b.vy * ny);
          if (bv > 0) { a.vx -= nx * bv * b.kick; a.vy -= ny * bv * b.kick; }
        }
        // Tangential friction → spin (visual) and a slight deflection.
        const tx = -ny, ty = nx;
        const vt = rvx * tx + rvy * ty;
        let jt = -vt / im;
        const maxF = this.friction * jn;
        if (jt > maxF) jt = maxF; else if (jt < -maxF) jt = -maxF;
        a.vx -= tx * jt * a.invMass;
        a.vy -= ty * jt * a.invMass;
        b.vx += tx * jt * b.invMass;
        b.vy += ty * jt * b.invMass;
        a.angVel += (jt * a.invMass) / a.r;
        b.angVel -= (jt * b.invMass) / b.r;
        if (record && approach >= PHYSICS.restingSpeed) {
          this.contacts.push({ a, b, staticTag: null, speed: approach, x: a.x + nx * a.r, y: a.y + ny * a.r, nx, ny });
        }
      }
    }
  }

  private solveStatics(record: boolean): void {
    const out = this.tmp;
    for (const b of this.bodies) {
      if (!b.enabled || b.invMass <= 0) continue;
      for (const s of this.statics) {
        if ((s.blocks & b.layer) === 0) continue;
        if (!collideCircleStatic(b.x, b.y, b.r, s, out)) continue;
        const corr = Math.max(out.pen - PHYSICS.slop * 0.5, 0);
        b.x += out.nx * corr;
        b.y += out.ny * corr;
        const vn = b.vx * out.nx + b.vy * out.ny;
        if (vn >= 0) continue;
        const approach = -vn;
        // Fish use the static's tuned bounciness (walls vs ice); characters use their own.
        const e = approach < PHYSICS.restingSpeed ? 0 : b.layer === Layer.Fish ? s.restitution : b.restitution;
        b.vx += out.nx * approach * (1 + e);
        b.vy += out.ny * approach * (1 + e);
        // Glancing wall hits add a little spin.
        const tx = -out.ny, ty = out.nx;
        const vt = b.vx * tx + b.vy * ty;
        b.angVel += (vt / b.r) * 0.08;
        if (record && approach >= PHYSICS.restingSpeed) {
          this.contacts.push({ a: b, b: null, staticTag: s.tag, speed: approach, x: out.cx, y: out.cy, nx: out.nx, ny: out.ny });
        }
      }
    }
  }

  /** Invisible last-resort protection; normal play never reaches it. */
  private enforceBounds(): void {
    const bd = this.bounds;
    for (const b of this.bodies) {
      if (b.x - b.r < bd.minX) { b.x = bd.minX + b.r; if (b.vx < 0) b.vx = -b.vx * 0.5; }
      if (b.x + b.r > bd.maxX) { b.x = bd.maxX - b.r; if (b.vx > 0) b.vx = -b.vx * 0.5; }
      if (b.y - b.r < bd.minY) { b.y = bd.minY + b.r; if (b.vy < 0) b.vy = -b.vy * 0.5; }
      if (b.y + b.r > bd.maxY) { b.y = bd.maxY - b.r; if (b.vy > 0) b.vy = -b.vy * 0.5; }
    }
  }

  /** True if a circle at (x,y,r) overlaps any static that blocks `layer`. */
  overlapsStatic(x: number, y: number, r: number, layer: number): boolean {
    const out = this.tmp;
    for (const s of this.statics) {
      if ((s.blocks & layer) === 0) continue;
      if (collideCircleStatic(x, y, r, s, out)) return true;
    }
    return false;
  }
}
