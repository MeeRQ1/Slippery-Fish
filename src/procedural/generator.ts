/**
 * Versioned, seeded level generator (GENERATOR_VERSION in config/versions).
 *
 * Layout = arena shape + stash anchor + player spawn + one or more layout
 * MOTIFS (divider, funnel, pillars, islands, ring, maze, channel, mirrored
 * scatter) built from the region's preferred Batch 4 obstacle roles — never
 * random clutter. Then fish, enemies and surfaces are placed with spacing
 * rules, the result is validated at real collider sizes, and invalid layouts
 * are regenerated deterministically (bounded retries) with a verified
 * fallback. Only integer/IEEE-basic math + sqrt is used so the same seed gives
 * the same layout in every browser.
 */
import { ENEMIES, FISH, PLAYER, STASH, type EnemyType, type FishVariant, type SurfaceType } from '../config/gameplay';
import { OBSTACLES, OBSTACLE_IDS, type ObstacleId, type ObstacleRole } from '../config/obstacles';
import { REGION_BY_ID, type RegionDef, type RegionId } from '../config/regions';
import { CONTENT_VERSION, GENERATOR_VERSION } from '../config/versions';
import { Rng } from '../core/rng';
import { buildStatics, obstacleColliders } from '../gameplay/arena';
import type { EnemySpawn, FishSpawn, GameMode, LevelDef, ObstaclePlacement, Point, SurfacePatch, TutorialInfo, WallBlock } from '../levels/types';
import { Layer, PhysicsWorld, type StaticShape } from '../physics/world';
import { NavGrid } from '../enemies/nav';
import { knobs, type DifficultyKnobs } from './difficulty';
import { pathFieldDistance, validateLevel } from './validate';

export interface GenRequest {
  /** Full seed string (should already include mode/date/index). Versions are appended here. */
  seed: string;
  id: string;
  mode: GameMode;
  index: number;
  region: RegionId;
  difficulty: number;
  hard: boolean;
  seedCode?: string;
  tutorial?: TutorialInfo;
  overrides?: Partial<DifficultyKnobs> & { motifs?: Motif[]; stashAnchor?: [number, number]; noEnemies?: boolean };
}

export type Motif = 'scatter' | 'divider' | 'funnel' | 'pillars' | 'islands' | 'ring' | 'maze' | 'channel' | 'mirror';

const WALL_CLEAR = 72;
const GAP = 76;
const MAX_ATTEMPTS = 28;
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const round = (v: number, step = 1): number => Math.round(v / step) * step;

interface Box { minX: number; minY: number; maxX: number; maxY: number }

class LayoutBuilder {
  readonly obstacles: ObstaclePlacement[] = [];
  private boxes: Box[] = [];
  constructor(readonly rng: Rng, readonly W: number, readonly H: number, readonly region: RegionDef, readonly keepOut: Array<{ x: number; y: number; r: number }>, wallBoxes: Box[]) {
    this.boxes.push(...wallBoxes);
  }

  pickType(roles: ObstacleRole[]): ObstacleId | null {
    const ids = OBSTACLE_IDS.filter((id) => roles.includes(OBSTACLES[id]!.role));
    if (ids.length === 0) return null;
    return this.rng.weighted(ids, (id) => (this.region.layout[OBSTACLES[id]!.role] ?? 0.4) + 0.2);
  }

  /** Places an obstacle if it respects wall clearance, gaps and keep-outs. */
  place(type: ObstacleId, x: number, y: number, scale?: number, flip?: boolean): boolean {
    const def = OBSTACLES[type]!;
    const s = scale ?? round(this.rng.range(def.scaleRange[0], def.scaleRange[1]), 0.05);
    const o: ObstaclePlacement = { type, x: round(x), y: round(y), scale: s, flip: def.canFlip ? (flip ?? this.rng.chance(0.5)) : false };
    const box = aabb(obstacleColliders(o));
    if (box.minX < WALL_CLEAR || box.minY < WALL_CLEAR || box.maxX > this.W - WALL_CLEAR || box.maxY > this.H - WALL_CLEAR) return false;
    for (const k of this.keepOut) {
      const cx = Math.max(box.minX, Math.min(k.x, box.maxX)), cy = Math.max(box.minY, Math.min(k.y, box.maxY));
      if (dist(cx, cy, k.x, k.y) < k.r) return false;
    }
    for (const b of this.boxes) {
      if (box.minX < b.maxX + GAP && box.maxX > b.minX - GAP && box.minY < b.maxY + GAP && box.maxY > b.minY - GAP) return false;
    }
    this.obstacles.push(o);
    this.boxes.push(box);
    return true;
  }

