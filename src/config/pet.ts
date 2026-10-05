/**
 * Pet goldfish — care tiers, habitat presets and food presets.
 *
 * The goldfish is a menu companion, unrelated to gameplay DribbleFish and to
 * the FishCurrency it eats. Feeding is the only economic action:
 *
 *  - The economic day is the UTC date (the same identifier as quests' daily
 *    period and the Daily Challenge reset). Browser-local hour only drives
 *    animation and lighting, never eligibility.
 *  - Feeding once per economic day costs `feedCost` FishCurrency (exactly 1
 *    at the base tier) and makes that day's `dailyShards` benefit available;
 *    collecting it grants the Shards once.
 *  - The tier in effect when you FEED locks that day's cost and benefit.
 *    Upgrading after feeding applies from the next economic day (no top-up
 *    charge, no extra benefit); upgrading before feeding means the Feed button
 *    shows and charges the new tier's cost.
 *  - Missing a day has no penalty and no debt: no benefit for that day.
 *
 * Payback (see docs/ECONOMY.md): Shards per Fish improve with each tier
 * (4.0 → 4.8), beating what Fish are worth in Treasure Chests, but stay far
 * below the shop's 9 Shards-per-Fish price, so Fish bought with Shards can
 * never be fed back for a profit.
 */
export interface PetTier {
  tier: number;
  name: string;
  /** FishCurrency charged per feeding (once per economic day). */
  feedCost: number;
  /** Icicle Shards made available by that day's feeding. */
  dailyShards: number;
  /** Icicles to upgrade INTO this tier (0 for the starting tier). */
  upgradePrice: number;
  /** What visibly changes in the habitat at this tier. */
  perk: string;
}

export const PET_TIERS: readonly PetTier[] = [
  { tier: 1, name: 'Starter Care', feedCost: 1, dailyShards: 4, upgradePrice: 0, perk: 'A happy goldfish and a cosy tank.' },
  { tier: 2, name: 'Comfy Care', feedCost: 2, dailyShards: 9, upgradePrice: 4000, perk: 'Bubble stone: a gentle stream of bubbles.' },
  { tier: 3, name: 'Deluxe Care', feedCost: 3, dailyShards: 14, upgradePrice: 10000, perk: 'Glow pebbles light the gravel.' },
  { tier: 4, name: 'Royal Care', feedCost: 4, dailyShards: 19, upgradePrice: 20000, perk: 'A tiny royal cushion for naps.' },
  { tier: 5, name: 'Legendary Care', feedCost: 5, dailyShards: 24, upgradePrice: 40000, perk: 'A golden crown — the fish is now royalty.' },
];

export const PET_MAX_TIER = PET_TIERS.length;

export function petTier(t: number): PetTier {
  return PET_TIERS[Math.min(PET_MAX_TIER, Math.max(1, Math.floor(t))) - 1]!;
}

/** Cosmetic presets. Prices are Icicles (ordinary progression), 0 = free starter. */
export interface FishLook {
  id: string;
  name: string;
  body: string;
  belly: string;
  fin: string;
  pattern: 'none' | 'spots' | 'patches' | 'stripes' | 'shimmer';
  patternColor: string;
  price: number;
}

export const FISH_LOOKS: readonly FishLook[] = [
  { id: 'classic', name: 'Classic Orange', body: '#ff8a2a', belly: '#ffc078', fin: '#ff6a1a', pattern: 'none', patternColor: '#ffffff', price: 0 },
  { id: 'sunrise', name: 'Sunrise Calico', body: '#ffb347', belly: '#fff0d0', fin: '#ff7f50', pattern: 'spots', patternColor: '#e8473a', price: 0 },
  { id: 'lemon', name: 'Lemon Drop', body: '#ffd84a', belly: '#fff6c2', fin: '#ffb800', pattern: 'none', patternColor: '#ffffff', price: 0 },
  { id: 'koi', name: 'Koi Splash', body: '#fbf7f0', belly: '#ffffff', fin: '#f2f2f2', pattern: 'patches', patternColor: '#e8412f', price: 900 },
  { id: 'midnight', name: 'Midnight Comet', body: '#2b2d4a', belly: '#4a4d78', fin: '#f6c945', pattern: 'spots', patternColor: '#f6c945', price: 900 },
  { id: 'bubblegum', name: 'Bubblegum Shubunkin', body: '#ff9ccf', belly: '#ffe0f0', fin: '#7fd0ff', pattern: 'spots', patternColor: '#6a7cff', price: 1200 },
  { id: 'tiger', name: 'Tiger Tail', body: '#ff9a3c', belly: '#ffd8a8', fin: '#ff7a1a', pattern: 'stripes', patternColor: '#3a2410', price: 1200 },
  { id: 'aurora', name: 'Aurora Shimmer', body: '#7fe3d6', belly: '#e0fff9', fin: '#b68cff', pattern: 'shimmer', patternColor: '#ffffff', price: 2400 },
];

