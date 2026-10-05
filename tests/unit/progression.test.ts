import { describe, expect, it } from 'vitest';
import { EXCHANGE_OFFERS, HOOD_PRICE_BY_RARITY, roadmapChest } from '../../src/config/economy';
import { PET_TIERS } from '../../src/config/pet';
import { TITLES } from '../../src/config/titles';
import { trade, tradesLeft } from '../../src/economy/exchange';
import { Wallet } from '../../src/economy/wallet';
import { collectPetBenefit, choosePetCosmetic, feedPet, petStatus, upgradePet } from '../../src/pet/petService';
import { HOODS } from '../../src/progression/hoods';
import { availableRoadmapChests, claimRoadmapChest, roadmapChestState } from '../../src/progression/roadmap';
import { equipTitle, equippedTitleName, evaluateProgressTitles, evaluateRunTitles, isDefaultRules, type RunConditions } from '../../src/progression/titles';
import { defaultSave, sanitizeSave } from '../../src/save/schema';
import { SaveManager } from '../../src/save/saveManager';
import { MemoryBackend } from '../../src/save/storage';

async function setup(raw?: unknown): Promise<{ save: SaveManager; wallet: Wallet }> {
  const backend = new MemoryBackend();
  if (raw !== undefined) await backend.set('save', JSON.stringify(raw));
  const save = new SaveManager();
  await save.load(backend);
  return { save, wallet: new Wallet(save) };
}

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 4, 11, 10, 0, 0);

describe('save migration v1 → v2 (economy v2)', () => {
  const v1 = {
    version: 1,
    wallet: { icicles: 5400, shards: 333, fish: 41 },
    hoods: { owned: [HOODS[105]!.id, HOODS[0]!.id], equipped: HOODS[105]!.id },
    waddles: { owned: ['classic', 'slate'], selected: 'slate' },
    adventure: { highestUnlocked: 31, stars: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [String(i + 1), 3])), hardStars: {} },
    appliedTx: ['adv:10:N:x'],
  };

  it('keeps every owned Hood (even above new prices), balances, Waddles and progress', async () => {
    const { save } = await setup(v1);
    const s = save.data;
    expect(s.version).toBe(2);
    expect(s.wallet).toEqual({ icicles: 5400, shards: 333, fish: 41 });
    expect(s.hoods.owned).toEqual(v1.hoods.owned);
    expect(s.hoods.equipped).toBe(HOODS[105]!.id);
    expect(s.waddles.selected).toBe('slate');
    expect(s.adventure.highestUnlocked).toBe(31);
    expect(Object.keys(s.adventure.stars).length).toBe(30);
    expect(s.economy).toEqual({ version: 2, migratedFrom: 1 });
  });

  it('marks roadmap chests for milestones v1 already paid as claimed (no double payment)', async () => {
    const { save, wallet } = await setup(v1);
    expect(save.data.adventure.chestsClaimed).toEqual([10, 20, 30]);
    expect(availableRoadmapChests(save.data)).toEqual([]);
    expect(claimRoadmapChest(save, wallet, 10).ok).toBe(false);
  });

  it('new sections get safe defaults; corrupted pet/title data is repaired', () => {
    const s = sanitizeSave({ ...v1, version: 2, pet: { tier: 99, look: 'nope', fedDay: 'garbage', owned: { looks: ['koi', 'bogus'] } }, titles: { unlocked: { fish_courier: 5 }, equipped: 'not_unlocked' } });
    expect(s.pet.tier).toBe(PET_TIERS.length);
    expect(s.pet.look).toBe('classic');
    expect(s.pet.fedDay).toBe('');
    expect(s.pet.owned.looks).toContain('koi');
    expect(s.pet.owned.looks).not.toContain('bogus');
    expect(s.titles.equipped).toBeNull();
    expect(s.titles.unlocked.fish_courier).toBe(5);
  });

  it('fresh profiles start with the documented wallet and v2 Hood prices apply to new purchases', () => {
    const s = defaultSave();
    expect(s.wallet).toEqual({ icicles: 200, shards: 0, fish: 3 });
    for (const h of HOODS) expect(Math.abs(h.price - HOOD_PRICE_BY_RARITY[h.rarityIndex]!)).toBeLessThanOrEqual(HOOD_PRICE_BY_RARITY[h.rarityIndex]! * 0.11 + 5);
  });
});

