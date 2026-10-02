/**
 * Asset catalog built from the generated runtime manifest
 * (content/manifests/assets.runtime.json, produced by scripts/extract_assets.py).
 *
 * Provides frame metadata, atlas page URLs (respecting the Vite base path) and
 * THEME + FUNCTION selection for decorations — never a random global pool.
 */
import runtime from '../../content/manifests/assets.runtime.json';
import type { RegionId } from '../config/regions';

export type AssetCategory =
  | 'GameplayFish' | 'GameplayCharacter' | 'GameplayEnemy' | 'GameplayObstacle' | 'GameplayStash'
  | 'FishEffect' | 'Floor' | 'Boundary' | 'BackgroundDecoration' | 'ForegroundDecoration'
  | 'Building' | 'TownProp' | 'FishingProp' | 'UIOnly' | 'MainMenuOnly' | 'CurrencyIcon';

export type CollisionRole = 'gameplay-collider' | 'limited-collider' | 'visual' | 'background' | 'foreground-frame' | 'ui';

export interface FrameMeta {
  id: string;
  /** Atlas page key, or `file:<path>` for standalone images. */
  page: string;
  x: number;
  y: number;
  w: number;
  h: number;
  category: AssetCategory;
  collision: CollisionRole;
  role: string;
  themes: string[];
}

interface RuntimeManifest {
  pages: Record<string, { group: string; image: string; json: string; size: [number, number] }>;
  frames: Record<string, [string, number, number, number, number, string, string, string, string[]]>;
}

const manifest = runtime as unknown as RuntimeManifest;

export const BASE = import.meta.env.BASE_URL;
export const assetUrl = (path: string): string => `${BASE}${path}`;

const frameCache = new Map<string, FrameMeta>();

export function frame(id: string): FrameMeta {
  let f = frameCache.get(id);
  if (f) return f;
  const r = manifest.frames[id];
  if (!r) throw new Error(`[assets] unknown frame "${id}"`);
  f = { id, page: r[0], x: r[1], y: r[2], w: r[3], h: r[4], category: r[5] as AssetCategory, collision: r[6] as CollisionRole, role: r[7], themes: r[8] };
  frameCache.set(id, f);
  return f;
}

export function hasFrame(id: string): boolean {
  return id in manifest.frames;
}

export function allFrames(): FrameMeta[] {
  return Object.keys(manifest.frames).map(frame);
}

export interface AtlasPage {
  key: string;
  group: string;
  image: string;
  json: string;
  size: [number, number];
}

export function atlasPages(groups?: string[]): AtlasPage[] {
  return Object.entries(manifest.pages)
    .filter(([, p]) => !groups || groups.includes(p.group))
    .map(([key, p]) => ({ key, group: p.group, image: assetUrl(p.image), json: assetUrl(p.json), size: p.size }));
}

export function pageOf(id: string): AtlasPage | null {
  const f = frame(id);
  if (f.page.startsWith('file:')) return null;
  const p = manifest.pages[f.page];
  return p ? { key: f.page, group: p.group, image: assetUrl(p.image), json: assetUrl(p.json), size: p.size } : null;
}

/** Phaser texture key + frame name for a manifest id. */
export function textureRef(id: string): { key: string; frame?: string } {
  const f = frame(id);
  if (f.page.startsWith('file:')) return { key: id };
  return { key: f.page, frame: id };
}

/** Standalone image assets (floor textures, mountain band). */
export function standaloneImages(): Array<{ id: string; url: string }> {
  return Object.entries(manifest.frames)
    .filter(([, r]) => r[0].startsWith('file:'))
    .map(([id, r]) => ({ id, url: assetUrl(r[0].slice(5)) }));
}

/** Atlas groups needed by a region's decorations. */
export function groupsForRegion(region: RegionId): string[] {
  const set = new Set<string>();
  for (const f of decorPool(region, 'outside').concat(decorPool(region, 'floorDecal'), decorPool(region, 'insideSmall'))) {
    const p = pageOf(f.id);
    if (p) set.add(p.group);
  }
  return [...set];
}

export type DecorFunction = 'outside' | 'floorDecal' | 'insideSmall';

const TOWN_CATEGORIES: AssetCategory[] = ['Building', 'TownProp'];

/**
 * THEME + FUNCTION decoration selection (spec §78O).
 *  - outside: scenery beyond the snow banks (no collider). Town structures
 *    only appear in the Festival region.
 *  - floorDecal: flat Floor decals inside the arena (no collider).
 *  - insideSmall: tiny visual-only details hugging the banks (no collider).
 */
export function decorPool(region: RegionId, fn: DecorFunction): FrameMeta[] {
  return allFrames().filter((f) => {
    if (!f.themes.includes(region)) return false;
    switch (fn) {
      case 'outside':
        if (f.role !== 'decoration' || (f.collision !== 'background' && f.collision !== 'visual')) return false;
        if (TOWN_CATEGORIES.includes(f.category) && region !== 'festival') return false;
        if (f.category === 'FishingProp' && region !== 'beach' && region !== 'frozen_lake') return false;
        return f.category !== 'Floor';
      case 'floorDecal':
        return f.category === 'Floor' && f.collision === 'visual';
      case 'insideSmall':
        return f.collision === 'visual' && f.role === 'decoration' && f.category !== 'Floor' && f.w <= 150 && f.h <= 110;
    }
    return false;
  });
}
