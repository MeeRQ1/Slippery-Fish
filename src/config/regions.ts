/**
 * The 16 Adventure regions (50 levels each = 800 levels).
 *
 * Decorations are NOT listed by hand here: the renderer selects them from the
 * asset manifest by THEME + FUNCTION (theme tag = region id; function = the
 * asset's category/collision role). This file only describes what is unique
 * to each region: floor, palette, weather, surfaces, layout language, music.
 */
import type { SurfaceType } from './gameplay';
import type { ObstacleRole } from './obstacles';

export type RegionId =
  | 'classic_winter' | 'snow_forest' | 'spring_thaw' | 'beach' | 'summer' | 'fall'
  | 'ice_cream' | 'frozen_lake' | 'aurora' | 'candy_snow' | 'blizzard' | 'glacier_caves'
  | 'arctic_night' | 'festival' | 'crystal_ice' | 'mastery';

export interface RegionPalette {
  /** Arena floor base colour (behind the texture). */
  floor: string;
  /** Floor texture tint alpha (0–1). */
  floorTextureAlpha: number;
  /** Area outside the arena. */
  outside: string;
  /** Snow-bank fill / shade / outline. */
  bank: string;
  bankShade: string;
  bankOutline: string;
  /** UI accent colour for this region's screens. */
  accent: string;
}

export interface RegionDef {
  id: RegionId;
  name: string;
  /** Short flavour line on the Adventure map. */
  tagline: string;
  /** Floor texture key from the Batch 7A/7C textures, or a procedural texture id. */
  floorTexture: string;
  /** Texture for the area outside the arena. */
  outsideTexture: string;
  palette: RegionPalette;
  /** Weather particles (snow/leaves/petals/none) and density 0–1. */
  weather: { kind: 'snow' | 'leaves' | 'petals' | 'sprinkles' | 'sparkles' | 'none'; density: number; wind: number };
  /** Night tint over the arena (0 = none). */
  nightTint: number;
  /** Optional surfaces the generator may place here. */
  surfaces: SurfaceType[];
  /** Obstacle roles this region's layout language favours (weights). */
  layout: Partial<Record<ObstacleRole, number>>;
  /** Preferred arena aspect range (width/height). */
  aspect: [number, number];
  /** Centralised audio manifest slot. */
  musicSlot: string;
}

