/**
 * GameSim — the authoritative, presentation-free simulation of one level.
 *
 * Owns the physics world, penguin, DribbleFish, enemies and stash rules.
 * It never touches the DOM, Phaser, audio or storage: it consumes a SimInput
 * per fixed step and produces SimEvents that presentation layers react to.
 */
import {
  ENEMIES, ENEMY_GLOBAL, FISH, HARD_MODE, PHYSICS, PLAYER, SPRINT, STAMINA, STASH, SURFACES,
  type EnemyConfig, type EnemyType, type FishVariant, type FishVariantConfig, type SurfaceConfig,
} from '../config/gameplay';
import { NavGrid } from '../enemies/nav';
import type { LevelDef, Point } from '../levels/types';
import { createBody, Layer, PhysicsWorld, type Body, type ContactEvent, type StaticShape } from '../physics/world';
import { buildStatics } from './arena';
import { NORMALIZED_MODIFIERS, type GameplayModifiers } from './modifiers';

export interface SimInput {
  /** Desired direction; magnitude is clamped to 1 (joysticks may send less). */
  moveX: number;
  moveY: number;
  sprint: boolean;
}

export const NO_INPUT: SimInput = Object.freeze({ moveX: 0, moveY: 0, sprint: false });

export type SimStatus = 'playing' | 'won' | 'failed';

export type ImpactKind =
  | 'fishWall' | 'fishObstacle' | 'fishPenguin' | 'fishFish'
  | 'penguinWall' | 'penguinObstacle' | 'penguinEnemy'
  | 'enemyWall' | 'enemyObstacle' | 'enemyEnemy' | 'other';

export type SimEvent =
  | { type: 'fishScored'; fish: FishEntity; stashed: number; required: number }
  | { type: 'fishEaten'; fish: FishEntity; enemy: EnemyEntity }
  | { type: 'impact'; kind: ImpactKind; speed: number; x: number; y: number; nx: number; ny: number; fish?: FishEntity }
  | { type: 'sprintStart' }
  | { type: 'sprintEnd' }
  | { type: 'staminaLow' }
  | { type: 'staminaEmpty' }
  | { type: 'staminaRecovered' }
  | { type: 'enemyAlert'; enemy: EnemyEntity }
  | { type: 'enemyDash'; enemy: EnemyEntity }
  | { type: 'won'; timeMs: number }
  | { type: 'failed'; reason: 'fishEaten' };

export interface PlayerEntity {
  body: Body;
  stamina: number;
  maxStamina: number;
  sprinting: boolean;
  exhausted: boolean;
  regenTimer: number;
  lowWarned: boolean;
  /** Visual roll angle (rad). */
  roll: number;
  /** 0–1 squash impulse, decays in the renderer. */
  squash: number;
  /** Seconds of reduced control after a hard enemy bump. */
  stagger: number;
}

export type FishState = 'free' | 'stashed' | 'eaten';

export interface FishEntity {
  id: number;
  variant: FishVariant;
  cfg: FishVariantConfig;
  body: Body;
  state: FishState;
  spawn: Point;
  /** Seconds remaining of the squash/flop reaction. */
  react: number;
  reactKind: 'squash' | 'flop';
  /** Sim time when stashed/eaten (for animation). */
  changedAtMs: number;
}

export type EnemyState = 'waiting' | 'idle' | 'chasing' | 'munching';

export interface EnemyEntity {
  id: number;
  type: EnemyType;
  cfg: EnemyConfig;
  body: Body;
  spawn: Point;
  state: EnemyState;
  wait: number;
  munch: number;
  targetFish: number;
  retarget: number;
  dashTimer: number;
  /** Desired direction last step (renderer uses it for heading). */
  dirX: number;
  dirY: number;
  speedMul: number;
  accelMul: number;
}

export interface SimStats {
  wallBounces: number;
  fishStashed: number;
  fishEaten: number;
  distanceWaddled: number;
  sprintSeconds: number;
  sprintHits: number;
}

export interface SimOptions {
  modifiers?: GameplayModifiers;
  hard?: boolean;
}

