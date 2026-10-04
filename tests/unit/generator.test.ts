import { describe, expect, it } from 'vitest';
import { adventureLevel } from '../../src/levels/adventure';
import { dailyCycleId, dailyLevel, msUntilReset, utcDateKey } from '../../src/levels/daily';
import { decodeSeed, encodeSeed, infiniteLevel, nextSeed, normalizeSeedInput } from '../../src/levels/infinite';
import { validateLevel } from '../../src/procedural/validate';
import { ADVENTURE_LEVEL_COUNT, regionForAdventureLevel } from '../../src/config/regions';
import { knobs } from '../../src/procedural/difficulty';

describe('Adventure generation', () => {
  it('has exactly 800 levels across 16 regions of 50', () => {
    expect(ADVENTURE_LEVEL_COUNT).toBe(800);
    expect(regionForAdventureLevel(1).id).toBe('classic_winter');
    expect(regionForAdventureLevel(50).id).toBe('classic_winter');
    expect(regionForAdventureLevel(51).id).toBe('snow_forest');
    expect(regionForAdventureLevel(800).id).toBe('mastery');
  });

  it('is deterministic for the same level number', () => {
    const a = JSON.stringify(adventureLevel(137));
    const b = JSON.stringify(adventureLevel(137));
    expect(a).toBe(b);
  });

  it('every Adventure level validates at real collider sizes (and few need the fallback)', () => {
    let fallbacks = 0;
    const t0 = performance.now();
    for (let n = 1; n <= ADVENTURE_LEVEL_COUNT; n++) {
      const lvl = adventureLevel(n);
      const v = validateLevel(lvl);
      if (!v.ok) throw new Error(`level ${n} invalid: ${v.problems.join('; ')}`);
      if (lvl.seed.endsWith('#fallback')) fallbacks++;
      expect(lvl.fish.length).toBeGreaterThanOrEqual(lvl.fishRequired);
      expect(lvl.parSeconds).toBeGreaterThan(0);
    }
    const ms = performance.now() - t0;
    console.log(`[gen] 800 adventure levels in ${ms.toFixed(0)} ms (${(ms / 800).toFixed(1)} ms/level), fallbacks: ${fallbacks}`);
    expect(fallbacks).toBeLessThan(40);
  }, 120_000);

  it('difficulty rises through the campaign (more fish, enemies, obstacles)', () => {
    const early = adventureLevel(12), late = adventureLevel(780);
    expect(late.fish.length).toBeGreaterThan(early.fish.length);
    expect(late.enemies.length).toBeGreaterThan(early.enemies.length);
    expect(late.arena.width * late.arena.height).toBeGreaterThan(early.arena.width * early.arena.height);
  });

  it('maps are varied (not 800 copies of one rectangle)', () => {
    const sizes = new Set<string>();
    const stashes = new Set<string>();
    for (let n = 100; n < 160; n++) {
      const l = adventureLevel(n);
      sizes.add(`${l.arena.width}x${l.arena.height}`);
      stashes.add(`${Math.round(l.stash.x / 100)}:${Math.round(l.stash.y / 100)}`);
    }
    expect(sizes.size).toBeGreaterThan(15);
    expect(stashes.size).toBeGreaterThan(6);
  });

  it('tutorial levels teach without enemies first', () => {
    expect(adventureLevel(1).enemies.length).toBe(0);
    expect(adventureLevel(1).tutorial?.teaches).toBe('movement');
    expect(adventureLevel(6).enemies.length).toBe(1);
  });
});

describe('Infinite seeds', () => {
  it('round-trips seed codes and tolerates sloppy input', () => {
    const s = { level: 127, layout: 0xdeadbeef };
    const code = encodeSeed(s);
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{4}$/);
    expect(decodeSeed(code)).toEqual(s);
    expect(decodeSeed(code.toLowerCase().replace('-', ' '))).toEqual(s);
    const big = { level: 9000, layout: 42 };
    expect(decodeSeed(encodeSeed(big))).toEqual(big);
    expect(decodeSeed('not-a-seed')).toBeNull();
    expect(normalizeSeedInput('fr0st-8k2m')).toBe('FR0ST-8K2M');
  });

  it('same code → identical level; next level derives deterministically', () => {
    const s = { level: 40, layout: 123456 };
    expect(JSON.stringify(infiniteLevel(s))).toBe(JSON.stringify(infiniteLevel(decodeSeed(encodeSeed(s))!)));
    expect(nextSeed(s)).toEqual(nextSeed(s));
  });

  it('keeps generating valid levels far past the Adventure ceiling with bounded entity counts', () => {
    for (const level of [1, 50, 120, 300, 800, 2500]) {
      const lvl = infiniteLevel({ level, layout: 777 + level });
      expect(validateLevel(lvl).ok).toBe(true);
      expect(lvl.enemies.length).toBeLessThanOrEqual(6);
      expect(lvl.fish.length).toBeLessThanOrEqual(8);
      expect(lvl.obstacles.length).toBeLessThanOrEqual(14);
    }
    // Difficulty keeps rising even when counts are capped.
    expect(knobs(500, false).enemySpeed).toBeGreaterThan(knobs(120, false).enemySpeed);
  });
});

