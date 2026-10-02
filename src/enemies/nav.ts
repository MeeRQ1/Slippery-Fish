/**
 * Grid navigation for enemies.
 *
 * At level start we rasterise the arena into cells (ENEMY_GLOBAL.navCellSize)
 * and mark a cell blocked for a given agent radius if a circle of that radius
 * at the cell centre would overlap any static that blocks enemies. Flow fields
 * (Dijkstra distance-to-target) are built on demand and cached per target cell,
 * with a per-step rebuild budget so cost stays bounded regardless of level.
 */
import { collideCircleStatic, Layer, type StaticShape } from '../physics/world';

const SQRT2 = Math.SQRT2;

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cell: number,
    readonly agentRadius: number,
    statics: StaticShape[],
    layer: number = Layer.Enemy,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.blocked = new Uint8Array(this.cols * this.rows);
    const out = { nx: 0, ny: 0, pen: 0, cx: 0, cy: 0 };
    const r = agentRadius * 0.92; // slight leniency: physics will slide agents along walls
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = (cx + 0.5) * cell, y = (cy + 0.5) * cell;
        let b = 0;
        if (x < r || y < r || x > width - r || y > height - r) b = 1;
        else {
          for (const s of statics) {
            if ((s.blocks & layer) === 0) continue;
            if (collideCircleStatic(x, y, r, s, out)) { b = 1; break; }
          }
        }
        this.blocked[cy * this.cols + cx] = b;
      }
    }
  }

  cellOf(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
    return cy * this.cols + cx;
  }

  centerOf(index: number): { x: number; y: number } {
    const cx = index % this.cols, cy = Math.floor(index / this.cols);
    return { x: (cx + 0.5) * this.cell, y: (cy + 0.5) * this.cell };
  }

  /** Nearest walkable cell to `index` (spiral search), or -1. */
  nearestOpen(index: number, maxRing = 6): number {
    if (!this.blocked[index]) return index;
    const cx = index % this.cols, cy = Math.floor(index / this.cols);
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const i = ny * this.cols + nx;
          if (!this.blocked[i]) return i;
        }
      }
    }
    return -1;
  }

  /** Dijkstra-ish distance field from `target` (8-connected, no corner cutting). */
  buildField(target: number): Float32Array {
    const n = this.cols * this.rows;
    const dist = new Float32Array(n).fill(Infinity);
    const start = this.nearestOpen(target);
    if (start < 0) return dist;
    // Bucketed queue keyed by integer-ish distance keeps this O(n).
    const queue: number[] = [start];
    dist[start] = 0;
    let head = 0;
    const cols = this.cols, rows = this.rows, blocked = this.blocked;
    // Two-pass relaxation (BFS order then a chamfer refinement) gives smooth fields cheaply.
    while (head < queue.length) {
      const i = queue[head++]!;
      const cx = i % cols, cy = (i - cx) / cols;
      const d = dist[i]!;
      for (let k = 0; k < 8; k++) {
        const dx = DX[k]!, dy = DY[k]!;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (blocked[j]) continue;
        if (dx !== 0 && dy !== 0 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
        const nd = d + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
        if (nd < dist[j]!) {
          dist[j] = nd;
          queue.push(j);
        }
      }
    }
    return dist;
  }

  /** Straight-line walkability test (grid DDA). */
  lineClear(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(len / (this.cell * 0.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (this.blocked[this.cellOf(x0 + dx * t, y0 + dy * t)]) return false;
    }
    return true;
  }

  /** Direction toward the lowest-cost neighbour on a field; null if stuck. */
  descend(field: Float32Array, x: number, y: number): { x: number; y: number } | null {
    let i = this.cellOf(x, y);
    if (this.blocked[i]) {
      const o = this.nearestOpen(i, 3);
      if (o < 0) return null;
      i = o;
    }
    const cols = this.cols;
    const cx = i % cols, cy = (i - cx) / cols;
    let best = field[i]!, bi = -1;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k]!, ny = cy + DY[k]!;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= this.rows) continue;
      const j = ny * cols + nx;
      const v = field[j]!;
      if (v < best) { best = v; bi = j; }
    }
    if (bi < 0) return null;
    const c = this.centerOf(bi);
    const ddx = c.x - x, ddy = c.y - y;
    const l = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    return { x: ddx / l, y: ddy / l };
  }
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
