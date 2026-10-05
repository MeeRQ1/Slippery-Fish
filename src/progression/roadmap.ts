/**
 * Adventure roadmap chests — configured milestone rewards placed on the map
 * after every 10th level (bigger Region Treasure after every 50th).
 *
 * States: locked (unlocking level not yet cleared in normal mode) →
 * available → claimed. A claim is ONE wallet transaction keyed by the chest's
 * level and also guarded by `adventure.chestsClaimed` inside that same
 * transaction, so replaying the level, reopening the map, double-tapping or
 * reloading can never pay twice (the claimed list persists beyond the
 * bounded transaction-id history).
 */
import { CHEST_TIERS, roadmapChest, type RoadmapChestDef } from '../config/economy';
import type { Reward, Wallet } from '../economy/wallet';
import type { SaveData } from '../save/schema';
import type { SaveManager } from '../save/saveManager';
import { shardMultiplier } from './hoods';

export type RoadmapChestState = 'locked' | 'available' | 'claimed';

export function roadmapChestState(s: Readonly<SaveData>, level: number): RoadmapChestState {
  if (s.adventure.chestsClaimed.includes(level)) return 'claimed';
  return typeof s.adventure.stars[String(level)] === 'number' ? 'available' : 'locked';
}

/** The exact reward a claim would grant right now (Shards include the equipped Hood's capped bonus). */
export function roadmapChestReward(s: Readonly<SaveData>, def: RoadmapChestDef): Reward {
  const mult = shardMultiplier(s.hoods.equipped);
  return { icicles: def.reward.icicles, shards: Math.round(def.reward.shards * mult), fish: def.reward.fish };
}

export interface ClaimResult {
  ok: boolean;
  reason?: 'locked' | 'claimed' | 'none';
  reward?: Reward;
  bonusChest?: string;
}

export function claimRoadmapChest(save: SaveManager, wallet: Wallet, level: number, source?: { x: number; y: number }): ClaimResult {
  const def = roadmapChest(level);
  if (!def) return { ok: false, reason: 'none' };
  const state = roadmapChestState(save.data, level);
  if (state !== 'available') return { ok: false, reason: state === 'claimed' ? 'claimed' : 'locked' };
  const reward = roadmapChestReward(save.data, def);
  let applied = false;
  const ok = wallet.grant(`roadmap:${level}`, reward, (st) => {
    if (st.adventure.chestsClaimed.includes(level)) return; // defensive: never twice
    st.adventure.chestsClaimed.push(level);
    st.adventure.chestsClaimed.sort((a, b) => a - b);
    if (def.bonusChest) st.chests.inventory[def.bonusChest] = (st.chests.inventory[def.bonusChest] ?? 0) + 1;
    applied = true;
  }, source);
  if (!ok || !applied) return { ok: false, reason: 'claimed' };
  const bonus = def.bonusChest ? CHEST_TIERS.find((c) => c.id === def.bonusChest)?.name : undefined;
  return { ok: true, reward, ...(bonus ? { bonusChest: bonus } : {}) };
}

/** Number of chests currently available to claim (for honest menu badges). */
export function availableRoadmapChests(s: Readonly<SaveData>): number[] {
  const out: number[] = [];
  for (const k of Object.keys(s.adventure.stars)) {
    const n = Number(k);
    if (roadmapChest(n) && !s.adventure.chestsClaimed.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}
