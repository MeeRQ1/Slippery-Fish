/**
 * CENTRAL AUDIO MANIFEST — the only place audio is assigned.
 *
 * MUSIC: no finished/licensed music was supplied, so every slot is explicitly
 * `null` (unassigned). The game plays safely in silence for those slots. To
 * add a track: drop the file in public/assets/audio/music/ and set
 *   region_beach: { src: ['assets/audio/music/beach.mp3'], volume: 0.7, loop: true, license: '…' }
 *
 * SFX: every effect below is a *procedurally synthesized placeholder* (Web
 * Audio oscillators/noise, generated at runtime — no audio files). Replace any
 * entry with recorded audio by adding `src: ['assets/audio/sfx/xyz.mp3']`;
 * `src` always wins over `synth`.
 */

export const MUSIC_SLOTS = [
  'main_menu', 'adventure',
  'region_classic_winter', 'region_snow_forest', 'region_spring_thaw', 'region_beach', 'region_summer', 'region_fall',
  'region_ice_cream', 'region_frozen_lake', 'region_aurora', 'region_candy_snow', 'region_blizzard', 'region_glacier_caves',
  'region_arctic_night', 'region_festival', 'region_crystal_ice', 'region_mastery',
  'daily', 'infinite', 'ranked', 'fishing', 'character_select', 'hoods', 'quests', 'shop', 'chests',
  'victory', 'defeat', 'outmatched',
] as const;

export type MusicSlot = (typeof MUSIC_SLOTS)[number];

export interface MusicTrack {
  /** Paths relative to the site base (first playable format wins). */
  src: string[];
  volume: number;
  loop: boolean;
  /** Licence / source note (required before release). */
  license: string;
}

/** All slots intentionally unassigned until real, licensed music exists. */
export const MUSIC: Record<MusicSlot, MusicTrack | null> = Object.fromEntries(MUSIC_SLOTS.map((s) => [s, null])) as Record<MusicSlot, MusicTrack | null>;

export type SynthRecipe =
  | 'hover' | 'click' | 'clickSoft' | 'back' | 'chaChing' | 'chestClunk' | 'chestJingle' | 'paperStamp' | 'gearClick'
  | 'bobber' | 'bell' | 'boing' | 'pop' | 'scoreChime' | 'thud' | 'heartbeat' | 'chomp' | 'whoosh' | 'beepLow'
  | 'deflate' | 'fanfare' | 'clang' | 'wahWah' | 'cry' | 'tromboneSad' | 'starDing' | 'coin' | 'fwip' | 'chains'
  | 'woodCreak' | 'woodKnock' | 'reel' | 'splash' | 'gong' | 'puff' | 'slideSeal' | 'growl' | 'swoosh' | 'denied';

export interface SfxDef {
  synth?: SynthRecipe;
  src?: string[];
  volume: number;
  /** Minimum ms between plays (anti-spam). */
  cooldownMs: number;
  /** Random pitch variation ± (fraction). */
  pitchVariance: number;
  /** Max simultaneous voices of this effect. */
  maxVoices: number;
}

const s = (synth: SynthRecipe, volume = 0.6, cooldownMs = 40, pitchVariance = 0.04, maxVoices = 3): SfxDef => ({ synth, volume, cooldownMs, pitchVariance, maxVoices });

export const SFX = {
  // UI
  hover: s('hover', 0.18, 60, 0.06, 2),
  click: s('click', 0.45, 50, 0.03, 2),
  clickSoft: s('clickSoft', 0.35, 50, 0.03, 2),
  back: s('back', 0.4, 80, 0.02, 1),
  denied: s('denied', 0.45, 200, 0, 1),
  // Contextual buttons (spec §48)
  chaChing: s('chaChing', 0.6, 300, 0, 1),
  chest: s('chestClunk', 0.6, 200, 0.02, 1),
  chestJingle: s('chestJingle', 0.5, 200, 0.02, 1),
  quests: s('paperStamp', 0.55, 150, 0.03, 1),
  settings: s('gearClick', 0.5, 150, 0.03, 1),
  fishing: s('bobber', 0.55, 150, 0.04, 1),
  ranked: s('bell', 0.5, 300, 0, 1),
  // Gameplay
  fishBounce: s('boing', 0.5, 45, 0.12, 4),
  fishScore: s('scoreChime', 0.7, 120, 0, 2),
  scorePop: s('pop', 0.6, 60, 0.08, 3),
  collision: s('thud', 0.45, 60, 0.1, 3),
  danger: s('heartbeat', 0.35, 700, 0, 1),
  fishEaten: s('chomp', 0.7, 200, 0.05, 2),
  sprint: s('whoosh', 0.3, 250, 0.06, 1),
  staminaLow: s('beepLow', 0.35, 900, 0, 1),
  staminaEmpty: s('deflate', 0.45, 900, 0, 1),
  enemyAlert: s('growl', 0.35, 600, 0.1, 1),
  sealDash: s('slideSeal', 0.35, 300, 0.08, 1),
  puff: s('puff', 0.4, 80, 0.1, 3),
  // Results
  victory: s('fanfare', 0.65, 1000, 0, 1),
  trophy: s('clang', 0.6, 400, 0, 1),
  trophyWhoosh: s('swoosh', 0.45, 400, 0, 1),
  defeat: s('wahWah', 0.55, 1000, 0, 1),
  crying: s('cry', 0.45, 1000, 0, 1),
  outmatched: s('tromboneSad', 0.65, 1500, 0, 1),
  star: s('starDing', 0.5, 60, 0, 5),
  currency: s('coin', 0.4, 45, 0.05, 4),
  questClaim: s('paperStamp', 0.6, 200, 0, 1),
  hoodEquip: s('fwip', 0.5, 150, 0.04, 1),
  chains: s('chains', 0.45, 300, 0.03, 1),
  wood: s('woodKnock', 0.5, 120, 0.05, 2),
  woodCreak: s('woodCreak', 0.35, 400, 0.08, 1),
  reel: s('reel', 0.45, 200, 0, 1),
  splash: s('splash', 0.5, 150, 0.06, 2),
  rankedRound: s('gong', 0.6, 800, 0, 1),
} satisfies Record<string, SfxDef>;

export type SfxId = keyof typeof SFX;

export const AUDIO_TIMING = {
  musicCrossfadeSeconds: 0.9,
  /** Max total simultaneous SFX voices. */
  maxTotalVoices: 14,
} as const;
