import { describe, expect, it } from 'vitest';
import { CHEST_TIERS } from '../../src/config/economy';
import { rollChest } from '../../src/economy/chests';
import { Wallet } from '../../src/economy/wallet';
import { HOODS, RARITIES, gameplayModifiers } from '../../src/progression/hoods';
import { periodKeys, QuestService, TUTORIAL_QUESTS } from '../../src/quests/quests';
import { defaultSave, sanitizeSave } from '../../src/save/schema';
import { SaveManager } from '../../src/save/saveManager';
import { MemoryBackend, openBestBackend } from '../../src/save/storage';
import { validateUsername } from '../../src/profile/username';
import { bestOfThree, percentageDifference } from '../../src/services/ranked';
import { NORMALIZED_MODIFIERS } from '../../src/gameplay/modifiers';

async function freshSave(): Promise<SaveManager> {
  const s = new SaveManager();
  await s.load(new MemoryBackend());
  return s;
}

describe('Wallet transactions', () => {
  it('grants exactly once per transaction id (duplicate reward callbacks never double-pay)', async () => {
    const save = await freshSave();
    const w = new Wallet(save);
    const start = w.balance('fish');
    expect(w.grant('fishing:reward-1', { fish: 10 })).toBe(true);
    expect(w.grant('fishing:reward-1', { fish: 10 })).toBe(false);
    expect(w.balance('fish')).toBe(start + 10);
  });

  it('never spends below zero and applies nothing when unaffordable', async () => {
    const save = await freshSave();
    const w = new Wallet(save);
    expect(w.balance('icicles')).toBe(200);
    expect(w.spend('continue:a', { icicles: 800 })).toBe(false);
    expect(w.balance('icicles')).toBe(200);
    expect(w.spend('waddle:x', { icicles: 150 }, (s) => s.waddles.owned.push('slate'))).toBe(true);
    expect(w.balance('icicles')).toBe(50);
    expect(save.data.waddles.owned).toContain('slate');
    expect(w.spend('waddle:x', { icicles: 10 })).toBe(false); // same tx id
  });

  it('exchange pays and rewards atomically, once', async () => {
    const save = await freshSave();
    const w = new Wallet(save);
    w.grant('seed', { fish: 100 });
    const before = w.balance('fish');
    const roll = rollChest('mackerel', 'chest:mackerel:t1', save.data.hoods.owned);
    expect(w.exchange('chest:mackerel:t1', { fish: 100 }, roll.reward)).toBe(true);
    expect(w.balance('fish')).toBe(before - 100 + (roll.reward.fish ?? 0));
    expect(w.exchange('chest:mackerel:t1', { fish: 100 }, roll.reward)).toBe(false);
    for (const id of roll.reward.hoods ?? []) expect(save.data.hoods.owned).toContain(id);
  });
});

describe('Treasure chests', () => {
  it('has five tiers priced 25/100/225/400/625 Fish', () => {
    expect(CHEST_TIERS.map((c) => c.price)).toEqual([25, 100, 225, 400, 625]);
  });

  it('rolls are deterministic per transaction id and scale with tier', () => {
    const a = rollChest('tuna', 'tx-42', []);
    const b = rollChest('tuna', 'tx-42', []);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(rollChest('minnow', 'x', []).items).toHaveLength(2);
    expect(rollChest('leviathan', 'x', []).items).toHaveLength(6);
    // Leviathan always includes a Hood roll from the top rarities (or its duplicate value).
    const lev = rollChest('leviathan', 'tx-7', []);
    const hoodItem = lev.items.find((i) => i.kind === 'hood' || i.kind === 'duplicate');
    expect(hoodItem?.hood?.rarityIndex).toBeGreaterThanOrEqual(6);
  });

  it('converts duplicate Hoods to Icicle Shards instead of granting them twice', () => {
    const owned = HOODS.map((h) => h.id);
    for (let i = 0; i < 30; i++) {
      const r = rollChest('emperor', `dup-${i}`, owned);
      expect(r.reward.hoods ?? []).toHaveLength(0);
    }
  });
});

