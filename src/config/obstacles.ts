/**
 * Batch 4 — gameplay ice obstacles and their EXPLICIT collider shapes.
 *
 * Shapes are authored in the sprite's native pixel space, origin at the sprite
 * centre, and scaled together with the sprite. Colliders follow silhouettes
 * reasonably (the 3/4-view art is treated as a top-down footprint).
 *
 * Explicit behaviour notes (spec §78C):
 *  - Ice Ramp does NOT create jumping — it is a solid wedge for bank shots.
 *  - Ice Arch is NOT pass-through — legs + crown are solid; the opening is a
 *    pocket that fish can be banked into and out of.
 */

export type ColliderDef =
  | { type: 'rect'; cx: number; cy: number; w: number; h: number; radius?: number }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'poly'; points: Array<[number, number]>; radius?: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; segments?: number };

export type ObstacleRole =
  | 'block' | 'wall' | 'pillar' | 'island' | 'corner' | 'channel' | 'cluster' | 'wedge' | 'arch' | 'cross';

export interface ObstacleDef {
  id: string;
  /** Atlas frame from the Batch 4 manifest. */
  sprite: string;
  role: ObstacleRole;
  colliders: ColliderDef[];
  /** Allowed level-design scale range. */
  scaleRange: [number, number];
  /** May be mirrored horizontally. (Rotation is not used: the art has a fixed 3/4 view.) */
  canFlip: boolean;
}

const ellipse = (rx: number, ry: number, cx = 0, cy = 0): ColliderDef => ({ type: 'ellipse', cx, cy, rx, ry, segments: 14 });

