/**
 * Economy v2 acceptance: deterministic simulations through the real reward
 * code (see src/economy/simulate.ts for the stated player models). Results are
 * estimates; these tests pin the documented targets in docs/ECONOMY.md.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_MODELS, simulateDays, simulateFreshSession } from '../../src/economy/simulate';
import { HOODS, RARITIES, questMultipliers, shardMultiplier } from '../../src/progression/hoods';
import { EXCHANGE_OFFERS, MAX_SHARD_MULTIPLIER } from '../../src/config/economy';
import { PET_TIERS } from '../../src/config/pet';

const EPIC = RARITIES.findIndex((r) => r.id === 'epic');
const cheapest = (ri: number) => Math.min(...HOODS.filter((h) => h.rarityIndex === ri).map((h) => h.price));

describe('fresh profile: the first five minutes', () => {
  for (const m of Object.values(PLAYER_MODELS)) {
    it(`${m.name}: no Epic (or anything above the first two rarities) in five minutes`, async () => {
      for (const tryDaily of [false, true]) {
        const s = await simulateFreshSession(m, 300, { tryDaily });
        expect(s.bestOwnedRarity).toBeLessThanOrEqual(0);
        expect(s.bestAffordableRarity).toBeLessThanOrEqual(1);
        expect(s.shardsEarned).toBeLessThan(cheapest(EPIC) / 5);
      }
    }, 60_000);
  }

  it('the first hour keeps Epic well out of reach for every skill level', async () => {
    for (const m of Object.values(PLAYER_MODELS)) {
      const s = await simulateFreshSession(m, 3600);
      expect(s.bestAffordableRarity).toBeLessThanOrEqual(3);
      expect(s.shardsEarned).toBeLessThan(cheapest(EPIC));
    }
  }, 120_000);
});

describe('multi-day progression targets (estimates)', () => {
  it('regular player (30 min/day): first Hood on day 1, Epic affordable around the second week, Food is long-term', async () => {
    const r = await simulateDays(PLAYER_MODELS.regular, 14);
    const day = (sec: number | null) => (sec === null ? null : r.snapshots.findIndex((s) => s.playSec >= sec) + 1);
    expect(day(r.timeToAffordRarity[0]!)).toBe(1);
    const epicDay = day(r.timeToAffordRarity[EPIC]!);
    expect(epicDay).not.toBeNull();
    expect(epicDay!).toBeGreaterThanOrEqual(5);
    expect(epicDay!).toBeLessThanOrEqual(12);
    expect(r.timeToAffordRarity[9]).toBeNull();
    // Practical FishCurrency without ads or Ranked: the pet was fed and Fish still accumulate.
    expect(r.final.fish).toBeGreaterThan(50);
    expect(r.shardsBySource.pet ?? 0).toBeGreaterThan(0);
  }, 300_000);

  it('casual player (15 min/day) does not reach Epic in the first week', async () => {
    const r = await simulateDays(PLAYER_MODELS.casual, 7);
    expect(r.timeToAffordRarity[EPIC]).toBeNull();
    expect(r.final.hoodsOwned).toBeGreaterThanOrEqual(1);
  }, 300_000);
});

describe('bonus stacking is bounded', () => {
  it('no Hood pushes Shard income above the cap; quest Shard bonus uses the flat curve', () => {
    for (const h of HOODS) {
      expect(shardMultiplier(h.id)).toBeLessThanOrEqual(MAX_SHARD_MULTIPLIER);
      expect(questMultipliers(h.id).shards).toBeLessThanOrEqual(MAX_SHARD_MULTIPLIER);
    }
  });

  it('pet returns stay below the Shards→Fish shop price (no feed-for-profit loop)', () => {
    const fishOffer = EXCHANGE_OFFERS.find((o) => 'fish' in o.grants)!;
    const shardsPerBoughtFish = (fishOffer.cost as { shards: number }).shards / (fishOffer.grants as { fish: number }).fish;
    expect(PET_TIERS[0]!.feedCost).toBe(1);
    let prev = 0;
    for (const t of PET_TIERS) {
      expect(t.dailyShards / t.feedCost).toBeLessThan(shardsPerBoughtFish);
      expect(t.dailyShards).toBeGreaterThan(prev);
      prev = t.dailyShards;
    }
  });
});
