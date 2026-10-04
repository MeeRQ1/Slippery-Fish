/**
 * Pet goldfish care — the only economic part of the pet (everything else is
 * presentation). Pure functions over SaveManager + Wallet so they are unit
 * tested directly; the menu habitat only calls these.
 *
 * Daily states for economic day D (UTC date, same as the Daily reset):
 *   notFed            no feeding committed for D
 *   feedingCommitted  (UI-only, transient) the Feed transaction has been
 *                     written; the sprinkle/eat animation is playing. Reward
 *                     authority never waits for the animation.
 *   benefitAvailable  fedDay === D and benefitDay !== D: Shards ready to collect
 *   benefitGranted    benefitDay === D
 * A feeding paid on an earlier day whose benefit was never collected stays
 * collectable (`pendingBenefit`) — it was paid for — but no benefit is ever
 * created for a day without a feeding, and nothing is spent automatically.
 */
import { FISH_LOOKS, DECOR_PRESETS, FOOD_PRESETS, PET_DECOR_SLOTS, PET_MAX_TIER, TANK_STYLES, petTier, type PetTier } from '../config/pet';
import { utcDateKey } from '../levels/daily';
import type { Wallet } from '../economy/wallet';
import type { SaveManager } from '../save/saveManager';
import type { SaveData } from '../save/schema';
import { sanitizePetName } from '../save/schema';

export type PetDayStatus = 'notFed' | 'benefitAvailable' | 'benefitGranted';

export interface PetStatus {
  dayId: string;
  status: PetDayStatus;
  tier: PetTier;
  /** What feeding right now would cost / make available (current tier). */
  feedCost: number;
  feedBenefit: number;
  /** An earlier paid feeding whose Shards were not collected yet. */
  pendingBenefit: { day: string; shards: number } | null;
  canAffordFeed: boolean;
}

export function economicDayId(nowMs: number): string {
  return utcDateKey(nowMs);
}

export function petStatus(s: Readonly<SaveData>, nowMs: number): PetStatus {
  const dayId = economicDayId(nowMs);
  const p = s.pet;
  const tier = petTier(p.tier);
  let status: PetDayStatus = 'notFed';
  if (p.fedDay === dayId) status = p.benefitDay === dayId ? 'benefitGranted' : 'benefitAvailable';
  const pending = p.fedDay !== '' && p.fedDay !== dayId && p.benefitDay !== p.fedDay ? { day: p.fedDay, shards: p.fedBenefit } : null;
  return { dayId, status, tier, feedCost: tier.feedCost, feedBenefit: tier.dailyShards, pendingBenefit: pending, canAffordFeed: s.wallet.fish >= tier.feedCost };
}

export type FeedResult = { ok: true; cost: number; benefit: number } | { ok: false; reason: 'alreadyFed' | 'insufficient' | 'pendingFirst' };

/**
 * Commits today's feeding: spends the current tier's Fish cost and locks in
 * that tier's Shard benefit for today. Exactly once per economic day (the
 * fedDay check persists; the tx id also includes the day).
 */
export function feedPet(save: SaveManager, wallet: Wallet, nowMs: number, onTrack?: () => void): FeedResult {
  const st = petStatus(save.data, nowMs);
  if (st.status !== 'notFed') return { ok: false, reason: 'alreadyFed' };
  // Collect an older paid benefit first so the single fed-day record never overwrites an unpaid benefit.
  if (st.pendingBenefit) return { ok: false, reason: 'pendingFirst' };
  if (!st.canAffordFeed) return { ok: false, reason: 'insufficient' };
  const { feedCost: cost, feedBenefit: benefit, dayId } = st;
  const ok = wallet.spend(`pet:feed:${dayId}`, { fish: cost }, (s) => {
    s.pet.fedDay = dayId;
    s.pet.fedTier = s.pet.tier;
    s.pet.fedCost = cost;
    s.pet.fedBenefit = benefit;
    s.pet.daysFed += 1;
  });
  if (!ok) return { ok: false, reason: save.data.pet.fedDay === dayId ? 'alreadyFed' : 'insufficient' };
  onTrack?.();
  return { ok: true, cost, benefit };
}

