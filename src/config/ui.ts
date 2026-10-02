/**
 * UI motion + feedback tuning. Times in ms, scales are multipliers.
 */
import type { SfxId } from './audio';

export const TRANSITIONS = {
  screenOutMs: 200,
  screenInMs: 320,
  staggerMs: 45,
  curtainInMs: 280,
  curtainOutMs: 380,
  signDimMs: 220,
  signCloseMs: 260,
  /** Delay between press and navigation so the rebound is visible. */
  activateDelayMs: 110,
  /** Ignore repeated activation of the same button within this window. */
  repeatGuardMs: 350,
} as const;

/** How an object button reacts. Each main-menu object has its own personality. */
export interface ButtonPersonality {
  hoverScale: number;
  /** Degrees of tilt on hover (sign randomised). */
  hoverTilt: number;
  /** Lift on hover (px, negative = up). */
  hoverLift: number;
  press: 'squash' | 'crumple' | 'spin' | 'flutter' | 'shake' | 'hop' | 'wobble' | 'snap' | 'punch';
  sound: SfxId;
  spring: 'snappy' | 'bouncy' | 'wobbly' | 'wood' | 'ice' | 'metal' | 'paper';
}

const base: ButtonPersonality = { hoverScale: 1.08, hoverTilt: 2, hoverLift: -3, press: 'squash', sound: 'click', spring: 'bouncy' };

export const BUTTON_PERSONALITIES: Record<string, ButtonPersonality> = {
  default: base,
  adventure: { ...base, hoverScale: 1.09, hoverTilt: -2, press: 'squash', sound: 'clickSoft', spring: 'paper' },
  daily: { ...base, hoverScale: 1.1, hoverTilt: 3, press: 'wobble', sound: 'click', spring: 'wobbly' },
  infinite: { ...base, hoverScale: 1.08, hoverTilt: 0, press: 'snap', sound: 'clickSoft', spring: 'ice' },
  ranked: { ...base, hoverScale: 1.1, hoverTilt: -1, press: 'punch', sound: 'ranked', spring: 'snappy' },
  waddle: { ...base, hoverScale: 1.09, hoverTilt: 4, press: 'wobble', sound: 'click', spring: 'wobbly' },
  hoods: { ...base, hoverScale: 1.1, hoverTilt: -3, press: 'hop', sound: 'hoodEquip', spring: 'bouncy' },
  quests: { ...base, hoverScale: 1.08, hoverTilt: 2, press: 'flutter', sound: 'quests', spring: 'paper' },
  treasure: { ...base, hoverScale: 1.09, hoverTilt: -2, press: 'shake', sound: 'chest', spring: 'wood' },
  purchases: { ...base, hoverScale: 1.11, hoverTilt: 5, press: 'crumple', sound: 'chaChing', spring: 'snappy' },
  watch_ads: { ...base, hoverScale: 1.08, hoverTilt: -4, press: 'flutter', sound: 'fishing', spring: 'wobbly' },
  settings: { ...base, hoverScale: 1.07, hoverTilt: 0, press: 'spin', sound: 'settings', spring: 'metal' },
  profile: { ...base, hoverScale: 1.08, hoverTilt: 2, press: 'squash', sound: 'clickSoft', spring: 'bouncy' },
  wood: { ...base, hoverScale: 1.06, hoverTilt: 1.5, press: 'squash', sound: 'wood', spring: 'wood' },
  ice: { ...base, hoverScale: 1.06, hoverTilt: 1, press: 'snap', sound: 'clickSoft', spring: 'ice' },
};