  tryRoles(roles: ObstacleRole[], x: number, y: number, tries = 3): boolean {
    for (let i = 0; i < tries; i++) {
      const t = this.pickType(roles);
      if (t && this.place(t, x + this.rng.range(-18, 18) * i, y + this.rng.range(-18, 18) * i)) return true;
    }
    return false;
  }
}

function aabb(statics: StaticShape[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of statics) {
    minX = Math.min(minX, s.minX); minY = Math.min(minY, s.minY);
    maxX = Math.max(maxX, s.maxX); maxY = Math.max(maxY, s.maxY);
  }
  return { minX, minY, maxX, maxY };
}

// ------------------------------------------------------------------ motifs

function motifScatter(b: LayoutBuilder, count: number, mirror: boolean, axis: { sx: number; sy: number; px: number; py: number }): void {
  const roles: ObstacleRole[] = ['block', 'pillar', 'island', 'cluster', 'wedge', 'cross', 'wall', 'corner'];
  // Jittered grid ("Poisson-ish") rather than uniform randomness.
  const cols = 4, rows = 3;
  const cells: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
  b.rng.shuffle(cells);
  let placed = 0;
  for (const [c, r] of cells) {
    if (placed >= count) break;
    const x = ((c + 0.5 + b.rng.range(-0.3, 0.3)) / cols) * b.W;
    const y = ((r + 0.5 + b.rng.range(-0.3, 0.3)) / rows) * b.H;
    const t = b.pickType(roles);
    if (!t) continue;
    if (b.place(t, x, y)) {
      placed++;
      if (mirror && placed < count) {
        // Mirror across the perpendicular bisector of player→stash for fair symmetric routes.
        const mx = axis.px + axis.sx - x, my = axis.py + axis.sy - y;
        if (b.place(t, mx, my, b.obstacles[b.obstacles.length - 1]!.scale, !b.obstacles[b.obstacles.length - 1]!.flip)) placed++;
      }
    }
  }
}

function motifDivider(b: LayoutBuilder, vertical: boolean): void {
  const gaps = b.rng.int(1, 2);
  const span = vertical ? b.H : b.W;
  const at = (vertical ? b.W : b.H) * b.rng.range(0.42, 0.58);
  const pieces = 3 + gaps;
  const gapIdx = new Set<number>();
  while (gapIdx.size < gaps) gapIdx.add(b.rng.int(0, pieces - 1));
  for (let i = 0; i < pieces; i++) {
    if (gapIdx.has(i)) continue;
    const along = ((i + 0.5) / pieces) * span;
    const roles: ObstacleRole[] = vertical ? ['pillar', 'block'] : ['wall', 'block'];
    b.tryRoles(roles, vertical ? at : along, vertical ? along : at);
  }
}

function motifFunnel(b: LayoutBuilder, stash: Point, player: Point): void {
  const dx = stash.x - player.x, dy = stash.y - player.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / l, uy = dy / l;
  const nx = -uy, ny = ux;
  const back = 260 + b.rng.range(0, 60), spread = 170 + b.rng.range(0, 50);
  for (const side of [-1, 1]) {
    b.tryRoles(['wedge', 'wall', 'corner'], stash.x - ux * back + nx * spread * side, stash.y - uy * back + ny * spread * side, 4);
  }
}

function motifPillars(b: LayoutBuilder, count: number): void {
  const cols = count >= 6 ? 3 : 2, rows = count >= 4 ? 2 : 1;
  const x0 = b.W * b.rng.range(0.3, 0.38), x1 = b.W * b.rng.range(0.62, 0.7);
  const y0 = b.H * 0.33, y1 = b.H * 0.67;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + ((x1 - x0) * c) / (cols - 1);
      const y = rows === 1 ? b.H / 2 : y0 + ((y1 - y0) * r) / (rows - 1);
      b.tryRoles(['pillar', 'cluster'], x, y, 2);
    }
  }
}

function motifIslands(b: LayoutBuilder, count: number): void {
  for (let i = 0; i < count; i++) {
    b.tryRoles(['island', 'cluster'], b.rng.range(0.2, 0.8) * b.W, b.rng.range(0.2, 0.8) * b.H, 4);
  }
}