describe('Daily challenge', () => {
  it('uses a shared UTC cycle id with versions and a correct countdown', () => {
    const t = Date.UTC(2026, 9, 2, 23, 30, 0);
    expect(utcDateKey(t)).toBe('2026-10-02');
    expect(dailyCycleId(t)).toMatch(/^daily-2026-10-02-c\d+-g\d+$/);
    expect(msUntilReset(t)).toBe(30 * 60 * 1000);
  });

  it('generates 40 valid levels, identical for everyone on the same date', () => {
    for (let i = 1; i <= 40; i++) {
      const a = dailyLevel('2026-10-02', i);
      expect(validateLevel(a).ok).toBe(true);
      if (i % 10 === 0) expect(JSON.stringify(a)).toBe(JSON.stringify(dailyLevel('2026-10-02', i)));
    }
    expect(JSON.stringify(dailyLevel('2026-10-02', 3))).not.toBe(JSON.stringify(dailyLevel('2026-10-03', 3)));
  }, 60_000);
});

describe('Arena shapes and level modifiers (generator v2)', () => {
  it('uses several arena shapes across the campaign, plain rinks early', async () => {
    const shapes = new Map<string, number>();
    for (let n = 1; n <= 800; n += 3) {
      const s = adventureLevel(n).arena.shape ?? 'rect';
      shapes.set(s, (shapes.get(s) ?? 0) + 1);
    }
    expect(shapes.size).toBeGreaterThanOrEqual(6);
    for (const n of [1, 2, 3]) expect(['rect', 'cove']).toContain(adventureLevel(n).arena.shape ?? 'rect');
  }, 60_000);

  it('modifiers: none on teaching levels or region openers; some later; deterministic', async () => {
    const { LEVEL_MODIFIER_IDS, compatible } = await import('../../src/gameplay/levelModifiers');
    for (let n = 1; n <= 30; n++) expect(adventureLevel(n).modifiers).toEqual([]);
    for (const n of [51, 52, 53, 101, 151]) expect(adventureLevel(n).modifiers).toEqual([]);
    let withMods = 0;
    for (let n = 31; n <= 800; n += 2) {
      const m = adventureLevel(n).modifiers;
      if (m.length) withMods++;
      for (const id of m) expect(LEVEL_MODIFIER_IDS).toContain(id);
      if (m.length === 2) expect(compatible(m[0]!, m[1]!)).toBe(true);
    }
    expect(withMods).toBeGreaterThan(40);
    expect(withMods).toBeLessThan(200);
    expect(adventureLevel(222).modifiers).toEqual(adventureLevel(222).modifiers);
  }, 60_000);

  it('normalized (Ranked/Practice) levels never carry modifiers', () => {
    for (let lv = 1; lv <= 60; lv++) {
      const l = infiniteLevel({ layout: 48211 + lv * 7, level: lv }, false, true);
      expect(l.modifiers).toEqual([]);
      expect(l.id.startsWith('rk-')).toBe(true);
    }
  });

  it('reward bonus is capped however modifiers combine', async () => {
    const { rewardBonus, MAX_REWARD_BONUS, LEVEL_MODIFIER_IDS } = await import('../../src/gameplay/levelModifiers');
    expect(rewardBonus(LEVEL_MODIFIER_IDS)).toBe(MAX_REWARD_BONUS);
    expect(rewardBonus([])).toBe(0);
    expect(rewardBonus(['luckyCatch'])).toBeLessThanOrEqual(MAX_REWARD_BONUS);
  });
});