describe('Adventure roadmap chests', () => {
  it('locked → available → claimed, exactly once (double tap, replay, reload)', async () => {
    const { save, wallet } = await setup();
    expect(roadmapChestState(save.data, 10)).toBe('locked');
    expect(claimRoadmapChest(save, wallet, 10).reason).toBe('locked');
    save.mutate((s) => { s.adventure.stars['10'] = 2; });
    expect(roadmapChestState(save.data, 10)).toBe('available');
    const before = { ...save.data.wallet };
    const first = claimRoadmapChest(save, wallet, 10);
    expect(first.ok).toBe(true);
    const def = roadmapChest(10)!;
    expect(save.data.wallet.icicles).toBe(before.icicles + def.reward.icicles);
    expect(save.data.wallet.fish).toBe(before.fish + def.reward.fish);
    expect(claimRoadmapChest(save, wallet, 10).ok).toBe(false);
    // Replaying the level (stars improve) cannot re-open it.
    save.mutate((s) => { s.adventure.stars['10'] = 5; });
    expect(claimRoadmapChest(save, wallet, 10).ok).toBe(false);
    // Reload from storage.
    await save.flush();
    const raw = JSON.parse(save.exportJson()).data;
    const again = await setup(raw);
    expect(claimRoadmapChest(again.save, again.wallet, 10).ok).toBe(false);
    expect(again.save.data.adventure.chestsClaimed).toEqual([10]);
  });

  it('region chests add their bonus Treasure Chest; non-milestone levels have none', async () => {
    const { save, wallet } = await setup();
    expect(roadmapChest(7)).toBeNull();
    save.mutate((s) => { s.adventure.stars['50'] = 3; });
    const r = claimRoadmapChest(save, wallet, 50);
    expect(r.ok).toBe(true);
    expect(save.data.chests.inventory.minnow).toBe(1);
  });
});