interface FieldCache {
  grid: NavGrid;
  targetCell: number;
  field: Float32Array | null;
}

export class GameSim {
  readonly world = new PhysicsWorld();
  readonly statics: StaticShape[];
  readonly player: PlayerEntity;
  readonly fish: FishEntity[] = [];
  readonly enemies: EnemyEntity[] = [];
  readonly events: SimEvent[] = [];
  readonly stats: SimStats = { wallBounces: 0, fishStashed: 0, fishEaten: 0, distanceWaddled: 0, sprintSeconds: 0, sprintHits: 0 };
  readonly mods: GameplayModifiers;
  readonly hard: boolean;
  status: SimStatus = 'playing';
  /** Monotonic simulation time (ms) — advances only by fixed steps, so pauses never count. */
  timeMs = 0;
  steps = 0;
  stashedValue = 0;
  readonly required: number;
  private navGrids = new Map<number, NavGrid>();
  private fieldCaches = new Map<string, FieldCache>();
  private navBudget = 0;
  private readonly dt = PHYSICS.fixedStep;

  constructor(readonly level: LevelDef, opts: SimOptions = {}) {
    this.mods = opts.modifiers ?? NORMALIZED_MODIFIERS;
    this.hard = opts.hard ?? level.hard;
    this.required = level.fishRequired;
    this.statics = buildStatics(level);
    this.world.statics = this.statics;
    this.world.friction = FISH.friction;
    this.world.bounds = { minX: 0, minY: 0, maxX: level.arena.width, maxY: level.arena.height };
    this.world.pairRestitution = (a, b) => this.pairRestitution(a, b);

    const pb = createBody({
      x: level.player.x, y: level.player.y, r: PLAYER.radius, layer: Layer.Player, mask: Layer.All,
      invMass: 1 / PLAYER.mass, restitution: PLAYER.restitution, damping: 0, maxSpeed: 2000,
      angularDamping: 0, kick: PLAYER.fishKickBoost * this.mods.fishKick,
    });
    this.world.add(pb);
    const maxStamina = STAMINA.max * this.mods.maxStamina;
    this.player = {
      body: pb, stamina: maxStamina * clamp01(this.mods.startStamina), maxStamina, sprinting: false, exhausted: false,
      regenTimer: 0, lowWarned: false, roll: 0, squash: 0, stagger: 0,
    };

    level.fish.forEach((f, i) => {
      const cfg = FISH.variants[f.variant];
      const body = createBody({
        x: f.x, y: f.y, r: cfg.radius, layer: Layer.Fish, mask: Layer.Player | Layer.Fish,
        invMass: 1 / cfg.mass, restitution: FISH.wallRestitution, damping: FISH.linearDamping,
        maxSpeed: FISH.maxSpeed, angularDamping: FISH.angularDamping, kickable: true,
        angle: 0,
      });
      this.world.add(body);
      this.fish.push({ id: i, variant: f.variant, cfg, body, state: 'free', spawn: { x: f.x, y: f.y }, react: 0, reactKind: 'squash', changedAtMs: 0 });
    });

    const grace = this.hard ? HARD_MODE.spawnGrace : ENEMY_GLOBAL.spawnGrace;
    level.enemies.forEach((e, i) => {
      const cfg = ENEMIES[e.type];
      const body = createBody({
        x: e.x, y: e.y, r: cfg.radius, layer: Layer.Enemy, mask: Layer.Player | Layer.Enemy,
        invMass: 1 / cfg.mass, restitution: cfg.restitution, damping: cfg.damping, maxSpeed: cfg.maxSpeed * 2.2,
        angularDamping: 4,
      });
      this.world.add(body);
      const speedMul = this.hard ? HARD_MODE.enemySpeed : 1;
      const accelMul = this.hard ? HARD_MODE.enemyAccel : 1;
      this.enemies.push({
        id: i, type: e.type, cfg, body, spawn: { x: e.x, y: e.y }, state: 'waiting',
        wait: grace + e.delay + cfg.reactionDelay * (this.hard ? HARD_MODE.reactionDelay : 1),
        munch: 0, targetFish: -1, retarget: 0, dashTimer: cfg.dashInterval * 0.5, dirX: 0, dirY: 1,
        speedMul, accelMul,
      });
      if (!this.navGrids.has(cfg.radius)) {
        this.navGrids.set(cfg.radius, new NavGrid(level.arena.width, level.arena.height, ENEMY_GLOBAL.navCellSize, cfg.radius, this.statics));
      }
    });
  }