export const REGIONS: RegionDef[] = [
  { id: 'classic_winter', name: 'Classic Winter', tagline: 'Where every penguin learns to waddle.',
    floorTexture: 'tex_snow', outsideTexture: 'tex_snow',
    palette: { floor: '#eef6fc', floorTextureAlpha: 0.55, outside: '#dceaf5', bank: '#ffffff', bankShade: '#cfe3f4', bankOutline: '#1f3a63', accent: '#4aa3df' },
    weather: { kind: 'snow', density: 0.35, wind: 0.2 }, nightTint: 0, surfaces: [],
    layout: { block: 3, pillar: 2, wall: 2, island: 1 }, aspect: [1.4, 1.75], musicSlot: 'region_classic_winter' },
  { id: 'snow_forest', name: 'Snow Forest', tagline: 'Pines, logs and very suspicious bushes.',
    floorTexture: 'tex_snow', outsideTexture: 'tex_snow',
    palette: { floor: '#e8f2f6', floorTextureAlpha: 0.6, outside: '#d3e6e8', bank: '#fbfdff', bankShade: '#c6dde3', bankOutline: '#1d3b45', accent: '#2f8f6a' },
    weather: { kind: 'snow', density: 0.45, wind: 0.15 }, nightTint: 0, surfaces: ['deepSnow'],
    layout: { pillar: 3, cluster: 2, block: 2, corner: 1 }, aspect: [1.3, 1.7], musicSlot: 'region_snow_forest' },
  { id: 'spring_thaw', name: 'Spring Thaw', tagline: 'The snow is melting. The fish are not.',
    floorTexture: 'tex_dirt_snow', outsideTexture: 'proc_meadow',
    palette: { floor: '#e9efe6', floorTextureAlpha: 0.22, outside: '#cfe2b8', bank: '#f7fbf4', bankShade: '#d3e2c8', bankOutline: '#3b4a2a', accent: '#7cbf4a' },
    weather: { kind: 'petals', density: 0.25, wind: 0.3 }, nightTint: 0, surfaces: ['deepSnow'],
    layout: { island: 3, block: 2, wedge: 1, corner: 1 }, aspect: [1.35, 1.8], musicSlot: 'region_spring_thaw' },
  { id: 'beach', name: 'Beach', tagline: 'Sandy snow, salty breeze, slippery fish.',
    floorTexture: 'tex_sand', outsideTexture: 'tex_water',
    palette: { floor: '#f6e7c4', floorTextureAlpha: 0.75, outside: '#3aa4e6', bank: '#fff7e6', bankShade: '#ecd7a8', bankOutline: '#6b4a1f', accent: '#f2a541' },
    weather: { kind: 'none', density: 0, wind: 0 }, nightTint: 0, surfaces: ['deepSnow'],
    layout: { cluster: 3, island: 2, wedge: 2, block: 1 }, aspect: [1.5, 1.9], musicSlot: 'region_beach' },
  { id: 'summer', name: 'Summer', tagline: 'Sunshine on the ice. Somehow.',
    floorTexture: 'proc_meadow', outsideTexture: 'proc_meadow',
    palette: { floor: '#e3f0d0', floorTextureAlpha: 0.5, outside: '#b9da8f', bank: '#fbfff5', bankShade: '#d6e8bf', bankOutline: '#36521f', accent: '#f6c945' },
    weather: { kind: 'none', density: 0, wind: 0 }, nightTint: 0, surfaces: ['polishedIce'],
    layout: { block: 2, wall: 2, wedge: 2, island: 1 }, aspect: [1.45, 1.85], musicSlot: 'region_summer' },
  { id: 'fall', name: 'Fall', tagline: 'Crunchy leaves, crunchier bank shots.',
    floorTexture: 'tex_dirt', outsideTexture: 'proc_fallgrass',
    palette: { floor: '#efe2cc', floorTextureAlpha: 0.2, outside: '#d7a86a', bank: '#fff8ee', bankShade: '#e8cfaa', bankOutline: '#5a3414', accent: '#e07a2d' },
    weather: { kind: 'leaves', density: 0.35, wind: 0.4 }, nightTint: 0, surfaces: ['deepSnow'],
    layout: { corner: 3, cluster: 2, wedge: 1, block: 1 }, aspect: [1.35, 1.75], musicSlot: 'region_fall' },
  { id: 'ice_cream', name: 'Ice Cream', tagline: 'Sticky syrup. Do not lick the floor.',
    floorTexture: 'proc_icecream', outsideTexture: 'proc_icecream',
    palette: { floor: '#fde9ef', floorTextureAlpha: 0.65, outside: '#f7c6d6', bank: '#fffaf2', bankShade: '#f4d9e2', bankOutline: '#6b2a44', accent: '#ef6f9c' },
    weather: { kind: 'sprinkles', density: 0.3, wind: 0.1 }, nightTint: 0, surfaces: ['syrup'],
    layout: { island: 3, pillar: 2, cross: 1, block: 1 }, aspect: [1.3, 1.7], musicSlot: 'region_ice_cream' },
  { id: 'frozen_lake', name: 'Frozen Lake', tagline: 'Polished ice. Long, long slides.',
    floorTexture: 'tex_ice', outsideTexture: 'tex_deep_water',
    palette: { floor: '#d8ecf9', floorTextureAlpha: 0.75, outside: '#2f78b8', bank: '#f6fbff', bankShade: '#bcd9ee', bankOutline: '#173a66', accent: '#3d8fd6' },
    weather: { kind: 'snow', density: 0.2, wind: 0.5 }, nightTint: 0, surfaces: ['polishedIce', 'crackedIce'],
    layout: { island: 2, wall: 2, pillar: 2, channel: 1 }, aspect: [1.5, 1.95], musicSlot: 'region_frozen_lake' },
  { id: 'aurora', name: 'Aurora', tagline: 'The sky dances. So should you.',
    floorTexture: 'tex_snow', outsideTexture: 'tex_snow',
    palette: { floor: '#cfdcf0', floorTextureAlpha: 0.5, outside: '#5b6f9c', bank: '#eef4ff', bankShade: '#a9bde0', bankOutline: '#141f44', accent: '#5fe3b4' },
    weather: { kind: 'sparkles', density: 0.3, wind: 0.1 }, nightTint: 0.28, surfaces: ['polishedIce'],
    layout: { pillar: 2, wedge: 2, island: 2, corner: 1 }, aspect: [1.4, 1.8], musicSlot: 'region_aurora' },
  { id: 'candy_snow', name: 'Candy Snow', tagline: 'Pink snow tastes exactly like regular snow.',
    floorTexture: 'tex_snow', outsideTexture: 'proc_candy',
    palette: { floor: '#fcebf3', floorTextureAlpha: 0.45, outside: '#f3c3dc', bank: '#fff6fb', bankShade: '#efcfe0', bankOutline: '#5c2050', accent: '#d65cb0' },
    weather: { kind: 'snow', density: 0.3, wind: 0.2 }, nightTint: 0, surfaces: ['syrup', 'polishedIce'],
    layout: { cross: 2, cluster: 2, island: 2, pillar: 1 }, aspect: [1.3, 1.75], musicSlot: 'region_candy_snow' },
  { id: 'blizzard', name: 'Blizzard', tagline: 'You can barely see. The wolves can.',
    floorTexture: 'tex_snow', outsideTexture: 'tex_snow',
    palette: { floor: '#e4edf3', floorTextureAlpha: 0.6, outside: '#c3d3df', bank: '#fbfdff', bankShade: '#c0d2e0', bankOutline: '#22364d', accent: '#8fb3d1' },
    weather: { kind: 'snow', density: 1.0, wind: 1.0 }, nightTint: 0.08, surfaces: ['deepSnow'],
    layout: { wall: 3, corner: 2, channel: 1, block: 1 }, aspect: [1.35, 1.8], musicSlot: 'region_blizzard' },
  { id: 'glacier_caves', name: 'Glacier Caves', tagline: 'Echoes, crystals, and tight squeezes.',
    floorTexture: 'tex_ice', outsideTexture: 'tex_stone',
    palette: { floor: '#c9e2f2', floorTextureAlpha: 0.55, outside: '#5c7186', bank: '#e9f4fb', bankShade: '#9fc0d6', bankOutline: '#0f2a40', accent: '#69c9f0' },
    weather: { kind: 'sparkles', density: 0.2, wind: 0 }, nightTint: 0.18, surfaces: ['crackedIce', 'polishedIce'],
    layout: { channel: 3, corner: 2, pillar: 2, arch: 1 }, aspect: [1.4, 1.9], musicSlot: 'region_glacier_caves' },
  { id: 'arctic_night', name: 'Arctic Night', tagline: 'Lantern light and glinting eyes.',
    floorTexture: 'tex_snow', outsideTexture: 'tex_snow',
    palette: { floor: '#c4cfe2', floorTextureAlpha: 0.5, outside: '#3f4d70', bank: '#e6edf9', bankShade: '#97a8c8', bankOutline: '#0d1430', accent: '#f6c945' },
    weather: { kind: 'snow', density: 0.4, wind: 0.2 }, nightTint: 0.35, surfaces: ['polishedIce', 'deepSnow'],
    layout: { block: 2, corner: 2, wedge: 2, arch: 1 }, aspect: [1.4, 1.85], musicSlot: 'region_arctic_night' },
  { id: 'festival', name: 'Festival', tagline: 'Bunting, music and a lot of fish.',
    floorTexture: 'tex_snow', outsideTexture: 'tex_snow',
    palette: { floor: '#f3f1ea', floorTextureAlpha: 0.45, outside: '#e2dccc', bank: '#ffffff', bankShade: '#e0d8c6', bankOutline: '#4a2c14', accent: '#e8504a' },
    weather: { kind: 'snow', density: 0.25, wind: 0.2 }, nightTint: 0, surfaces: ['polishedIce', 'syrup'],
    layout: { cross: 2, block: 2, wall: 1, cluster: 1, arch: 1 }, aspect: [1.45, 1.9], musicSlot: 'region_festival' },
  { id: 'crystal_ice', name: 'Crystal Ice', tagline: 'Everything sparkles. Everything bounces.',
    floorTexture: 'tex_ice', outsideTexture: 'tex_cracked_ice',
    palette: { floor: '#dff1fb', floorTextureAlpha: 0.7, outside: '#9ed0ef', bank: '#f5fcff', bankShade: '#b5dcf2', bankOutline: '#123a5e', accent: '#7fd4ff' },
    weather: { kind: 'sparkles', density: 0.45, wind: 0.1 }, nightTint: 0, surfaces: ['polishedIce', 'crackedIce'],
    layout: { pillar: 3, wedge: 2, cluster: 2, channel: 1 }, aspect: [1.4, 1.85], musicSlot: 'region_crystal_ice' },
  { id: 'mastery', name: 'Mastery Region', tagline: 'Everything you learned, all at once.',
    floorTexture: 'tex_ice', outsideTexture: 'tex_stone',
    palette: { floor: '#dde8f0', floorTextureAlpha: 0.6, outside: '#6d7f8f', bank: '#f7fafc', bankShade: '#b9c9d6', bankOutline: '#101f2e', accent: '#c9a2ff' },
    weather: { kind: 'snow', density: 0.35, wind: 0.6 }, nightTint: 0.1, surfaces: ['polishedIce', 'crackedIce', 'deepSnow'],
    layout: { channel: 2, corner: 2, wedge: 2, arch: 1, pillar: 1, wall: 1 }, aspect: [1.4, 1.95], musicSlot: 'region_mastery' },
];

export const REGION_BY_ID: Record<RegionId, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionDef>;

export const LEVELS_PER_REGION = 50;
export const ADVENTURE_LEVEL_COUNT = REGIONS.length * LEVELS_PER_REGION; // 800

export function regionForAdventureLevel(level: number): RegionDef {
  const idx = Math.min(REGIONS.length - 1, Math.max(0, Math.floor((level - 1) / LEVELS_PER_REGION)));
  return REGIONS[idx]!;
}