function motifRing(b: LayoutBuilder, stash: Point): void {
  const n = b.rng.int(3, 4);
  const r = STASH.radius + 170 + b.rng.range(0, 50);
  const start = b.rng.range(0, 1);
  for (let i = 0; i < n; i++) {
    // Angles from a fixed table (no trig) — eight compass points + jitter.
    const k = (Math.floor(start * 8) + i * Math.round(8 / n)) % 8;
    const [cx, cy] = COMPASS[k]!;
    b.tryRoles(['block', 'wall', 'corner', 'wedge'], stash.x + cx * r, stash.y + cy * r, 3);
  }
}

function motifMaze(b: LayoutBuilder, count: number): void {
  // Offset walls / zigzags in staggered columns.
  const cols = Math.max(2, Math.min(4, Math.round(count / 2)));
  for (let c = 0; c < cols; c++) {
    const x = ((c + 1) / (cols + 1)) * b.W;
    const top = c % 2 === 0;
    b.tryRoles(['corner', 'wall'], x, top ? b.H * 0.3 : b.H * 0.7, 3);
    if (b.rng.chance(0.6)) b.tryRoles(['block', 'pillar'], x + b.rng.range(-60, 60), top ? b.H * 0.75 : b.H * 0.25, 2);
  }
}

function motifChannel(b: LayoutBuilder, stash: Point): void {
  const horizontal = b.rng.chance(0.5);
  const cx = horizontal ? (stash.x < b.W / 2 ? b.W * 0.62 : b.W * 0.38) : b.W / 2;
  const cy = horizontal ? b.H / 2 : (stash.y < b.H / 2 ? b.H * 0.62 : b.H * 0.38);
  if (!b.place('narrowPassage', cx, cy)) b.tryRoles(['pillar'], cx, cy, 2);
  b.tryRoles(['wall', 'block'], horizontal ? cx : cx - 260, horizontal ? cy - 230 : cy, 2);
  b.tryRoles(['wall', 'block'], horizontal ? cx : cx + 260, horizontal ? cy + 230 : cy, 2);
}

const COMPASS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.7071067812, 0.7071067812], [0, 1], [-0.7071067812, 0.7071067812], [-1, 0], [-0.7071067812, -0.7071067812], [0, -1], [0.7071067812, -0.7071067812],
];

// ------------------------------------------------------------------ main