describe('Hoods', () => {
  it('has 200 Hoods: 10 rarities × 20', () => {
    expect(HOODS).toHaveLength(200);
    for (const r of RARITIES) expect(HOODS.filter((h) => h.rarity === r.id)).toHaveLength(20);
  });

  it('are cosmetic only under normalized (Ranked) rules', () => {
    const strongest = HOODS[HOODS.length - 1]!;
    expect(gameplayModifiers(strongest.id, true)).toEqual(NORMALIZED_MODIFIERS);
    expect(gameplayModifiers(strongest.id, false)).not.toEqual(NORMALIZED_MODIFIERS);
  });
});

describe('Quests', () => {
  it('claims once, only when complete, and rotates by UTC period', async () => {
    const save = await freshSave();
    const w = new Wallet(save);
    let now = Date.UTC(2026, 9, 2, 12);
    const q = new QuestService(save, w, () => now);
    q.refresh();
    const move = TUTORIAL_QUESTS[0]!;
    expect(q.claim(move.id)).toBeNull();
    q.track(move.metric, move.target);
    const before = w.balance('icicles');
    expect(q.claim(move.id)).not.toBeNull();
    expect(q.claim(move.id)).toBeNull();
    expect(w.balance('icicles')).toBe(before + (move.reward.icicles ?? 0));
    const daily = save.data.quests.active.daily.slice();
    expect(daily).toHaveLength(3);
    now = Date.UTC(2026, 9, 3, 0, 0, 1);
    q.refresh();
    expect(save.data.quests.periods.daily).toBe('2026-10-03');
  });

  it('uses ISO weeks for weekly quests', () => {
    expect(periodKeys(Date.UTC(2026, 0, 1)).weekly).toBe('2026-W01');
    expect(periodKeys(Date.UTC(2027, 0, 1)).weekly).toBe('2026-W53');
  });
});

describe('Save data', () => {
  it('sanitizes hostile or corrupted input into a complete valid save', () => {
    const s = sanitizeSave({ wallet: { icicles: -50, shards: 'lots', fish: 1e20 }, hoods: { owned: ['a'], equipped: 'b' }, profile: { username: '<script>' }, version: 999 });
    expect(s.wallet.icicles).toBe(0);
    expect(s.wallet.shards).toBe(0);
    expect(s.wallet.fish).toBe(1_000_000_000);
    expect(s.hoods.equipped).toBeNull(); // not owned
    expect(s.profile.username).toBe('script');
    expect(sanitizeSave('garbage')).toEqual(expect.objectContaining({ wallet: defaultSave().wallet }));
  });

  it('round-trips export → import and rejects foreign files', async () => {
    const a = await freshSave();
    a.mutate((s) => { s.profile.username = 'Pebble'; s.wallet.shards = 77; });
    const json = a.exportJson();
    const b = await freshSave();
    await b.importJson(json);
    expect(b.data.profile.username).toBe('Pebble');
    expect(b.data.wallet.shards).toBe(77);
    await expect(b.importJson('{"hello":1}')).rejects.toThrow('not a Slippery Fish save');
  });

  it('falls back to in-memory storage when the browser offers none', async () => {
    const backend = await openBestBackend();
    expect(backend.kind).toBe('memory'); // Node has neither IndexedDB nor localStorage
    const s = new SaveManager();
    await s.load(backend);
    expect(s.storageKind).toBe('memory');
  });

  it('erasing the local save restores defaults', async () => {
    const a = await freshSave();
    a.mutate((s) => { s.wallet.icicles = 5000; });
    await a.resetLocal();
    expect(a.data.wallet.icicles).toBe(200);
  });
});

describe('Usernames', () => {
  it('validates length, characters and blocked words', () => {
    expect(validateUsername('Pebble').ok).toBe(true);
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('x'.repeat(17)).ok).toBe(false);
    expect(validateUsername('<b>hi</b>').ok).toBe(false);
    expect(validateUsername('Official Admin').ok).toBe(false);
  });
});

describe('Ranked helpers', () => {
  it('percentage difference handles invalid input', () => {
    expect(percentageDifference(10_000, 12_500)).toBeCloseTo(20);
    expect(percentageDifference(0, 1000)).toBeNull();
    expect(percentageDifference(Number.NaN, 1000)).toBeNull();
  });

  it('best of three: first to two round wins, raw times never summed', () => {
    expect(bestOfThree(['A', 'A'])).toEqual({ a: 2, b: 0, winner: 'A' });
    expect(bestOfThree(['A', 'B', 'tie', 'B'])).toEqual({ a: 1, b: 2, winner: 'B' });
    expect(bestOfThree(['A']).winner).toBeNull();
  });
});