export const OBSTACLES: Record<string, ObstacleDef> = {
  smallCube: { id: 'smallCube', sprite: 'ice_small_cube', role: 'block', canFlip: false, scaleRange: [0.7, 1.2],
    colliders: [{ type: 'rect', cx: 0, cy: 0, w: 80, h: 84, radius: 12 }] },
  mediumBlock: { id: 'mediumBlock', sprite: 'ice_medium_block', role: 'block', canFlip: false, scaleRange: [0.7, 1.2],
    colliders: [{ type: 'rect', cx: 0, cy: 0, w: 138, h: 90, radius: 12 }] },
  largeBlock: { id: 'largeBlock', sprite: 'ice_large_block', role: 'block', canFlip: false, scaleRange: [0.7, 1.15],
    colliders: [{ type: 'rect', cx: 0, cy: 0, w: 178, h: 124, radius: 14 }] },
  roundedGlacier: { id: 'roundedGlacier', sprite: 'ice_rounded_glacier', role: 'block', canFlip: true, scaleRange: [0.7, 1.15],
    colliders: [{ type: 'poly', radius: 8, points: [[-80, 58], [-72, 2], [-36, -48], [8, -60], [50, -40], [80, 8], [84, 58]] }] },
  thinVertical: { id: 'thinVertical', sprite: 'ice_thin_vertical', role: 'pillar', canFlip: false, scaleRange: [0.8, 1.4],
    colliders: [{ type: 'rect', cx: 0, cy: 0, w: 56, h: 126, radius: 12 }] },
  longHorizontal: { id: 'longHorizontal', sprite: 'ice_long_horizontal', role: 'wall', canFlip: false, scaleRange: [0.7, 1.35],
    colliders: [{ type: 'rect', cx: 0, cy: 0, w: 220, h: 78, radius: 12 }] },
  lShaped: { id: 'lShaped', sprite: 'ice_l_shaped', role: 'corner', canFlip: true, scaleRange: [0.75, 1.2],
    colliders: [
      { type: 'rect', cx: -41, cy: 0, w: 62, h: 150, radius: 10 },
      { type: 'rect', cx: 0, cy: 47, w: 144, h: 58, radius: 10 },
    ] },
  uShaped: { id: 'uShaped', sprite: 'ice_u_shaped', role: 'corner', canFlip: false, scaleRange: [0.75, 1.15],
    colliders: [
      { type: 'rect', cx: -76, cy: -4, w: 50, h: 116, radius: 10 },
      { type: 'rect', cx: 76, cy: -4, w: 50, h: 116, radius: 10 },
      { type: 'rect', cx: 0, cy: 32, w: 196, h: 56, radius: 10 },
    ] },
  pillar: { id: 'pillar', sprite: 'ice_pillar', role: 'pillar', canFlip: false, scaleRange: [0.7, 1.2],
    colliders: [{ type: 'rect', cx: 0, cy: 0, w: 82, h: 128, radius: 18 }] },
  crystal: { id: 'crystal', sprite: 'ice_crystal', role: 'pillar', canFlip: true, scaleRange: [0.7, 1.2],
    colliders: [{ type: 'poly', radius: 5, points: [[-50, 62], [-32, -6], [0, -64], [32, -6], [52, 62]] }] },
  crackedBlock: { id: 'crackedBlock', sprite: 'ice_cracked_block', role: 'block', canFlip: true, scaleRange: [0.7, 1.2],
    colliders: [{ type: 'rect', cx: 0, cy: 0, w: 130, h: 106, radius: 12 }] },
  snowCovered: { id: 'snowCovered', sprite: 'ice_snow_covered', role: 'block', canFlip: true, scaleRange: [0.7, 1.15],
    colliders: [{ type: 'rect', cx: 0, cy: 2, w: 142, h: 116, radius: 12 }] },
  smallIsland: { id: 'smallIsland', sprite: 'ice_small_island', role: 'island', canFlip: true, scaleRange: [0.75, 1.3],
    colliders: [ellipse(76, 44, 0, 4)] },
  largeIsland: { id: 'largeIsland', sprite: 'ice_large_island', role: 'island', canFlip: true, scaleRange: [0.7, 1.15],
    colliders: [ellipse(116, 62, 0, 2)] },
  narrowPassage: { id: 'narrowPassage', sprite: 'ice_narrow_passage', role: 'channel', canFlip: false, scaleRange: [1.05, 1.35],
    colliders: [
      { type: 'rect', cx: -57, cy: 0, w: 56, h: 132, radius: 12 },
      { type: 'rect', cx: 57, cy: 0, w: 56, h: 132, radius: 12 },
    ] },
  chokepoint: { id: 'chokepoint', sprite: 'ice_chokepoint_piece', role: 'wall', canFlip: false, scaleRange: [0.75, 1.25],
    colliders: [{ type: 'rect', cx: 0, cy: 0, w: 205, h: 82, radius: 12 }] },
  zigzag: { id: 'zigzag', sprite: 'ice_zigzag', role: 'corner', canFlip: true, scaleRange: [0.75, 1.2],
    colliders: [
      { type: 'rect', cx: -24, cy: -22, w: 66, h: 96, radius: 10 },
      { type: 'rect', cx: 18, cy: 34, w: 80, h: 68, radius: 10 },
    ] },
  chunkCluster: { id: 'chunkCluster', sprite: 'ice_chunk_cluster', role: 'cluster', canFlip: true, scaleRange: [0.8, 1.3],
    colliders: [
      { type: 'circle', cx: -38, cy: 20, r: 34 },
      { type: 'circle', cx: 12, cy: -34, r: 29 },
      { type: 'circle', cx: 44, cy: 30, r: 27 },
    ] },
  ramp: { id: 'ramp', sprite: 'ice_ramp', role: 'wedge', canFlip: true, scaleRange: [0.75, 1.2],
    colliders: [{ type: 'poly', radius: 6, points: [[-86, 48], [78, -48], [86, 48]] }] },
  triangle: { id: 'triangle', sprite: 'ice_triangle', role: 'wedge', canFlip: true, scaleRange: [0.75, 1.2],
    colliders: [{ type: 'poly', radius: 6, points: [[-72, 54], [48, -56], [72, 54]] }] },
  arch: { id: 'arch', sprite: 'ice_arch', role: 'arch', canFlip: false, scaleRange: [0.8, 1.2],
    colliders: [
      { type: 'rect', cx: -80, cy: 22, w: 48, h: 88, radius: 10 },
      { type: 'rect', cx: 80, cy: 22, w: 48, h: 88, radius: 10 },
      { type: 'rect', cx: 0, cy: -36, w: 206, h: 54, radius: 24 },
    ] },
  pad: { id: 'pad', sprite: 'ice_pad', role: 'island', canFlip: false, scaleRange: [0.7, 1.2],
    colliders: [ellipse(76, 54)] },
  cross: { id: 'cross', sprite: 'ice_cross', role: 'cross', canFlip: false, scaleRange: [0.7, 1.15],
    colliders: [
      { type: 'rect', cx: 0, cy: 2, w: 138, h: 50, radius: 10 },
      { type: 'rect', cx: 0, cy: 0, w: 50, h: 140, radius: 10 },
    ] },
  hex: { id: 'hex', sprite: 'ice_hex', role: 'pillar', canFlip: false, scaleRange: [0.7, 1.2],
    colliders: [{ type: 'poly', radius: 6, points: [[-60, 0], [-30, -54], [30, -54], [60, 0], [30, 54], [-30, 54]] }] },
  boulder: { id: 'boulder', sprite: 'ice_boulder', role: 'cluster', canFlip: true, scaleRange: [0.7, 1.15],
    colliders: [
      { type: 'circle', cx: -26, cy: 4, r: 58 },
      { type: 'circle', cx: 52, cy: 26, r: 36 },
    ] },
  spikeCluster: { id: 'spikeCluster', sprite: 'ice_spike_cluster', role: 'pillar', canFlip: true, scaleRange: [0.7, 1.15],
    colliders: [{ type: 'poly', radius: 4, points: [[-74, 66], [-56, 4], [-10, -70], [30, -20], [70, 4], [76, 66]] }] },
  jaggedWall: { id: 'jaggedWall', sprite: 'ice_jagged_wall', role: 'wall', canFlip: false, scaleRange: [0.7, 1.3],
    colliders: [{ type: 'rect', cx: 0, cy: 2, w: 218, h: 84, radius: 14 }] },
  snowCorner: { id: 'snowCorner', sprite: 'ice_snow_corner', role: 'corner', canFlip: true, scaleRange: [0.75, 1.2],
    colliders: [
      { type: 'rect', cx: -52, cy: 0, w: 60, h: 126, radius: 10 },
      { type: 'rect', cx: 8, cy: 34, w: 150, h: 60, radius: 10 },
    ] },
};

export type ObstacleId = keyof typeof OBSTACLES;
export const OBSTACLE_IDS = Object.keys(OBSTACLES) as ObstacleId[];