export function generateLevel(req: GenRequest): LevelDef {
  const fullSeed = `${req.seed}|c${CONTENT_VERSION}|g${GENERATOR_VERSION}|${req.hard ? 'H' : 'N'}`;
  const k = { ...knobs(req.difficulty, req.hard), ...stripUndefined(req.overrides ?? {}) } as DifficultyKnobs;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = new Rng(`${fullSeed}#${attempt}`);
    const level = tryGenerate(req, k, rng, fullSeed, attempt);
    if (!level) continue;
    const statics = buildStatics(level);
    const v = validateLevel(level, statics, k.enemyFishGap * 0.75);
    if (v.ok) {
      level.parSeconds = estimatePar(level, v.fishToStash, v.playerToFish);
      return level;
    }
  }
  return fallbackLevel(req, k, fullSeed);
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function tryGenerate(req: GenRequest, k: DifficultyKnobs, rng: Rng, fullSeed: string, attempt: number): LevelDef | null {
  const region = REGION_BY_ID[req.region];
  // Arena: target area from difficulty, aspect from the region's layout language.
  const aspect = rng.range(region.aspect[0], region.aspect[1]);
  const area = k.arenaW * k.arenaH * rng.range(0.92, 1.08);
  const W = round(Math.sqrt(area * aspect), 20);
  const H = round(W / aspect, 20);
  const walls: WallBlock[] = [];
  const wallBoxes: Box[] = [];
  if (rng.chance(k.wallBlockChance)) {
    const corners = rng.int(1, 2);
    const used = new Set<number>();
    for (let i = 0; i < corners; i++) {
      const c = rng.int(0, 3);
      if (used.has(c)) continue;
      used.add(c);
      const s = round(rng.range(140, 230), 10);
      const x = c % 2 === 0 ? 0 : W, y = c < 2 ? 0 : H;
      const sx = c % 2 === 0 ? 1 : -1, sy = c < 2 ? 1 : -1;
      // Triangular corner cut (convex).
      walls.push({ points: [[x - sx * 40, y - sy * 40], [x + sx * s, y - sy * 40], [x - sx * 40, y + sy * s]] });
      wallBoxes.push({ minX: Math.min(x, x + sx * s), minY: Math.min(y, y + sy * s), maxX: Math.max(x, x + sx * s), maxY: Math.max(y, y + sy * s) });
    }
  }

  // Stash anchor weighted by edge preference.
  const e = k.stashEdge;
  const anchors: Array<{ p: [number, number]; w: number }> = [
    { p: [0.5, 0.5], w: (1 - e) * 3 },
    { p: [0.72, 0.5], w: 1.2 }, { p: [0.28, 0.5], w: 1.2 }, { p: [0.5, 0.26], w: 0.8 }, { p: [0.5, 0.74], w: 0.8 },
    { p: [0.2, 0.24], w: e * 1.6 }, { p: [0.8, 0.24], w: e * 1.6 }, { p: [0.2, 0.76], w: e * 1.6 }, { p: [0.8, 0.76], w: e * 1.6 },
    { p: [0.14, 0.5], w: e * 1.2 }, { p: [0.86, 0.5], w: e * 1.2 },
  ];
  const ap = req.overrides?.stashAnchor ?? rng.weighted(anchors, (a) => a.w).p;
  const stash = { x: round(Math.max(STASH.radius + 70, Math.min(W - STASH.radius - 70, ap[0] * W))), y: round(Math.max(STASH.radius + 70, Math.min(H - STASH.radius - 70, ap[1] * H))) };

  // Player spawn: one of the far candidates from the stash.
  const diag = Math.sqrt(W * W + H * H);
  const pc: Point[] = [[0.12, 0.5], [0.88, 0.5], [0.5, 0.15], [0.5, 0.85], [0.14, 0.2], [0.86, 0.2], [0.14, 0.8], [0.86, 0.8]]
    .map(([fx, fy]) => ({ x: round(fx! * W), y: round(fy! * H) }))
    .filter((p) => dist(p.x, p.y, stash.x, stash.y) > diag * 0.3);
  pc.sort((a, b) => dist(b.x, b.y, stash.x, stash.y) - dist(a.x, a.y, stash.x, stash.y));
  if (pc.length === 0) return null;
  const player = pc[rng.int(0, Math.min(2, pc.length - 1))]!;

  // Obstacles from motifs.
  const keepOut = [{ x: stash.x, y: stash.y, r: STASH.radius + 95 }, { x: player.x, y: player.y, r: 105 }];
  const lb = new LayoutBuilder(rng, W, H, region, keepOut, wallBoxes);
  const motifs: Motif[] = req.overrides?.motifs ?? chooseMotifs(rng, k, region);
  for (const m of motifs) {
    switch (m) {
      case 'scatter': motifScatter(lb, k.obstacleCount, false, { sx: stash.x, sy: stash.y, px: player.x, py: player.y }); break;
      case 'mirror': motifScatter(lb, k.obstacleCount, true, { sx: stash.x, sy: stash.y, px: player.x, py: player.y }); break;
      case 'divider': motifDivider(lb, Math.abs(stash.x - player.x) > Math.abs(stash.y - player.y)); break;
      case 'funnel': motifFunnel(lb, stash, player); break;
      case 'pillars': motifPillars(lb, Math.max(2, k.obstacleCount)); break;
      case 'islands': motifIslands(lb, Math.max(2, Math.ceil(k.obstacleCount * 0.6))); break;
      case 'ring': motifRing(lb, stash); break;
      case 'maze': motifMaze(lb, k.obstacleCount); break;
      case 'channel': motifChannel(lb, stash); break;
    }
  }
  if (lb.obstacles.length < k.obstacleCount && k.obstacleCount > 0) {
    motifScatter(lb, k.obstacleCount - lb.obstacles.length, false, { sx: stash.x, sy: stash.y, px: player.x, py: player.y });
  }

  const partial: LevelDef = {
    id: req.id, mode: req.mode, index: req.index, seed: fullSeed, contentVersion: CONTENT_VERSION, generatorVersion: GENERATOR_VERSION,
    region: req.region, arena: { width: W, height: H, walls }, player, stash, fish: [], fishRequired: k.fishRequired,
    enemies: [], obstacles: lb.obstacles, surfaces: [], enemySpeed: Math.round(k.enemySpeed * 1000) / 1000,
    parSeconds: 0, difficulty: Math.round(req.difficulty * 100) / 100, hard: req.hard,
    ...(req.seedCode ? { seedCode: req.seedCode } : {}),
    ...(req.tutorial ? { tutorial: req.tutorial } : {}),
  };
  const statics = buildStatics(partial);
  const world = new PhysicsWorld();
  world.statics = statics;
  const pGrid = new NavGrid(W, H, 20, PLAYER.radius + 2, statics, Layer.Player);
  const stashField = pGrid.buildField(pGrid.cellOf(stash.x, stash.y));

  // Fish.
  partial.fish = placeFish(rng, k, partial, world, pGrid, stashField, diag);
  if (partial.fish.length < k.fishCount) return null;
  // Enemies.
  if (!req.overrides?.noEnemies) {
    partial.enemies = placeEnemies(rng, k, partial, world);
    if (partial.enemies.length < k.enemyCount) return null;
  }
  // Surfaces (region-specific).
  partial.surfaces = placeSurfaces(rng, k, region, partial);
  void attempt;
  return partial;
}

