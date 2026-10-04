/**
 * Treasure Chest rolls. Rewards are rolled from a seeded stream derived from
 * the transaction id, then applied atomically with the Fish payment via
 * Wallet.exchange (so a refresh can never re-roll or double-pay).
 */
import { CHEST_HOOD_ODDS, CHEST_TIERS, DUPLICATE_HOOD_SHARD_FRACTION, type ChestTierId } from '../config/economy';
import { Rng } from '../core/rng';
import { HOODS, type HoodDef } from '../progression/hoods';
import type { Reward } from './wallet';

/** Rolls a rarity index from the disclosed odds table. */
function rollRarity(rng: Rng, tier: ChestTierId): number {
  return rng.weighted([...CHEST_HOOD_ODDS[tier]], (o) => o[1])[0];
}

export interface ChestItem {
  kind: 'icicles' | 'shards' | 'fish' | 'hood' | 'duplicate';
  amount?: number;
  hood?: HoodDef;
}

export interface ChestRoll {
  tier: ChestTierId;
  items: ChestItem[];
  reward: Reward;
}

export function rollChest(tier: ChestTierId, txId: string, owned: readonly string[]): ChestRoll {
  const def = CHEST_TIERS.find((c) => c.id === tier)!;
  const rng = new Rng(`chest:${txId}`);
  const items: ChestItem[] = [];
  const reward: Reward = { icicles: 0, shards: 0, fish: 0, hoods: [] };
  const ownedSet = new Set(owned);
  for (let i = 0; i < def.rolls; i++) {
    const forceHood = i === 0 && rng.chance(def.hoodChance);
    const roll = rng.next();
    if (forceHood || roll < 0.15) {
      const rarity = rollRarity(rng, tier);
      const pool = HOODS.filter((h) => h.rarityIndex === rarity);
      const hood = rng.pick(pool);
      if (ownedSet.has(hood.id) || reward.hoods!.includes(hood.id)) {
        const amount = Math.round(hood.price * DUPLICATE_HOOD_SHARD_FRACTION);
        reward.shards! += amount;
        items.push({ kind: 'duplicate', amount, hood });
      } else {
        reward.hoods!.push(hood.id);
        items.push({ kind: 'hood', hood });
      }
    } else if (roll < 0.55) {
      const amount = Math.round(rng.range(60, 140) * def.drama * def.drama);
      reward.icicles! += amount;
      items.push({ kind: 'icicles', amount });
    } else if (roll < 0.9) {
      const amount = Math.round(rng.range(8, 18) * def.drama * 1.6);
      reward.shards! += amount;
      items.push({ kind: 'shards', amount });
    } else {
      const amount = Math.round(rng.range(2, 6) * def.drama);
      reward.fish! += amount;
      items.push({ kind: 'fish', amount });
    }
  }
  return { tier, items, reward };
}
