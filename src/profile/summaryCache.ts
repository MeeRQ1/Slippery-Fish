/**
 * Cached profile summary for the startup loading card.
 *
 * A tiny, versioned, DISPLAY-ONLY snapshot (name, icon, character, Adventure
 * position, equipped title) kept in localStorage so the loading screen can
 * greet the player before the IndexedDB save, Phaser or any atlas is loaded.
 * It is never read back as authority for rewards, ownership, payments or
 * Ranked: the real save replaces it as soon as it loads (index.html renders
 * it, `reconcileLoadingCard` overwrites it from the real save).
 *
 * The inline loader in index.html parses this same shape — keep them in sync
 * and bump SUMMARY_VERSION when the shape changes (old versions are ignored).
 */
import { REGIONS, regionForAdventureLevel } from '../config/regions';
import { equippedTitleName } from '../progression/titles';
import { DEFAULT_USERNAME, type SaveData } from '../save/schema';
import { PROFILE_ICONS } from './icons';
import { WADDLE_BY_ID } from './waddles';

export const SUMMARY_KEY = 'slipperyfish.profileSummary';
export const SUMMARY_VERSION = 1;

export interface ProfileSummary {
  v: number;
  name: string;
  /** Profile icon background colours (the loader draws a light badge from them). */
  iconBg: [string, string];
  iconName: string;
  waddle: string;
  waddleName: string;
  /** Next Adventure level to play and how many are cleared. */
  level: number;
  cleared: number;
  region: string;
  regionIndex: number;
  title: string | null;
  updatedAt: number;
}

export function buildSummary(s: Readonly<SaveData>): ProfileSummary {
  const icon = PROFILE_ICONS.find((i) => i.id === s.profile.iconId) ?? PROFILE_ICONS[0]!;
  const level = Math.min(800, s.adventure.highestUnlocked);
  const region = regionForAdventureLevel(level);
  return {
    v: SUMMARY_VERSION,
    name: s.profile.username,
    iconBg: icon.bg,
    iconName: icon.name,
    waddle: s.waddles.selected,
    waddleName: WADDLE_BY_ID[s.waddles.selected]?.name ?? 'Classic',
    level,
    cleared: Object.keys(s.adventure.stars).length,
    region: region.name,
    regionIndex: REGIONS.indexOf(region),
    title: equippedTitleName(s),
    updatedAt: Date.now(),
  };
}

let last = '';

/** Writes the summary when the displayed fields changed. Storage failures are ignored (display cache only). */
export function writeSummary(s: Readonly<SaveData>): void {
  // A brand-new (or just-erased) profile keeps the guest card: nothing personal to cache.
  if (s.profile.username === DEFAULT_USERNAME && Object.keys(s.adventure.stars).length === 0 && !s.titles.equipped) {
    clearSummary();
    return;
  }
  const sum = buildSummary(s);
  const key = JSON.stringify({ ...sum, updatedAt: 0 });
  if (key === last) return;
  last = key;
  try {
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(sum));
  } catch {
    /* private mode / quota: the loader falls back to the guest card */
  }
}

export function clearSummary(): void {
  last = '';
  try {
    localStorage.removeItem(SUMMARY_KEY);
  } catch {
    /* ignore */
  }
}
