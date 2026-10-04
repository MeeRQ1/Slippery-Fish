/**
 * Slippery Fish — gameplay tuning.
 *
 * UNITS
 *  - Distance: world units ("u"). At camera zoom 1, 1u = 1 CSS pixel.
 *    A standard penguin is 48u wide; a standard arena is ~1200×760u.
 *  - Time: seconds. Speeds: u/s. Rates ("...Rate", "...Damping"): 1/s.
 *  - Damping is exponential-ish: each second velocity is multiplied by
 *    roughly e^(-damping). 1.0 ≈ loses 63% of speed per second.
 *
 * Every value here is safe to tweak without touching gameplay code. Ranges in
 * comments are the "feels right" band found during tuning; values outside
 * them still work but change the character of the game.
 */

export const PHYSICS = {
  /** Fixed simulation step (s). 60 Hz; rendering interpolates between steps. */
  fixedStep: 1 / 60,
  /** Sub-steps per fixed step. 4 → 240 Hz collision checks (anti-tunneling). [3–8] */
  substeps: 4,
  /** Bounded catch-up: max fixed steps per rendered frame before dropping backlog. */
  maxStepsPerFrame: 5,
  /** Contact solver passes per sub-step. [1–4] */
  solverIterations: 2,
  /** Fraction of penetration corrected per pass. [0.5–1] */
  positionCorrection: 0.85,
  /** Penetration allowed before correction (u). Avoids jitter. */
  slop: 0.2,
  /** Normal approach speed (u/s) below which a contact is "resting" (no bounce, no SFX). */
  restingSpeed: 18,
} as const;

export const PLAYER = {
  /** Collision radius (u). Sprite is scaled to match. */
  radius: 24,
  mass: 1.0,
  /** Top walking speed (u/s). [240–340] */
  walkSpeed: 290,
  /** How quickly velocity reaches the input target while a direction is held (1/s). [10–24] */
  accelRate: 17,
  /** Extra responsiveness when the input points against current motion (×accelRate). [1–2.5] */
  reverseBoost: 1.7,
  /** Velocity decay when no input is held (1/s). Penguins slide a little. [5–14] */
  brakeRate: 8.5,
  /** Bounciness against walls/obstacles. [0–0.6] */
  restitution: 0.32,
  /** Extra kick given to fish: fraction of the penguin's approach speed added to the fish. [0.1–0.6] */
  fishKickBoost: 0.34,
  /** Visual roll: radians of spin per unit travelled horizontally. */
  rollPerUnit: 1 / 30,
  /** Squash amount on hard impacts (0–1). */
  impactSquash: 0.22,
} as const;

export const SPRINT = {
  /** Speed multiplier while sprint is held (and stamina allows). [1.35–1.9] */
  multiplier: 1.62,
  /** Extra multiplier on the fish kick while sprinting — rewards sprint hits. [1–1.6] */
  kickMultiplier: 1.3,
  /** Accel responsiveness multiplier while sprinting. */
  accelMultiplier: 1.15,
} as const;

export const STAMINA = {
  /** Maximum stamina (abstract points). */
  max: 100,
  /** Drain while sprinting (points/s). 100/32 ≈ 3.1 s of continuous sprint. [20–45] */
  drainPerSecond: 32,
  /** Regeneration when not sprinting (points/s). [12–40] */
  regenPerSecond: 24,
  /** Delay after sprint ends before regeneration starts (s). [0–1.2] */
  regenDelay: 0.55,
  /** After hitting zero, sprint is locked until stamina refills to this fraction. Prevents flicker. */
  exhaustedRecoverFraction: 0.3,
  /** At or below this fraction the meter shows the LOW state. */
  lowFraction: 0.3,
} as const;

export type FishVariant = 'standard' | 'small' | 'medium' | 'large' | 'rare';

export interface FishVariantConfig {
  radius: number;
  mass: number;
  sprite: string;
  /** Sprite width as a multiple of collider diameter (fish are drawn longer than their collider). */
  spriteLengthFactor: number;
  /** Rare fish count as this many stashed fish. */
  scoreValue: number;
}

