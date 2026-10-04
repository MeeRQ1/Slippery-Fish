import type { EnemyType, FishVariant, SurfaceType } from '../config/gameplay';
import type { ObstacleId } from '../config/obstacles';
import type { RegionId } from '../config/regions';
import type { GoalLayout } from '../gameplay/goal';
import type { LevelModifierId } from '../gameplay/levelModifiers';

export type ArenaShape = 'rect' | 'cove' | 'bay' | 'lroom' | 'hourglass' | 'island' | 'twinRooms';

export type GameMode = 'adventure' | 'daily' | 'infinite' | 'ranked' | 'practice';

export interface Point {
  x: number;
  y: number;
}

export interface FishSpawn extends Point {
  variant: FishVariant;
}

export interface EnemySpawn extends Point {
  type: EnemyType;
  /** Extra seconds before this enemy activates (staggered pressure). */
  delay: number;
}

export interface ObstaclePlacement extends Point {
  type: ObstacleId;
  scale: number;
  flip: boolean;
}

/** Convex polygon in world space used to carve non-rectangular arenas. */
export interface WallBlock {
  points: Array<[number, number]>;
}

export interface SurfacePatch extends Point {
  type: SurfaceType;
  /** Ellipse radii (u). */
  rx: number;
  ry: number;
}

export interface TutorialInfo {
  /** Short hint shown at level start. */
  hint: string;
  /** Show the Batch 3 stash arrow guidance. */
  showStashArrow: boolean;
  /** Quest/tutorial step this level teaches. */
  teaches: 'movement' | 'sprint' | 'stamina' | 'dribbling' | 'scoring' | 'enemies' | 'stars' | 'bank';
}

export interface LevelDef {
  /** Stable record key, e.g. "adv-127", "daily-2026-10-02-07", "inf-FR0ST8K2M". */
  id: string;
  mode: GameMode;
  /** 1-based level number within the mode. */
  index: number;
  /** Full generation seed string (includes versions). */
  seed: string;
  /** Player-facing seed code (Infinite / Ranked). */
  seedCode?: string;
  contentVersion: number;
  generatorVersion: number;
  region: RegionId;
  /** Arena bounds, carved interior walls (collision == visuals) and the shape template used. */
  arena: { width: number; height: number; walls: WallBlock[]; shape?: ArenaShape };
  player: Point;
  /** Centre of the goal courtyard (scoring interior) in front of the igloo. */
  stash: Point;
  /** Fence layout around the goal (see src/gameplay/goal.ts). */
  goal: GoalLayout;
  fish: FishSpawn[];
  fishRequired: number;
  enemies: EnemySpawn[];
  obstacles: ObstaclePlacement[];
  surfaces: SurfacePatch[];
  /** Level modifiers (rule twists) baked into this level's definition. Empty for Ranked/Practice. */
  modifiers: LevelModifierId[];
  /** Level-specific multiplier on enemy speed (difficulty knob; Hard Mode stacks on top). */
  enemySpeed: number;
  /** Estimated expert completion time (s) used for Excellence Stars. */
  parSeconds: number;
  /** Abstract difficulty score (0 = first tutorial). */
  difficulty: number;
  hard: boolean;
  tutorial?: TutorialInfo;
}