function chooseMotifs(rng: Rng, k: DifficultyKnobs, region: RegionDef): Motif[] {
  if (k.obstacleCount === 0) return [];
  const simple: Motif[] = ['scatter', 'islands', 'pillars', 'mirror'];
  const mid: Motif[] = ['divider', 'funnel', 'ring', 'mirror', 'pillars'];
  const complex: Motif[] = ['maze', 'channel', 'ring', 'divider'];
  const roll = rng.next();
  let primary: Motif;
  if (roll < k.complexity * 0.6) primary = rng.pick(complex);
  else if (roll < 0.25 + k.complexity) primary = rng.pick(mid);
  else primary = rng.pick(simple);
  // Region layout language nudges the choice.
  if ((region.layout.channel ?? 0) >= 2 && k.complexity > 0.3 && rng.chance(0.4)) primary = 'channel';
  if ((region.layout.island ?? 0) >= 3 && rng.chance(0.35)) primary = 'islands';
  const out: Motif[] = [primary];
  if (k.complexity > 0.45 && rng.chance(k.complexity)) out.push(rng.pick(mid.filter((m) => m !== primary)));
  return out;
}

function placeFish(rng: Rng, k: DifficultyKnobs, level: LevelDef, world: PhysicsWorld, grid: NavGrid, stashField: Float32Array, diag: number): FishSpawn[] {
  const out: FishSpawn[] = [];
  const W = level.arena.width, H = level.arena.height;
  const minD = Math.max(STASH.radius + 90, k.fishDistance * diag);
  const variants: FishVariant[] = [];
  for (let i = 0; i < k.fishCount; i++) variants.push('standard');
  if (level.difficulty > 18) {
    for (let i = 0; i < variants.length; i++) if (rng.chance(0.18)) variants[i] = rng.chance(0.5) ? 'small' : 'large';
  }
  if (level.difficulty > 6 && rng.chance(0.1) && variants.length > 0) variants[variants.length - 1] = 'rare';
  for (const variant of variants) {
    const r = FISH.variants[variant].radius;
    let best: Point | null = null;
    let bestScore = -Infinity;
    for (let c = 0; c < 70; c++) {
      const x = round(rng.range(WALL_CLEAR + r, W - WALL_CLEAR - r));
      const y = round(rng.range(WALL_CLEAR + r, H - WALL_CLEAR - r));
      const ds = dist(x, y, level.stash.x, level.stash.y);
      if (ds < minD) continue;
      if (dist(x, y, level.player.x, level.player.y) < 120) continue;
      if (out.some((f) => dist(f.x, f.y, x, y) < 90)) continue;
      if (world.overlapsStatic(x, y, r + 26, Layer.Fish)) continue;
      const route = pathFieldDistance(grid, stashField, x, y, r + PLAYER.radius + 10);
      if (route === Infinity) continue;
      let score = -Math.abs(ds - minD * 1.25) * 0.01 + rng.next();
      if (k.occludedFishChance > 0 && !grid.lineClear(x, y, level.stash.x, level.stash.y)) score += k.occludedFishChance * 2;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (best) out.push({ x: best.x, y: best.y, variant });
  }
  return out;
}

function placeEnemies(rng: Rng, k: DifficultyKnobs, level: LevelDef, world: PhysicsWorld): EnemySpawn[] {
  const out: EnemySpawn[] = [];
  const W = level.arena.width, H = level.arena.height;
  for (let i = 0; i < k.enemyCount; i++) {
    // Earlier slots favour the slower bear; later ones mix in wolves and seals.
    const pool = k.enemyTypes;
    const type: EnemyType = i === 0 && pool.length > 1 && rng.chance(0.45) ? 'polarBear' : rng.pick(pool);
    const r = ENEMIES[type].radius;
    let placed = false;
    for (let c = 0; c < 60 && !placed; c++) {
      // Edges and corners ("dens").
      const edge = rng.int(0, 3);
      const t = rng.range(0.08, 0.92);
      const m = WALL_CLEAR + r - 20;
      const x = round(edge === 0 ? m : edge === 1 ? W - m : t * W);
      const y = round(edge === 2 ? m : edge === 3 ? H - m : t * H);
      if (dist(x, y, level.player.x, level.player.y) < 380) continue;
      if (dist(x, y, level.stash.x, level.stash.y) < STASH.radius + 180) continue;
      if (level.fish.some((f) => dist(f.x, f.y, x, y) < k.enemyFishGap)) continue;
      if (out.some((o) => dist(o.x, o.y, x, y) < 140)) continue;
      if (world.overlapsStatic(x, y, r + 8, Layer.Enemy)) continue;
      out.push({ type, x, y, delay: Math.round((i * k.enemyStagger + rng.range(0, 0.5)) * 100) / 100 });
      placed = true;
    }
  }
  return out;
}

function placeSurfaces(rng: Rng, k: DifficultyKnobs, region: RegionDef, level: LevelDef): SurfacePatch[] {
  const out: SurfacePatch[] = [];
  if (region.surfaces.length === 0 || !rng.chance(k.surfaceChance)) return out;
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const type: SurfaceType = rng.pick(region.surfaces);
    const rx = round(rng.range(80, 170)), ry = round(rng.range(55, 115));
    const x = round(rng.range(rx + 40, level.arena.width - rx - 40));
    const y = round(rng.range(ry + 40, level.arena.height - ry - 40));
    if (dist(x, y, level.player.x, level.player.y) < Math.max(rx, ry) + 60) continue;
    out.push({ type, x, y, rx, ry });
  }
  return out;
}

