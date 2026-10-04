/**
 * Economy tuning — three primary currencies (spec §39). Rebalanced in the
 * progression update (economy v2); targets, assumptions and simulation
 * results are documented in docs/ECONOMY.md and reproduced by
 * tests/unit/economySim.test.ts.
 *
 *  ICICLES       common/general: Adventure, Daily, Infinite, quests; spent on
 *                the 800-Icicle continue and ordinary progression (Waddles).
 *  ICICLE SHARDS primary Hood currency: quests, Daily milestones, achievements.
 *  FISH CURRENCY scarce: Ranked, selected milestones, hard quests, compliant
 *                rewarded-ad Fishing; spent on Treasure Chests.
 * In code `FishCurrency` (wallet.fish) is unrelated to gameplay DribbleFish.
 */
export type Currency = 'icicles' | 'shards' | 'fish';

export const CURRENCY_LABEL: Record<Currency, { singular: string; plural: string; icon: string }> = {
  icicles: { singular: 'Icicle', plural: 'Icicles', icon: 'icon_icicle' },
  shards: { singular: 'Icicle Shard', plural: 'Icicle Shards', icon: 'icon_icicle_shard' },
  fish: { singular: 'Fish', plural: 'Fish', icon: 'icon_fish_currency' },
};

export const CONTINUE_COST_ICICLES = 800;

/** Bumped when acquisition rules change (save migration v1→v2 keeps everything already owned). */
export const ECONOMY_VERSION = 2;

/** Fresh-profile starting balances. A few Fish so the pet goldfish can be fed on day one. */
export const STARTING_WALLET = { icicles: 200, shards: 0, fish: 3 } as const;

export const LEVEL_REWARDS = {
  adventure: { base: 12, perDifficulty: 0.45, firstClearBonus: 25, perStar: 4 },
  daily: { base: 15, perDifficulty: 0.4, perStar: 3 },
  infinite: { base: 10, perLevel: 0.6, perStar: 3, maxBase: 140 },
  /** Hard Mode multiplies Icicle rewards. */
  hardMultiplier: 1.5,
  /** Rare (golden) DribbleFish stashed bonus — NOT Fish Currency. */
  rareFishBonusIcicles: 15,
  /** Repeat clears of an already-starred Adventure level pay this fraction. */
  repeatFactor: 0.35,
} as const;

/** Exactly five Treasure Chest tiers priced in Fish Currency (spec §63). */
export const CHEST_TIERS = [
  { id: 'minnow', name: 'Minnow Crate', price: 25, art: 'chest_minnow_crate', rolls: 2, hoodChance: 0.25, drama: 1 },
  { id: 'mackerel', name: 'Mackerel Chest', price: 100, art: 'chest_mackerel', rolls: 3, hoodChance: 0.55, drama: 2 },
  { id: 'tuna', name: 'Tuna Trunk', price: 225, art: 'chest_tuna_trunk', rolls: 4, hoodChance: 0.8, drama: 3 },
  { id: 'emperor', name: 'Emperor Chest', price: 400, art: 'btnicon_treasure_normal', rolls: 5, hoodChance: 1, drama: 4 },
  { id: 'leviathan', name: 'Leviathan Chest', price: 625, art: 'btnicon_treasure_hover', rolls: 6, hoodChance: 1, drama: 5 },
] as const;
export type ChestTierId = (typeof CHEST_TIERS)[number]['id'];

/**
 * Hood rarity odds per chest (rarity index → weight %), shown verbatim on the
 * Treasure sign. Weighted toward the low end of each window so the top rarity
 * of a window is a disclosed, intentional rare drop rather than a coin flip.
 */
export const CHEST_HOOD_ODDS: Record<ChestTierId, ReadonlyArray<readonly [number, number]>> = {
  minnow: [[0, 60], [1, 32], [2, 8]],
  mackerel: [[1, 55], [2, 33], [3, 12]],
  tuna: [[2, 50], [3, 32], [4, 14], [5, 4]],
  emperor: [[4, 45], [5, 32], [6, 17], [7, 6]],
  leviathan: [[6, 45], [7, 32], [8, 17], [9, 6]],
};

/** Duplicate Hoods from chests convert to this fraction of their Shard price. */
export const DUPLICATE_HOOD_SHARD_FRACTION = 0.25;

/** The lowest chest may alternatively be earned via ONE verified rewarded ad, 30-minute cooldown. */
export const AD_CHEST = { tier: 'minnow' as ChestTierId, cooldownMs: 30 * 60 * 1000 };

/** Fishing (Watch Ads) reward after a VERIFIED rewarded-ad completion. */
export const FISHING_REWARD_FISH = 10;