export const FISH = {
  variants: {
    standard: { radius: 15, mass: 0.34, sprite: 'fish_standard', spriteLengthFactor: 1.95, scoreValue: 1 },
    small: { radius: 12, mass: 0.24, sprite: 'fish_small', spriteLengthFactor: 1.95, scoreValue: 1 },
    medium: { radius: 17, mass: 0.42, sprite: 'fish_medium', spriteLengthFactor: 1.95, scoreValue: 1 },
    large: { radius: 21, mass: 0.62, sprite: 'fish_large', spriteLengthFactor: 1.95, scoreValue: 1 },
    rare: { radius: 15, mass: 0.3, sprite: 'fish_rare', spriteLengthFactor: 1.95, scoreValue: 1 },
  } satisfies Record<FishVariant, FishVariantConfig>,
  /** Momentum loss on ordinary ice (1/s). Lower = longer slides. [0.6–1.6] */
  linearDamping: 1.0,
  /** Visual spin decay (1/s). */
  angularDamping: 2.6,
  /** Bounce off snow banks. [0.5–0.9] */
  wallRestitution: 0.74,
  /** Bounce off Batch 4 ice obstacles (slightly livelier: ice is hard). */
  obstacleRestitution: 0.78,
  /** Bounce off the penguin. */
  penguinRestitution: 0.55,
  /** Fish vs fish. */
  fishRestitution: 0.82,
  /** Hard velocity cap (u/s); also part of anti-tunneling. [700–1100] */
  maxSpeed: 940,
  /** Speed lines/streak only above this speed (u/s). */
  speedLinesThreshold: 560,
  /** Impact speed that triggers squash + flop reaction (u/s). */
  impactReactSpeed: 240,
  /** Tangential friction coefficient (gives spin on glancing hits). */
  friction: 0.16,
} as const;

/**
 * The goal: a snowy courtyard in front of the chicks' igloo (src/gameplay/goal.ts).
 *
 * Geometry (world units): a ring of 24 wall segments of radius `wallRadius`
 * surrounds a circular scoring interior of radius `interiorRadius`. The igloo
 * always closes the back (north) arc; per-level fences close more segments;
 * the remaining gaps are the openings. A fish scores only when at least
 * `scoreFraction` of its collider disk lies inside the interior disk, having
 * entered through an opening.
 */
export const GOAL = {
  /** Scoring interior radius (u). */
  interiorRadius: 64,
  /** Centre-line radius of the fence / igloo wall ring (u). */
  wallRadius: 84,
  /** Fence collider thickness (u) — a capsule along each fenced segment. */
  wallThickness: 14,
  /** Minimum contained-area fraction of the fish's collider disk. Configurable; default 0.70. */
  scoreFraction: 0.7,
  /** Every opening spans at least this many ring segments (≈88u clear — fits the largest fish and the penguin). */
  minOpeningSegments: 5,
  /** Ring segments [first, last] closed by the igloo (segment i spans direction i → i+1; 18 = north). */
  iglooSegments: [14, 21] as const,
  /** Igloo body collider (relative to goal centre): rounded rectangle. */
  iglooBody: { cx: 0, cy: -118, w: 172, h: 92, radius: 30 },
  /** Igloo art: base line offset and display width (u). */
  iglooBaseY: -70,
  iglooWidth: 178,
  /** Enemies are blocked from the whole courtyard by an enemy-only disk this much larger than the ring. */
  enemyBlockExtra: 4,
} as const;

export type EnemyType = 'polarBear' | 'arcticWolf' | 'seal';

export interface EnemyConfig {
  radius: number;
  mass: number;
  /** Top chase speed (u/s). */
  maxSpeed: number;
  /** Responsiveness toward desired velocity (1/s). Low = slidey. */
  accelRate: number;
  /** Passive momentum decay (1/s). */
  damping: number;
  restitution: number;
  /** Distance at which an idle enemy notices exposed fish (u). */
  detectionRadius: number;
  /** Seconds between target re-evaluations ("reaction"). */
  retargetInterval: number;
  /** Seconds of hesitation after spawning/being reset. */
  reactionDelay: number;
  /** Seconds of target-motion prediction (wolves lead their prey). */
  leadTime: number;
  /** Seal-style dashes: impulse speed added every `dashInterval` s (0 = none). */
  dashSpeed: number;
  dashInterval: number;
  /** Extra margin added to radii when testing "contact with exposed fish". */
  eatReach: number;
  sprite: string;
  /** Sprite drawn this many times the collider diameter (art has paws/tails). */
  spriteScaleFactor: number;
}