/** Estimated "pro" time: grid path lengths at penguin size / dribble speed + handling overhead. */
function estimatePar(level: LevelDef, fishToStash: number[], playerToFish: number[]): number {
  const order = fishToStash.map((d, i) => ({ d, i })).filter((o) => o.d < Infinity).sort((a, b) => a.d - b.d).slice(0, level.fishRequired);
  if (order.length === 0) return 30;
  const dribble = PLAYER.walkSpeed * 1.08;
  let total = playerToFish[order[0]!.i]! + order[0]!.d;
  for (let j = 1; j < order.length; j++) total += order[j]!.d * 2.15;
  const enemyTax = level.enemies.length * 0.9;
  const t = total / dribble + order.length * 1.1 + 0.8 + enemyTax;
  return Math.round(t * 10) / 10;
}

/** Simple, verified layout used if every attempt fails validation. */
function fallbackLevel(req: GenRequest, k: DifficultyKnobs, fullSeed: string): LevelDef {
  const W = 1200, H = 760;
  const fishCount = Math.max(1, Math.min(k.fishCount, 4));
  const fish: FishSpawn[] = [];
  for (let i = 0; i < fishCount; i++) fish.push({ x: 520 + (i % 2) * 120, y: 200 + i * 120, variant: 'standard' });
  const enemyCount = Math.min(k.enemyCount, 2);
  const enemies: EnemySpawn[] = [];
  const types = k.enemyTypes;
  if (enemyCount > 0) enemies.push({ type: types[0]!, x: 1100, y: 110, delay: 1 });
  if (enemyCount > 1) enemies.push({ type: types[types.length - 1]!, x: 1100, y: 650, delay: 2.5 });
  const level: LevelDef = {
    id: req.id, mode: req.mode, index: req.index, seed: `${fullSeed}#fallback`, contentVersion: CONTENT_VERSION, generatorVersion: GENERATOR_VERSION,
    region: req.region, arena: { width: W, height: H, walls: [] }, player: { x: 160, y: 380 }, stash: { x: 940, y: 380 },
    fish, fishRequired: Math.min(fishCount, k.fishRequired), enemies,
    obstacles: [{ type: 'mediumBlock', x: 760, y: 170, scale: 0.9, flip: false }, { type: 'mediumBlock', x: 760, y: 590, scale: 0.9, flip: false }],
    surfaces: [], enemySpeed: Math.round(k.enemySpeed * 1000) / 1000, parSeconds: 0, difficulty: req.difficulty, hard: req.hard,
    ...(req.seedCode ? { seedCode: req.seedCode } : {}),
    ...(req.tutorial ? { tutorial: req.tutorial } : {}),
  };
  const v = validateLevel(level);
  level.parSeconds = estimatePar(level, v.fishToStash, v.playerToFish);
  return level;
}