  // ------------------------------------------------------------------ queries

  get exposedFish(): FishEntity[] {
    return this.fish.filter((f) => f.state === 'free');
  }

  get remainingPotential(): number {
    let v = this.stashedValue;
    for (const f of this.fish) if (f.state === 'free') v += f.cfg.scoreValue;
    return v;
  }

  surfaceAt(x: number, y: number): SurfaceConfig {
    for (const s of this.level.surfaces) {
      const dx = (x - s.x) / s.rx, dy = (y - s.y) / s.ry;
      if (dx * dx + dy * dy <= 1) return SURFACES[s.type];
    }
    return SURFACES.normal;
  }

  /** Closest surface-to-surface distance from any active enemy to the player or an exposed fish. */
  dangerDistance(): number {
    let best = Infinity;
    const p = this.player.body;
    for (const e of this.enemies) {
      if (e.state === 'waiting' || e.state === 'munching') continue;
      const eb = e.body;
      const dp = Math.sqrt((eb.x - p.x) ** 2 + (eb.y - p.y) ** 2) - eb.r - p.r;
      if (dp < best) best = dp;
      for (const f of this.fish) {
        if (f.state !== 'free') continue;
        const df = Math.sqrt((eb.x - f.body.x) ** 2 + (eb.y - f.body.y) ** 2) - eb.r - f.body.r;
        if (df < best) best = df;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ stepping

  step(input: SimInput): void {
    this.events.length = 0;
    if (this.status !== 'playing') return;
    const dt = this.dt;
    this.steps++;
    this.timeMs = Math.round(this.steps * dt * 1000 * 1000) / 1000;
    this.navBudget = ENEMY_GLOBAL.maxNavRebuildsPerStep;

    this.updatePlayer(input, dt);
    this.updateEnemies(dt);
    for (const f of this.fish) {
      if (f.state !== 'free') continue;
      f.body.damping = FISH.linearDamping * this.surfaceAt(f.body.x, f.body.y).dampMul;
      if (f.react > 0) f.react = Math.max(0, f.react - dt);
    }

    const before = { x: this.player.body.x, y: this.player.body.y };
    this.world.step(dt);
    const p = this.player.body;
    const moved = Math.sqrt((p.x - before.x) ** 2 + (p.y - before.y) ** 2);
    this.stats.distanceWaddled += moved;
    this.player.roll += (p.x - before.x) * PLAYER.rollPerUnit + (p.y - before.y) * PLAYER.rollPerUnit * 0.35;

    this.processContacts(this.world.contacts);
    this.checkEating();
    this.checkScoring();
    this.checkEnd();
  }

  private updatePlayer(input: SimInput, dt: number): void {
    const pl = this.player;
    const b = pl.body;
    let mx = input.moveX, my = input.moveY;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) { mx /= mag; my /= mag; }
    const moving = mag > 0.08;

    // --- stamina & sprint
    const wantsSprint = input.sprint && moving;
    const wasSprinting = pl.sprinting;
    if (wantsSprint && !pl.exhausted && pl.stamina > 0) {
      pl.sprinting = true;
      pl.stamina -= STAMINA.drainPerSecond * this.mods.sprintDrain * dt;
      pl.regenTimer = STAMINA.regenDelay;
      this.stats.sprintSeconds += dt;
    } else {
      pl.sprinting = false;
      if (pl.regenTimer > 0) pl.regenTimer -= dt;
      else pl.stamina += STAMINA.regenPerSecond * this.mods.staminaRegen * dt;
    }
    if (pl.stamina <= 0) {
      pl.stamina = 0;
      if (!pl.exhausted) {
        pl.exhausted = true;
        pl.sprinting = false;
        this.events.push({ type: 'staminaEmpty' });
      }
    }
    if (pl.stamina > pl.maxStamina) pl.stamina = pl.maxStamina;
    if (pl.exhausted && pl.stamina >= pl.maxStamina * STAMINA.exhaustedRecoverFraction) {
      pl.exhausted = false;
      this.events.push({ type: 'staminaRecovered' });
    }
    const frac = pl.stamina / pl.maxStamina;
    if (frac <= STAMINA.lowFraction && !pl.lowWarned && pl.sprinting) {
      pl.lowWarned = true;
      this.events.push({ type: 'staminaLow' });
    } else if (frac > STAMINA.lowFraction + 0.1) {
      pl.lowWarned = false;
    }
    if (pl.sprinting && !wasSprinting) this.events.push({ type: 'sprintStart' });
    if (!pl.sprinting && wasSprinting) this.events.push({ type: 'sprintEnd' });

    // --- movement
    const surf = this.surfaceAt(b.x, b.y);
    const control = pl.stagger > 0 ? 0.45 : 1;
    if (pl.stagger > 0) pl.stagger = Math.max(0, pl.stagger - dt * this.mods.collisionRecovery);
    const speed = PLAYER.walkSpeed * this.mods.moveSpeed * surf.speedMul * (pl.sprinting ? SPRINT.multiplier : 1);
    if (moving) {
      const tx = mx * speed, ty = my * speed;
      let rate = PLAYER.accelRate * this.mods.accel * surf.accelMul * (pl.sprinting ? SPRINT.accelMultiplier : 1) * control;
      if (b.vx * mx + b.vy * my < 0) rate *= PLAYER.reverseBoost;
      const k = Math.min(1, rate * dt);
      b.vx += (tx - b.vx) * k;
      b.vy += (ty - b.vy) * k;
    } else {
      const k = Math.min(1, PLAYER.brakeRate * surf.accelMul * dt);
      b.vx -= b.vx * k;
      b.vy -= b.vy * k;
    }
    b.kick = PLAYER.fishKickBoost * this.mods.fishKick * (pl.sprinting ? SPRINT.kickMultiplier : 1);
  }

  private updateEnemies(dt: number): void {
    const active = this.status === 'playing';
    for (const e of this.enemies) {
      const b = e.body;
      const surf = this.surfaceAt(b.x, b.y);
      b.damping = e.cfg.damping * surf.dampMul;
      if (!active) continue;
      if (e.state === 'waiting') {
        e.wait -= dt;
        brake(b, 6, dt);
        if (e.wait <= 0) e.state = 'idle';
        continue;
      }
      if (e.state === 'munching') {
        e.munch -= dt;
        brake(b, 5, dt);
        if (e.munch <= 0) { e.state = 'idle'; e.retarget = 0; }
        continue;
      }
      e.retarget -= dt;
      let target = e.targetFish >= 0 ? this.fish[e.targetFish] : undefined;
      if (!target || target.state !== 'free' || e.retarget <= 0) {
        target = this.pickTarget(e);
        e.targetFish = target ? target.id : -1;
        e.retarget = e.cfg.retargetInterval * (this.hard ? HARD_MODE.retargetInterval : 1);
      }
      if (!target) {
        if (e.state === 'chasing') e.state = 'idle';
        brake(b, 2, dt);
        continue;
      }
      if (e.state === 'idle') {
        e.state = 'chasing';
        this.events.push({ type: 'enemyAlert', enemy: e });
      }
      const lead = e.cfg.leadTime;
      let ax = target.body.x + target.body.vx * lead;
      let ay = target.body.y + target.body.vy * lead;
      ax = Math.min(this.level.arena.width - 10, Math.max(10, ax));
      ay = Math.min(this.level.arena.height - 10, Math.max(10, ay));
      const dir = this.steer(e, ax, ay, target);
      if (!dir) { brake(b, 2, dt); continue; }
      e.dirX = dir.x;
      e.dirY = dir.y;
      const maxSpeed = e.cfg.maxSpeed * e.speedMul * surf.speedMul;
      const k = Math.min(1, e.cfg.accelRate * e.accelMul * surf.accelMul * dt);
      b.vx += (dir.x * maxSpeed - b.vx) * k;
      b.vy += (dir.y * maxSpeed - b.vy) * k;
      if (e.cfg.dashSpeed > 0) {
        e.dashTimer -= dt;
        if (e.dashTimer <= 0) {
          e.dashTimer = e.cfg.dashInterval;
          b.vx += dir.x * e.cfg.dashSpeed * e.speedMul;
          b.vy += dir.y * e.cfg.dashSpeed * e.speedMul;
          this.events.push({ type: 'enemyDash', enemy: e });
        }
      }
    }
  }

  private pickTarget(e: EnemyEntity): FishEntity | undefined {
    let best: FishEntity | undefined;
    let bestScore = Infinity;
    const b = e.body;
    for (const f of this.fish) {
      if (f.state !== 'free') continue;
      const dx = f.body.x - b.x, dy = f.body.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (e.state === 'idle' && d > e.cfg.detectionRadius) continue;
      let score = d;
      // Seals prefer fish roughly ahead of their slide (momentum hunters).
      if (e.type === 'seal') {
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (sp > 20 && d > 0) score -= ((dx * b.vx + dy * b.vy) / (d * sp)) * 120;
      }
      // Stick with the current target unless another is clearly closer (no dithering).
      if (f.id === e.targetFish) score -= 60;
      if (score < bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  private steer(e: EnemyEntity, ax: number, ay: number, target: FishEntity): { x: number; y: number } | null {
    const b = e.body;
    const grid = this.navGrids.get(e.cfg.radius);
    const dx = ax - b.x, dy = ay - b.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (!grid || grid.lineClear(b.x, b.y, ax, ay)) return { x: dx / d, y: dy / d };
    const key = `${e.cfg.radius}:${target.id}`;
    let cache = this.fieldCaches.get(key);
    const tc = grid.cellOf(target.body.x, target.body.y);
    if (!cache) {
      cache = { grid, targetCell: -1, field: null };
      this.fieldCaches.set(key, cache);
    }
    if ((cache.targetCell !== tc || !cache.field) && (this.navBudget > 0 || !cache.field)) {
      this.navBudget--;
      cache.field = grid.buildField(tc);
      cache.targetCell = tc;
    }
    return cache.field ? grid.descend(cache.field, b.x, b.y) ?? { x: dx / d, y: dy / d } : { x: dx / d, y: dy / d };
  }

  private pairRestitution(a: Body, b: Body): number {
    const la = a.layer, lb = b.layer;
    if ((la === Layer.Player && lb === Layer.Fish) || (la === Layer.Fish && lb === Layer.Player)) {
      return FISH.penguinRestitution / this.mods.fishControl;
    }
    if (la === Layer.Fish && lb === Layer.Fish) return FISH.fishRestitution;
    return Math.max(a.restitution, b.restitution);
  }

  private processContacts(contacts: ContactEvent[]): void {
    const pb = this.player.body;
    for (const c of contacts) {
      let kind: ImpactKind = 'other';
      let fish: FishEntity | undefined;
      const la = c.a.layer, lb = c.b?.layer ?? 0;
      if (c.b === null) {
        if (la === Layer.Fish) {
          kind = c.staticTag === 'wall' ? 'fishWall' : 'fishObstacle';
          fish = this.fishByBody(c.a);
          if (kind === 'fishWall') this.stats.wallBounces++;
        } else if (la === Layer.Player) kind = c.staticTag === 'wall' ? 'penguinWall' : 'penguinObstacle';
        else if (la === Layer.Enemy) kind = c.staticTag === 'wall' ? 'enemyWall' : 'enemyObstacle';
      } else {
        const set = la | lb;
        if (set === (Layer.Player | Layer.Fish)) {
          kind = 'fishPenguin';
          fish = this.fishByBody(la === Layer.Fish ? c.a : c.b);
          if (this.player.sprinting) this.stats.sprintHits++;
        } else if (set === Layer.Fish) {
          kind = 'fishFish';
          fish = this.fishByBody(c.a);
        } else if (set === (Layer.Player | Layer.Enemy)) {
          kind = 'penguinEnemy';
          if (c.speed > 160) this.player.stagger = 0.18;
        } else if (set === Layer.Enemy) kind = 'enemyEnemy';
      }
      if (fish && c.speed >= FISH.impactReactSpeed) {
        fish.react = 0.28;
        fish.reactKind = c.speed > FISH.impactReactSpeed * 1.9 ? 'flop' : 'squash';
      }
      if (c.a === pb || c.b === pb) this.player.squash = Math.min(1, Math.max(this.player.squash, c.speed / 600));
      this.events.push({ type: 'impact', kind, speed: c.speed, x: c.x, y: c.y, nx: c.nx, ny: c.ny, ...(fish ? { fish } : {}) });
    }
  }

  private fishByBody(b: Body): FishEntity | undefined {
    for (const f of this.fish) if (f.body === b) return f;
    return undefined;
  }

  private checkEating(): void {
    for (const e of this.enemies) {
      if (e.state !== 'chasing' && e.state !== 'idle') continue;
      const eb = e.body;
      for (const f of this.fish) {
        if (f.state !== 'free') continue;
        const reach = eb.r + f.body.r + e.cfg.eatReach;
        const dx = f.body.x - eb.x, dy = f.body.y - eb.y;
        if (dx * dx + dy * dy <= reach * reach) {
          f.state = 'eaten';
          f.changedAtMs = this.timeMs;
          f.body.enabled = false;
          this.world.remove(f.body);
          this.stats.fishEaten++;
          e.state = 'munching';
          e.munch = ENEMY_GLOBAL.munchTime;
          e.targetFish = -1;
          this.events.push({ type: 'fishEaten', fish: f, enemy: e });
          break;
        }
      }
    }
  }

  private checkScoring(): void {
    const st = this.level.stash;
    for (const f of this.fish) {
      if (f.state !== 'free') continue;
      const enter = STASH.radius - f.body.r * FISH.stashEnterFactor;
      const dx = f.body.x - st.x, dy = f.body.y - st.y;
      if (dx * dx + dy * dy <= enter * enter) {
        f.state = 'stashed';
        f.changedAtMs = this.timeMs;
        f.body.enabled = false;
        this.world.remove(f.body);
        this.stashedValue += f.cfg.scoreValue;
        this.stats.fishStashed++;
        this.events.push({ type: 'fishScored', fish: f, stashed: this.stashedValue, required: this.required });
      }
    }
  }

  private checkEnd(): void {
    if (this.stashedValue >= this.required) {
      this.status = 'won';
      this.events.push({ type: 'won', timeMs: this.timeMs });
    } else if (this.remainingPotential < this.required) {
      this.status = 'failed';
      this.events.push({ type: 'failed', reason: 'fishEaten' });
    }
  }

  /**
   * Continue after failure (ad or 800 Icicles): eaten fish return to their
   * spawn points, enemies return to their dens with a grace period, the
   * stopwatch keeps running from where it stopped.
   */
  applyContinue(): void {
    if (this.status !== 'failed') return;
    for (const f of this.fish) {
      if (f.state !== 'eaten') continue;
      f.state = 'free';
      f.body.x = f.body.px = f.spawn.x;
      f.body.y = f.body.py = f.spawn.y;
      f.body.vx = f.body.vy = 0;
      f.body.enabled = true;
      this.world.add(f.body);
    }
    for (const e of this.enemies) {
      e.body.x = e.body.px = e.spawn.x;
      e.body.y = e.body.py = e.spawn.y;
      e.body.vx = e.body.vy = 0;
      e.state = 'waiting';
      e.wait = ENEMY_GLOBAL.spawnGrace + 0.6;
      e.targetFish = -1;
    }
    this.status = 'playing';
  }
}

function brake(b: Body, rate: number, dt: number): void {
  const k = Math.min(1, rate * dt);
  b.vx -= b.vx * k;
  b.vy -= b.vy * k;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