/** Grants the Shards of the most recent paid feeding (today's, or an uncollected earlier one). */
export function collectPetBenefit(save: SaveManager, wallet: Wallet, nowMs: number, source?: { x: number; y: number }): number {
  const p = save.data.pet;
  if (!p.fedDay || p.benefitDay === p.fedDay) return 0;
  const day = p.fedDay;
  const shards = p.fedBenefit;
  // Same-day guard lives inside the transaction too.
  let granted = 0;
  wallet.grant(`pet:benefit:${day}`, { shards }, (s) => {
    if (s.pet.benefitDay === day) return;
    s.pet.benefitDay = day;
    granted = shards;
  }, source);
  void nowMs;
  return granted;
}

export type UpgradeResult = { ok: true; tier: PetTier; appliesToday: boolean } | { ok: false; reason: 'max' | 'insufficient' };

/**
 * Upgrades the care tier with Icicles. If today's feeding is already
 * committed, today's cost/benefit stay as paid and the new tier applies from
 * the next economic day (disclosed in the UI before purchase).
 */
export function upgradePet(save: SaveManager, wallet: Wallet, nowMs: number): UpgradeResult {
  const cur = save.data.pet.tier;
  if (cur >= PET_MAX_TIER) return { ok: false, reason: 'max' };
  const next = petTier(cur + 1);
  const ok = wallet.spend(`pet:upgrade:${next.tier}`, { icicles: next.upgradePrice }, (s) => { s.pet.tier = Math.max(s.pet.tier, next.tier); });
  if (!ok) return { ok: false, reason: 'insufficient' };
  return { ok: true, tier: next, appliesToday: petStatus(save.data, nowMs).status === 'notFed' };
}

export type CosmeticKind = 'looks' | 'tanks' | 'decor' | 'foods';

const CATALOG = { looks: FISH_LOOKS, tanks: TANK_STYLES, decor: DECOR_PRESETS, foods: FOOD_PRESETS } as const;

export function cosmeticPrice(kind: CosmeticKind, id: string): number | null {
  const item = (CATALOG[kind] as ReadonlyArray<{ id: string; price: number }>).find((x) => x.id === id);
  return item ? item.price : null;
}

/** Buys (if needed) and applies a cosmetic preset. Free/owned items just apply. */
export function choosePetCosmetic(save: SaveManager, wallet: Wallet, kind: CosmeticKind, id: string): 'applied' | 'bought' | 'insufficient' | 'unknown' {
  const price = cosmeticPrice(kind, id);
  if (price === null) return 'unknown';
  const owned = save.data.pet.owned[kind].includes(id);
  const apply = (s: SaveData) => {
    if (kind === 'looks') s.pet.look = id;
    else if (kind === 'tanks') s.pet.tank = id;
    else if (kind === 'foods') s.pet.food = id;
    else {
      const list = s.pet.decor.filter((x) => x !== id);
      if (s.pet.decor.includes(id)) s.pet.decor = list; // toggle off
      else s.pet.decor = [...list, id].slice(-PET_DECOR_SLOTS);
    }
  };
  if (owned) {
    save.mutate(apply);
    return 'applied';
  }
  const ok = wallet.spend(`pet:buy:${kind}:${id}`, { icicles: price }, (s) => {
    if (!s.pet.owned[kind].includes(id)) s.pet.owned[kind].push(id);
    apply(s);
  });
  return ok ? 'bought' : 'insufficient';
}

export function renamePet(save: SaveManager, name: string): string {
  const clean = sanitizePetName(name);
  save.mutate((s) => { s.pet.name = clean; });
  return clean;
}