describe('pet goldfish care', () => {
  it('base tier costs exactly 1 Fish; states go notFed → benefitAvailable → benefitGranted', async () => {
    const { save, wallet } = await setup();
    expect(petStatus(save.data, T0).status).toBe('notFed');
    expect(petStatus(save.data, T0).feedCost).toBe(1);
    const fish0 = save.data.wallet.fish;
    const r = feedPet(save, wallet, T0);
    expect(r).toEqual({ ok: true, cost: 1, benefit: PET_TIERS[0]!.dailyShards });
    expect(save.data.wallet.fish).toBe(fish0 - 1);
    expect(petStatus(save.data, T0).status).toBe('benefitAvailable');
    const shards0 = save.data.wallet.shards;
    expect(collectPetBenefit(save, wallet, T0)).toBe(PET_TIERS[0]!.dailyShards);
    expect(save.data.wallet.shards).toBe(shards0 + PET_TIERS[0]!.dailyShards);
    expect(petStatus(save.data, T0).status).toBe('benefitGranted');
  });

  it('never feeds or pays twice in a day (repeated clicks, reload, later the same UTC day)', async () => {
    const { save, wallet } = await setup();
    feedPet(save, wallet, T0);
    expect(feedPet(save, wallet, T0 + 1000)).toEqual({ ok: false, reason: 'alreadyFed' });
    collectPetBenefit(save, wallet, T0);
    expect(collectPetBenefit(save, wallet, T0)).toBe(0);
    const raw = JSON.parse(save.exportJson()).data;
    const again = await setup(raw);
    expect(feedPet(again.save, again.wallet, T0 + 3 * 3600_000)).toEqual({ ok: false, reason: 'alreadyFed' });
    expect(collectPetBenefit(again.save, again.wallet, T0)).toBe(0);
    expect(again.save.data.wallet.fish).toBe(2);
  });

  it('rejects insufficient Fish gracefully and never spends automatically', async () => {
    const { save, wallet } = await setup();
    save.mutate((s) => { s.wallet.fish = 0; });
    expect(feedPet(save, wallet, T0)).toEqual({ ok: false, reason: 'insufficient' });
    expect(save.data.wallet.fish).toBe(0);
    // Days pass with no action: nothing is charged, no debt accrues, no benefit appears.
    const st = petStatus(save.data, T0 + 5 * DAY);
    expect(st.status).toBe('notFed');
    expect(st.pendingBenefit).toBeNull();
    expect(save.data.wallet.fish).toBe(0);
  });

  it('rollover: a new UTC day allows a new feeding; missed days pay nothing retroactively; an uncollected paid day stays collectable', async () => {
    const { save, wallet } = await setup();
    feedPet(save, wallet, T0); // not collected
    const next = T0 + DAY;
    const st = petStatus(save.data, next);
    expect(st.status).toBe('notFed');
    expect(st.pendingBenefit).toEqual({ day: '2026-05-11', shards: PET_TIERS[0]!.dailyShards });
    expect(feedPet(save, wallet, next)).toEqual({ ok: false, reason: 'pendingFirst' });
    expect(collectPetBenefit(save, wallet, next)).toBe(PET_TIERS[0]!.dailyShards);
    expect(feedPet(save, wallet, next).ok).toBe(true);
    collectPetBenefit(save, wallet, next);
    // Skip three days: exactly one feeding/benefit is possible on return.
    const back = next + 4 * DAY;
    expect(petStatus(save.data, back).pendingBenefit).toBeNull();
    expect(feedPet(save, wallet, back).ok).toBe(true);
    expect(save.data.pet.daysFed).toBe(3);
  });

  it('upgrade/feed order: feeding locks the day; upgrading first uses the new cost', async () => {
    const { save, wallet } = await setup();
    save.mutate((s) => { s.wallet.fish = 20; s.wallet.icicles = 100_000; });
    feedPet(save, wallet, T0);
    const up = upgradePet(save, wallet, T0);
    expect(up.ok && up.appliesToday).toBe(false);
    expect(save.data.pet.fedCost).toBe(1);
    expect(collectPetBenefit(save, wallet, T0)).toBe(PET_TIERS[0]!.dailyShards);
    expect(feedPet(save, wallet, T0)).toEqual({ ok: false, reason: 'alreadyFed' });
    const t2 = T0 + DAY;
    expect(petStatus(save.data, t2).feedCost).toBe(PET_TIERS[1]!.feedCost);
    const up2 = upgradePet(save, wallet, t2);
    expect(up2.ok && up2.appliesToday).toBe(true);
    const r = feedPet(save, wallet, t2);
    expect(r).toEqual({ ok: true, cost: PET_TIERS[2]!.feedCost, benefit: PET_TIERS[2]!.dailyShards });
  });

  it('cosmetics: free presets apply, paid ones charge Icicles once, unaffordable ones are refused', async () => {
    const { save, wallet } = await setup();
    expect(choosePetCosmetic(save, wallet, 'tanks', 'igloo')).toBe('applied');
    expect(save.data.pet.tank).toBe('igloo');
    expect(choosePetCosmetic(save, wallet, 'looks', 'aurora')).toBe('insufficient');
    save.mutate((s) => { s.wallet.icicles = 5000; });
    expect(choosePetCosmetic(save, wallet, 'looks', 'koi')).toBe('bought');
    const ic = save.data.wallet.icicles;
    expect(choosePetCosmetic(save, wallet, 'looks', 'classic')).toBe('applied');
    expect(choosePetCosmetic(save, wallet, 'looks', 'koi')).toBe('applied');
    expect(save.data.wallet.icicles).toBe(ic);
  });
});