/** Penguin species / outfits (Choose Your Waddle) cost Icicles — ordinary progression. */
export const WADDLE_PRICES = { species: 600, outfit: 2400 } as const;

/**
 * Hood prices (Icicle Shards) by rarity index 0..9 (economy v2; v1 was
 * 20/45/90/160/260/420/650/950/1400/2200). Prices never affect Hoods already
 * owned. Targets for a regular player (≈30 min/day): first Hood in the first
 * session, Epic after roughly a week, Food as a long-term goal.
 */
export const HOOD_PRICE_BY_RARITY = [30, 70, 150, 300, 550, 900, 1500, 2400, 3800, 6000] as const;

/**
 * Icicle-earning economy families (Icicles only): Pollution 110% … Food 1000%
 * (spec §57). Icicles cannot compound into Shards beyond the daily-capped
 * exchange, so this curve does not bypass Hood progression.
 */
export const ECONOMY_HOOD_CURVE = [1.1, 1.2, 1.35, 1.55, 1.8, 2.2, 2.8, 3.8, 5.5, 10.0] as const;

/**
 * Shard-affecting families (Shard Earnings, the Shard part of Quest Rewards)
 * use a deliberately flat curve, capped at +50%: a Shard multiplier compounds
 * directly into faster Hood purchases, so it must stay modest.
 */
export const SHARD_HOOD_CURVE = [1.05, 1.08, 1.12, 1.16, 1.2, 1.25, 1.3, 1.36, 1.43, 1.5] as const;
export const MAX_SHARD_MULTIPLIER = 1.5;

/** Real-money shop is an OPTIONAL integration — disabled until a provider + backend exist. */
export const REAL_MONEY_CATALOG = [
  { productId: 'icicles_small', label: 'Pocket of Icicles', grants: { icicles: 2500 }, referencePriceUsd: 1.99 },
  { productId: 'shards_small', label: 'Handful of Shards', grants: { shards: 300 }, referencePriceUsd: 1.99 },
  { productId: 'fish_bucket', label: 'Bucket of Fish', grants: { fish: 120 }, referencePriceUsd: 4.99 },
  { productId: 'icicles_large', label: 'Glacier of Icicles', grants: { icicles: 15000 }, referencePriceUsd: 9.99 },
] as const;

/**
 * Earned-currency shop exchanges (no real money). v1 had no limits, which let
 * Icicles convert into Shards without bound; v2 caps each trade per UTC
 * period (same period keys as quests) so the exchange is a useful top-up,
 * not the main Hood source. Shards→Fish is priced above the pet's best
 * Shard-per-Fish return so the two can never be looped for profit.
 */
export const EXCHANGE_OFFERS = [
  { id: 'ex_shards_s', label: '20 Icicle Shards', cost: { icicles: 1500 }, grants: { shards: 20 }, limit: { per: 'daily', count: 1 } },
  { id: 'ex_shards_m', label: '80 Icicle Shards', cost: { icicles: 5000 }, grants: { shards: 80 }, limit: { per: 'weekly', count: 1 } },
  { id: 'ex_fish_s', label: '15 Fish', cost: { shards: 135 }, grants: { fish: 15 }, limit: { per: 'daily', count: 1 } },
] as const;
export type ExchangeOffer = (typeof EXCHANGE_OFFERS)[number];

// ------------------------------------------------------------- Adventure roadmap chests

/** A milestone chest sits on the Adventure route after every Nth level. */
export const ADVENTURE_CHEST_EVERY = 10;

export interface RoadmapChestDef {
  /** The level whose first clear unlocks the chest (10, 20, …, 800). */
  level: number;
  kind: 'milestone' | 'region';
  name: string;
  reward: { icicles: number; shards: number; fish: number };
  /** Region chests also drop a Treasure Chest into the inventory. */
  bonusChest?: ChestTierId;
}

/**
 * Configured roadmap rewards (replaces v1's silent every-10th-level Shard
 * grant). Values grow gently with the region; region-end chests are bigger.
 */
export function roadmapChest(level: number): RoadmapChestDef | null {
  if (level < ADVENTURE_CHEST_EVERY || level % ADVENTURE_CHEST_EVERY !== 0 || level > 800) return null;
  const region = Math.ceil(level / 50); // 1..16
  if (level % 50 === 0) {
    return {
      level, kind: 'region', name: 'Region Treasure',
      reward: { icicles: 400 + region * 60, shards: 20 + region * 2, fish: 8 + Math.floor(region / 2) },
      bonusChest: region >= 12 ? 'tuna' : region >= 5 ? 'mackerel' : 'minnow',
    };
  }
  return { level, kind: 'milestone', name: 'Milestone Chest', reward: { icicles: 120 + region * 15, shards: 4 + Math.floor(region / 3), fish: 2 } };
}