export const ENEMIES: Record<EnemyType, EnemyConfig> = {
  polarBear: {
    radius: 34, mass: 5.0, maxSpeed: 128, accelRate: 3.2, damping: 1.2, restitution: 0.12,
    detectionRadius: 2000, retargetInterval: 1.0, reactionDelay: 0.45, leadTime: 0.0,
    dashSpeed: 0, dashInterval: 0, eatReach: 2,
    sprite: 'enemy_polar_bear', spriteScaleFactor: 1.32,
  },
  arcticWolf: {
    radius: 25, mass: 1.25, maxSpeed: 206, accelRate: 8.5, damping: 1.6, restitution: 0.25,
    detectionRadius: 640, retargetInterval: 0.35, reactionDelay: 0.15, leadTime: 0.4,
    dashSpeed: 0, dashInterval: 0, eatReach: 2,
    sprite: 'enemy_arctic_wolf', spriteScaleFactor: 1.6,
  },
  seal: {
    radius: 28, mass: 1.8, maxSpeed: 300, accelRate: 1.9, damping: 0.42, restitution: 0.35,
    detectionRadius: 760, retargetInterval: 0.6, reactionDelay: 0.3, leadTime: 0.15,
    dashSpeed: 230, dashInterval: 1.7, eatReach: 2,
    sprite: 'enemy_seal', spriteScaleFactor: 1.45,
  },
};

export const ENEMY_GLOBAL = {
  /** Seconds after level start before any enemy moves (lets players read the arena). */
  spawnGrace: 1.4,
  /** Navigation grid cell size (u). Smaller = more precise, more CPU. */
  navCellSize: 20,
  /** Max flow-field rebuilds per fixed step across all enemies (bounded cost). */
  maxNavRebuildsPerStep: 2,
  /** After a fish is eaten, the eater pauses to munch (s). */
  munchTime: 0.8,
} as const;

export const HARD_MODE = {
  enemySpeed: 1.18,
  enemyAccel: 1.2,
  reactionDelay: 0.65,
  retargetInterval: 0.75,
  spawnGrace: 0.6,
  extraEnemyChance: 0.35,
  /** Reward multiplier for Icicles in Hard Mode. */
  rewardMultiplier: 1.5,
} as const;

export const WARNING = {
  /** Enemy within this distance of the player or an exposed fish starts the vignette (u). */
  farDistance: 340,
  /** At or inside this distance the warning is "immediate" (u, measured surface to surface). */
  nearDistance: 70,
  /** Pulse frequency at far / near (Hz). */
  pulseHzFar: 1.1,
  pulseHzNear: 3.2,
  /** Opacity at far / near before the user's accessibility intensity multiplier. */
  opacityFar: 0.16,
  opacityNear: 0.78,
  /** Fade speed of the vignette (1/s). */
  fadeRate: 6,
} as const;

export const CAMERA = {
  /** Screen-space margin around the arena when fitting (CSS px). */
  margin: 28,
  /** Top HUD reserve (CSS px) so the arena is not hidden under the HUD. */
  hudReserveTop: 64,
  /** Minimum CSS px per world unit; below this the camera follows the player instead of fitting. */
  minCssPxPerUnit: 0.5,
  followRate: 6,
  /** Impact shake strength (fraction of viewport) — scaled by the Screen Shake setting. */
  impactShake: 0.0035,
} as const;

export type SurfaceType = 'normal' | 'polishedIce' | 'deepSnow' | 'crackedIce' | 'syrup';

export interface SurfaceConfig {
  /** Multiplies player/enemy acceleration. */
  accelMul: number;
  /** Multiplies damping for fish, player braking and enemies. */
  dampMul: number;
  /** Multiplies top speed for characters. */
  speedMul: number;
}

export const SURFACES: Record<SurfaceType, SurfaceConfig> = {
  normal: { accelMul: 1, dampMul: 1, speedMul: 1 },
  polishedIce: { accelMul: 0.42, dampMul: 0.35, speedMul: 1.08 },
  deepSnow: { accelMul: 0.85, dampMul: 2.3, speedMul: 0.74 },
  crackedIce: { accelMul: 0.8, dampMul: 0.7, speedMul: 1.0 },
  syrup: { accelMul: 0.7, dampMul: 3.4, speedMul: 0.6 },
};

/** Excellence-star par times are multiples of the level's estimated "pro" time. */
export const STARS = {
  /** time ≤ par*mult earns that many stars. 1 star = any completion. */
  thresholds: [
    { stars: 5, mult: 1.0 },
    { stars: 4, mult: 1.3 },
    { stars: 3, mult: 1.7 },
    { stars: 2, mult: 2.4 },
  ],
  /** Each fish lost to enemies removes this many stars (min 1). */
  starsLostPerEatenFish: 1,
} as const;