describe('limited exchanges', () => {
  it('caps trades per UTC period and resets with the period', async () => {
    const { save, wallet } = await setup();
    save.mutate((s) => { s.wallet.icicles = 100_000; });
    const o = EXCHANGE_OFFERS[0]!;
    for (let i = 0; i < o.limit.count; i++) expect(trade(save, wallet, o, T0, `t${i}`)).toBe('ok');
    expect(trade(save, wallet, o, T0, 'tx-over')).toBe('limit');
    expect(trade(save, wallet, o, T0, 't0')).toBe('limit');
    expect(tradesLeft(save.data, o, T0 + DAY)).toBe(o.limit.count);
    expect(trade(save, wallet, o, T0 + DAY, 'next-day')).toBe('ok');
  });
});

describe('earned titles', () => {
  it('backfills progress titles from reliable counters; never backfills timed titles', async () => {
    const stars = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i + 1), i < 30 ? 5 : 3]));
    const { save } = await setup({ version: 1, adventure: { highestUnlocked: 51, stars, hardStars: {} }, bestTimes: { 'adventure|40|c1|g1|N': 3000 } });
    const got = evaluateProgressTitles(save, T0).map((t) => t.id);
    expect(got).toEqual(expect.arrayContaining(['fresh_flippers', 'fish_courier', 'winter_warden', 'five_star_fusspot']));
    expect(got).not.toContain('speed_skater');
    expect(got).not.toContain('igloo_regular');
    // Second evaluation unlocks nothing new and keeps the first unlock time.
    expect(evaluateProgressTitles(save, T0 + 999)).toEqual([]);
    expect(save.data.titles.unlocked.fresh_flippers).toBe(T0);
  });

  it('timed titles require default rules', () => {
    const base: RunConditions = { mode: 'adventure', won: true, level: 45, hard: false, timeMs: 15_000, fishTotal: 2, continued: false, paused: false, modifiers: [], hoodId: null };
    expect(isDefaultRules(base)).toBe(true);
    const statHood = HOODS.find((h) => h.family === 'moveSpeed')!.id;
    const econHood = HOODS.find((h) => h.family === 'icicleEarnings')!.id;
    expect(isDefaultRules({ ...base, hoodId: statHood })).toBe(false);
    expect(isDefaultRules({ ...base, hoodId: econHood })).toBe(true);
    expect(isDefaultRules({ ...base, paused: true })).toBe(false);
    expect(isDefaultRules({ ...base, continued: true })).toBe(false);
    expect(isDefaultRules({ ...base, modifiers: ['glazedIce'] })).toBe(false);
  });

  it('run titles unlock once at the threshold, not below it', async () => {
    const { save } = await setup();
    const c: RunConditions = { mode: 'adventure', won: true, level: 45, hard: false, timeMs: 20_001, fishTotal: 2, continued: false, paused: false, modifiers: [], hoodId: null };
    expect(evaluateRunTitles(save, c, T0)).toEqual([]);
    expect(evaluateRunTitles(save, { ...c, level: 29, timeMs: 10_000 }, T0)).toEqual([]);
    expect(evaluateRunTitles(save, { ...c, timeMs: 20_000 }, T0).map((t) => t.id)).toEqual(['speed_skater']);
    expect(evaluateRunTitles(save, { ...c, timeMs: 5_000 }, T0)).toEqual([]);
  });

  it('only unlocked titles can be equipped; the neutral choice is always available', async () => {
    const { save } = await setup();
    expect(equipTitle(save, 'grand_tour')).toBe(false);
    expect(equipTitle(save, 'made_up_title')).toBe(false);
    save.mutate((s) => { s.titles.unlocked.fish_courier = T0; });
    expect(equipTitle(save, 'fish_courier')).toBe(true);
    expect(equippedTitleName(save.data)).toBe('Fish Courier');
    expect(equipTitle(save, null)).toBe(true);
    expect(equippedTitleName(save.data)).toBeNull();
    expect(TITLES.length).toBeGreaterThanOrEqual(12);
  });
});
