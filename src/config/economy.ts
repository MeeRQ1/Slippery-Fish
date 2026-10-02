/**
 * Economy tuning — three primary currencies (spec §39):
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

/** The lowest chest may alternatively be earned via ONE verified rewarded ad, 30-minute cooldown. */
export const AD_CHEST = { tier: 'minnow' as ChestTierId, cooldownMs: 30 * 60 * 1000 };

/** Fishing (Watch Ads) reward after a VERIFIED rewarded-ad completion. */
export const FISHING_REWARD_FISH = 10;

/** Penguin species / outfits (Choose Your Waddle) cost Icicles — ordinary progression. */
export const WADDLE_PRICES = { species: 600, outfit: 2400 } as const;

/** Hood prices (Icicle Shards) by rarity index 0..9. */
export const HOOD_PRICE_BY_RARITY = [20, 45, 90, 160, 260, 420, 650, 950, 1400, 2200] as const;

/** Economy-family Hood strength curve: Pollution 110% … Food 1000% (spec §57). */
export const ECONOMY_HOOD_CURVE = [1.1, 1.2, 1.35, 1.55, 1.8, 2.2, 2.8, 3.8, 5.5, 10.0] as const;

/** Real-money shop is an OPTIONAL integration — disabled until a provider + backend exist. */
export const REAL_MONEY_CATALOG = [
  { productId: 'icicles_small', label: 'Pocket of Icicles', grants: { icicles: 2500 }, referencePriceUsd: 1.99 },
  { productId: 'shards_small', label: 'Handful of Shards', grants: { shards: 300 }, referencePriceUsd: 1.99 },
  { productId: 'fish_bucket', label: 'Bucket of Fish', grants: { fish: 120 }, referencePriceUsd: 4.99 },
  { productId: 'icicles_large', label: 'Glacier of Icicles', grants: { icicles: 15000 }, referencePriceUsd: 9.99 },
] as const;

/** Earned-currency shop exchanges (no real money). */
export const EXCHANGE_OFFERS = [
  { id: 'ex_shards_s', label: '40 Icicle Shards', cost: { icicles: 1200 }, grants: { shards: 40 } },
  { id: 'ex_shards_m', label: '120 Icicle Shards', cost: { icicles: 3200 }, grants: { shards: 120 } },
  { id: 'ex_fish_s', label: '15 Fish', cost: { shards: 120 }, grants: { fish: 15 } },
] as const;