export interface TankStyle {
  id: string;
  name: string;
  /** Water gradient top/bottom, frame colour and gravel colours. */
  waterTop: string;
  waterBottom: string;
  frame: string;
  frameHi: string;
  gravel: [string, string, string];
  shape: 'bowl' | 'tank' | 'igloo';
  price: number;
}

export const TANK_STYLES: readonly TankStyle[] = [
  { id: 'bowl', name: 'Classic Fishbowl', waterTop: '#bfefff', waterBottom: '#5cc4f0', frame: '#e8f7ff', frameHi: '#ffffff', gravel: ['#f7d36b', '#e9a94b', '#ffe8a8'], shape: 'bowl', price: 0 },
  { id: 'igloo', name: 'Igloo Aquarium', waterTop: '#d6f4ff', waterBottom: '#7cc4f0', frame: '#ffffff', frameHi: '#dff1fd', gravel: ['#ffffff', '#cfe6f7', '#9fd0f5'], shape: 'igloo', price: 0 },
  { id: 'reef', name: 'Coral Reef Tank', waterTop: '#a8f0ff', waterBottom: '#2fa6d8', frame: '#6f3f1d', frameHi: '#b87642', gravel: ['#ffb4a2', '#ff8a7a', '#ffe0d6'], shape: 'tank', price: 1500 },
  { id: 'lagoon', name: 'Moonlit Lagoon', waterTop: '#7fb6ff', waterBottom: '#1f4e9e', frame: '#2a3a66', frameHi: '#5a6ea8', gravel: ['#b9a8ff', '#8a7ae0', '#e0d8ff'], shape: 'tank', price: 2500 },
  { id: 'candy', name: 'Sweet Shop Jar', waterTop: '#ffe6f4', waterBottom: '#ff9ccf', frame: '#ffffff', frameHi: '#ffd0ea', gravel: ['#ff6fa8', '#7fd0ff', '#ffd23f'], shape: 'bowl', price: 2000 },
];

export interface DecorPreset {
  id: string;
  name: string;
  kind: 'castle' | 'kelp' | 'sled' | 'snowman' | 'chest' | 'arch' | 'shell';
  price: number;
}

/** Up to PET_DECOR_SLOTS decorations can be shown at once. */
export const PET_DECOR_SLOTS = 2;

export const DECOR_PRESETS: readonly DecorPreset[] = [
  { id: 'kelp', name: 'Kelp Garden', kind: 'kelp', price: 0 },
  { id: 'castle', name: 'Tiny Snow Castle', kind: 'castle', price: 0 },
  { id: 'shell', name: 'Pearl Shell', kind: 'shell', price: 600 },
  { id: 'sled', name: 'Sunken Sled', kind: 'sled', price: 800 },
  { id: 'snowman', name: 'Snowfish Statue', kind: 'snowman', price: 800 },
  { id: 'arch', name: 'Ice Arch', kind: 'arch', price: 1000 },
  { id: 'chest', name: 'Treasure Chest', kind: 'chest', price: 1200 },
];

export interface FoodPreset {
  id: string;
  name: string;
  /** Particle colours that sprinkle into the tank. */
  colors: string[];
  shape: 'flake' | 'pellet' | 'heart' | 'star';
  price: number;
  description: string;
}

/** Every food has the same feeding effect — the difference is presentation only. */
export const FOOD_PRESETS: readonly FoodPreset[] = [
  { id: 'flakes', name: 'Classic Flakes', colors: ['#ff9a3c', '#ffd23f', '#ff6a3a'], shape: 'flake', price: 0, description: 'Crunchy flakes that flutter down.' },
  { id: 'pellets', name: 'Krill Pellets', colors: ['#e86a5a', '#c84a3a'], shape: 'pellet', price: 0, description: 'Plump little pellets that sink fast.' },
  { id: 'hearts', name: 'Sweetheart Bites', colors: ['#ff5c7a', '#ff9ab0'], shape: 'heart', price: 400, description: 'Heart-shaped treats. Lots of love, same nutrition.' },
  { id: 'stars', name: 'Starlight Sprinkles', colors: ['#ffd23f', '#7fd0ff', '#ff9ccf', '#8fe0a0'], shape: 'star', price: 600, description: 'Sparkly star sprinkles that twinkle as they fall.' },
];

export const PET_DEFAULT_NAME = 'Bubbles';
