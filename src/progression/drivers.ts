/**
 * Play drivers — mode-specific behaviour around one level: labels, best-time
 * keys, rewards, unlocks, "next level" and where Leave goes. The Play screen
 * is mode-agnostic and only talks to this interface.
 */
import type { MusicSlot } from '../config/audio';
import { CHEST_TIERS, LEVEL_REWARDS, type ChestTierId } from '../config/economy';
import { REGION_BY_ID, ADVENTURE_LEVEL_COUNT, LEVELS_PER_REGION } from '../config/regions';
import type { Reward, Wallet } from '../economy/wallet';
import { adventureLevel } from '../levels/adventure';
import { DAILY_LEVELS, dailyCycleId, dailyLevel, LEVELS_PER_MILESTONE, milestoneOf, utcDateKey } from '../levels/daily';
import { encodeSeed, infiniteLevel, nextSeed, type InfiniteSeed } from '../levels/infinite';
import type { GameMode, LevelDef } from '../levels/types';
import type { QuestService } from '../quests/quests';
import { bestTimeKey, type SaveData } from '../save/schema';
import type { SaveManager } from '../save/saveManager';
import { economyBonus, HOOD_BY_ID, HOODS } from './hoods';
import { addStats, computeStars, recordBest, trackQuests, type ResultSummary, type RunOutcome } from './results';
import { Rng } from '../core/rng';

export interface DriverServices {
  save: SaveManager;
  wallet: Wallet;
  quests: QuestService;
  now: () => number;
}

export interface PlayDriver {
  mode: GameMode;
  level: LevelDef;
  hard: boolean;
  /** "LEVEL 127", "DAILY 7/40", "INFINITE 12". */
  label: string;
  sublabel: string;
  bestKey: string;
  seedCode: string | null;
  allowContinue: boolean;
  /** Ranked rules: Hood stat bonuses disabled (cosmetic only). */
  normalized: boolean;
  musicSlot: MusicSlot;
  complete(o: RunOutcome): ResultSummary;
  failed(o: RunOutcome): void;
  next(): PlayDriver | null;
  retry(): PlayDriver;
  exit: { screen: string; params?: Record<string, unknown> };
}

function econ(s: SaveData) {
  const h = s.hoods.equipped;
  return {
    icicles: economyBonus(h, 'icicleEarnings') * economyBonus(h, 'generalUtility'),
    shards: economyBonus(h, 'shardEarnings') * economyBonus(h, 'generalUtility'),
    star: economyBonus(h, 'excellenceBonus'),
    hard: economyBonus(h, 'hardModeRewards'),
    adventure: economyBonus(h, 'adventureUtility'),
    infinite: economyBonus(h, 'infiniteUtility'),
    daily: economyBonus(h, 'dailyUtility'),
  };
}

function hardify(icicles: number, hard: boolean, hardBonus: number): number {
  return hard ? icicles + icicles * (LEVEL_REWARDS.hardMultiplier - 1) * hardBonus : icicles;
}

// ------------------------------------------------------------------ adventure

export function adventureDriver(svc: DriverServices, n: number, hard: boolean): PlayDriver {
  const level = adventureLevel(n, hard);
  const region = REGION_BY_ID[level.region];
  const bestKey = bestTimeKey({ mode: 'adventure', levelKey: String(n), contentVersion: level.contentVersion, generatorVersion: level.generatorVersion, hard });
  return {
    mode: 'adventure', level, hard, bestKey, seedCode: null, allowContinue: true, normalized: false,
    label: `LEVEL ${n}`,
    sublabel: `${region.name}${hard ? ' · HARD' : ''}`,
    musicSlot: region.musicSlot as MusicSlot,
    exit: { screen: 'adventure', params: { region: region.id, focus: n } },
    retry: () => adventureDriver(svc, n, hard),
    next: () => (n < ADVENTURE_LEVEL_COUNT && svc.save.data.adventure.highestUnlocked > n ? adventureDriver(svc, n + 1, hard) : null),
    failed: (o) => {
      svc.save.mutate((s) => addStats(s, o, false, 0));
      trackQuests(svc.quests, o, false, 0, { mode: 'adventure', hard });
    },
    complete: (o) => {
      const s = svc.save.data;
      const stars = computeStars(o.timeMs, level.parSeconds, o.stats.fishEaten, o.continued);
      const starTable = hard ? s.adventure.hardStars : s.adventure.stars;
      const prevStars = starTable[String(n)] ?? 0;
      const firstClear = prevStars === 0;
      const e = econ(s);
      const r = LEVEL_REWARDS.adventure;
      let ic = r.base + level.difficulty * r.perDifficulty;
      if (!firstClear && stars <= prevStars) ic *= LEVEL_REWARDS.repeatFactor;
      ic += Math.max(0, stars - (firstClear ? 0 : prevStars)) * r.perStar * e.star;
      if (firstClear) ic += r.firstClearBonus;
      ic += o.stats.rareStashed * LEVEL_REWARDS.rareFishBonusIcicles;
      ic = hardify(ic, hard, e.hard) * e.icicles * e.adventure;
      const reward: Reward = { icicles: Math.round(ic) };
      const notes: string[] = [];
      if (firstClear && n % 10 === 0) { reward.shards = Math.round(10 * e.shards); notes.push('Milestone level! +Icicle Shards'); }
      if (firstClear && n % LEVELS_PER_REGION === 0) {
        reward.shards = (reward.shards ?? 0) + Math.round(50 * e.shards);
        reward.fish = 10;
        notes.push(`${region.name} conquered!`);
      }
      let previousBestMs: number | null = null;
      let newBest = false;
      svc.wallet.grant(`adv:${n}:${hard ? 'H' : 'N'}:${o.runId}`, reward, (st) => {
        const b = recordBest(st, bestKey, o.timeMs);
        previousBestMs = b.previous;
        newBest = b.improved;
        const table = hard ? st.adventure.hardStars : st.adventure.stars;
        table[String(n)] = Math.max(table[String(n)] ?? 0, stars);
        if (!hard && n + 1 > st.adventure.highestUnlocked && n < ADVENTURE_LEVEL_COUNT) {
          st.adventure.highestUnlocked = n + 1;
          if ((n + 1) % LEVELS_PER_REGION === 1) notes.push(`New region unlocked: ${REGION_BY_ID[adventureLevel(n + 1).region].name}!`);
          else notes.push(`Level ${n + 1} unlocked`);
        }
        addStats(st, o, true, stars);
      });
      trackQuests(svc.quests, o, true, stars, { mode: 'adventure', hard });
      return { stars, timeMs: o.timeMs, previousBestMs, newBest, parSeconds: level.parSeconds, rewards: reward, firstClear, notes };
    },
  };
}

// ------------------------------------------------------------------ daily

export interface MilestoneReward {
  index: number;
  label: string;
  reward: Reward;
  chest?: ChestTierId;
  hoodId?: string;
}

/** Specific, visible-before-earning rewards for each of the 8 Popsicles. Level 40 is the strongest. */
export function dailyMilestoneRewards(dateKey: string): MilestoneReward[] {
  const rng = new Rng(`daily-rewards:${dateKey}`);
  const hoodPool = HOODS.filter((h) => h.rarityIndex >= 3 && h.rarityIndex <= 5);
  const hood = rng.pick(hoodPool);
  return [
    { index: 1, label: '150 Icicles', reward: { icicles: 150 } },
    { index: 2, label: '20 Icicle Shards', reward: { shards: 20 } },
    { index: 3, label: '300 Icicles + 8 Fish', reward: { icicles: 300, fish: 8 } },
    { index: 4, label: '45 Icicle Shards', reward: { shards: 45 } },
    { index: 5, label: '500 Icicles + 15 Fish', reward: { icicles: 500, fish: 15 } },
    { index: 6, label: 'Minnow Crate', reward: {}, chest: 'minnow' },
    { index: 7, label: `Hood: ${hood.name}`, reward: { hoods: [hood.id] }, hoodId: hood.id },
    { index: 8, label: '1,000 Icicles + 100 Shards + 40 Fish + Mackerel Chest', reward: { icicles: 1000, shards: 100, fish: 40 }, chest: 'mackerel' },
  ];
}

/** Resets local daily progress when the shared cycle changes (and records the max observed clock). */
export function syncDailyCycle(svc: DriverServices): { cycleId: string; dateKey: string; clockRolledBack: boolean } {
  const now = svc.now();
  const cycleId = dailyCycleId(now);
  const s = svc.save.data;
  const rolledBack = now + 5 * 60 * 1000 < s.daily.maxObservedTime;
  if (s.daily.cycleId !== cycleId || now > s.daily.maxObservedTime) {
    svc.save.mutate((st) => {
      if (st.daily.cycleId !== cycleId) {
        st.daily.cycleId = cycleId;
        st.daily.completed = [];
        st.daily.completedHard = [];
        st.daily.claimed = [];
      }
      st.daily.maxObservedTime = Math.max(st.daily.maxObservedTime, now);
    });
  }
  return { cycleId, dateKey: utcDateKey(now), clockRolledBack: rolledBack };
}

export function dailyDriver(svc: DriverServices, index: number, hard: boolean): PlayDriver {
  const { cycleId, dateKey } = syncDailyCycle(svc);
  const level = dailyLevel(dateKey, index, hard);
  const region = REGION_BY_ID[level.region];
  const bestKey = bestTimeKey({ mode: 'daily', levelKey: `${dateKey}:${index}`, contentVersion: level.contentVersion, generatorVersion: level.generatorVersion, hard });
  return {
    mode: 'daily', level, hard, bestKey, seedCode: null, allowContinue: true, normalized: false,
    label: `DAILY ${index} / ${DAILY_LEVELS}`,
    sublabel: `Popsicle ${milestoneOf(index)} · ${region.name}${hard ? ' · HARD' : ''}`,
    musicSlot: 'daily',
    exit: { screen: 'daily' },
    retry: () => dailyDriver(svc, index, hard),
    next: () => (index < DAILY_LEVELS ? dailyDriver(svc, index + 1, hard) : null),
    failed: (o) => {
      svc.save.mutate((s) => addStats(s, o, false, 0));
      trackQuests(svc.quests, o, false, 0, { mode: 'daily', hard });
    },
    complete: (o) => {
      // An attempt that started before rollover still counts for the cycle it was played in.
      const s = svc.save.data;
      const stars = computeStars(o.timeMs, level.parSeconds, o.stats.fishEaten, o.continued);
      const e = econ(s);
      const r = LEVEL_REWARDS.daily;
      let ic = (r.base + level.difficulty * r.perDifficulty + stars * r.perStar * e.star) * e.daily;
      ic = hardify(ic, hard, e.hard) * e.icicles;
      const reward: Reward = { icicles: Math.round(ic) };
      let previousBestMs: number | null = null;
      let newBest = false;
      const notes: string[] = [];
      const already = (hard ? s.daily.completedHard : s.daily.completed).includes(index);
      svc.wallet.grant(`daily:${cycleId}:${index}:${hard ? 'H' : 'N'}:${o.runId}`, already ? { icicles: Math.round((reward.icicles ?? 0) * 0.3) } : reward, (st) => {
        const b = recordBest(st, bestKey, o.timeMs);
        previousBestMs = b.previous;
        newBest = b.improved;
        if (st.daily.cycleId === cycleId) {
          const list = hard ? st.daily.completedHard : st.daily.completed;
          if (!list.includes(index)) list.push(index);
        }
        addStats(st, o, true, stars);
      });
      if (already) reward.icicles = Math.round((reward.icicles ?? 0) * 0.3);
      trackQuests(svc.quests, o, true, stars, { mode: 'daily', hard });
      // Milestone (Popsicle) check — idempotent per cycle.
      const m = milestoneOf(index);
      const done = new Set([...svc.save.data.daily.completed, ...svc.save.data.daily.completedHard]);
      let milestone: ResultSummary['milestone'];
      const allDone = Array.from({ length: LEVELS_PER_MILESTONE }, (_, k) => (m - 1) * LEVELS_PER_MILESTONE + k + 1).every((i) => done.has(i));
      if (allDone && !svc.save.data.daily.claimed.includes(m) && svc.save.data.daily.cycleId === cycleId) {
        const mr = dailyMilestoneRewards(dateKey)[m - 1]!;
        const grant: Reward = { ...mr.reward };
        if (mr.hoodId && svc.save.data.hoods.owned.includes(mr.hoodId)) {
          grant.hoods = [];
          grant.shards = (grant.shards ?? 0) + (HOOD_BY_ID[mr.hoodId]?.price ?? 100);
        }
        const applied = svc.wallet.grant(`daily:${cycleId}:milestone:${m}`, grant, (st) => {
          if (!st.daily.claimed.includes(m)) st.daily.claimed.push(m);
          if (mr.chest) st.chests.inventory[mr.chest] = (st.chests.inventory[mr.chest] ?? 0) + 1;
        });
        if (applied) {
          milestone = { index: m, reward: grant, label: mr.label };
          notes.push(`Popsicle ${m} complete!`);
          if (mr.chest) notes.push(`${CHEST_TIERS.find((c) => c.id === mr.chest)!.name} added to your Treasure`);
        }
      }
      return { stars, timeMs: o.timeMs, previousBestMs, newBest, parSeconds: level.parSeconds, rewards: reward, firstClear: !already, notes, ...(milestone ? { milestone } : {}) };
    },
  };
}

// ------------------------------------------------------------------ infinite

export function infiniteDriver(svc: DriverServices, seed: InfiniteSeed, hard: boolean): PlayDriver {
  const level = infiniteLevel(seed, hard);
  const code = encodeSeed(seed);
  const bestKey = bestTimeKey({ mode: 'infinite', levelKey: code, contentVersion: level.contentVersion, generatorVersion: level.generatorVersion, hard });
  const remember = (bestMs: number | null) => svc.save.mutate((s) => {
    const list = s.infinite.history.filter((h) => !(h.code === code && h.hard === hard));
    const prev = s.infinite.history.find((h) => h.code === code && h.hard === hard);
    const best = bestMs === null ? prev?.bestMs ?? null : prev?.bestMs ? Math.min(prev.bestMs, bestMs) : bestMs;
    list.push({ code, level: seed.level, hard, bestMs: best, playedAt: svc.now(), contentVersion: level.contentVersion, generatorVersion: level.generatorVersion });
    s.infinite.history = list.slice(-60);
  });
  return {
    mode: 'infinite', level, hard, bestKey, seedCode: code, allowContinue: true, normalized: false,
    label: `INFINITE ${seed.level}`,
    sublabel: `${REGION_BY_ID[level.region].name}${hard ? ' · HARD' : ''}`,
    musicSlot: 'infinite',
    exit: { screen: 'infinite' },
    retry: () => infiniteDriver(svc, seed, hard),
    next: () => infiniteDriver(svc, nextSeed(seed), hard),
    failed: (o) => {
      remember(null);
      svc.save.mutate((s) => addStats(s, o, false, 0));
      trackQuests(svc.quests, o, false, 0, { mode: 'infinite', hard });
    },
    complete: (o) => {
      const s = svc.save.data;
      const stars = computeStars(o.timeMs, level.parSeconds, o.stats.fishEaten, o.continued);
      const e = econ(s);
      const r = LEVEL_REWARDS.infinite;
      let ic = Math.min(r.maxBase, r.base + seed.level * r.perLevel) + stars * r.perStar * e.star;
      ic = hardify(ic, hard, e.hard) * e.icicles * e.infinite;
      const reward: Reward = { icicles: Math.round(ic) };
      let previousBestMs: number | null = null;
      let newBest = false;
      const notes: string[] = [];
      svc.wallet.grant(`inf:${code}:${hard ? 'H' : 'N'}:${o.runId}`, reward, (st) => {
        const b = recordBest(st, bestKey, o.timeMs);
        previousBestMs = b.previous;
        newBest = b.improved;
        if (hard) {
          if (seed.level > st.infinite.highestLevelHard) { st.infinite.highestLevelHard = seed.level; notes.push('New Hard Mode record!'); }
        } else if (seed.level > st.infinite.highestLevel) { st.infinite.highestLevel = seed.level; notes.push('New Infinite record!'); }
        addStats(st, o, true, stars);
      });
      remember(o.timeMs);
      trackQuests(svc.quests, o, true, stars, { mode: 'infinite', hard });
      return { stars, timeMs: o.timeMs, previousBestMs, newBest, parSeconds: level.parSeconds, rewards: reward, firstClear: previousBestMs === null, notes };
    },
  };
}

// ------------------------------------------------------------------ ranked practice (offline)

/**
 * Offline PRACTICE under Ranked rules (same-seed layout, normalized stats).
 * Clearly labelled practice: no opponent, no rankings, no ranked rewards.
 */
export function practiceDriver(svc: DriverServices, seed: InfiniteSeed): PlayDriver {
  const level = { ...infiniteLevel(seed, false, true), mode: 'practice' as const };
  const code = encodeSeed(seed);
  const bestKey = bestTimeKey({ mode: 'practice', levelKey: code, contentVersion: level.contentVersion, generatorVersion: level.generatorVersion, hard: false, normalized: true });
  return {
    mode: 'practice', level, hard: false, bestKey, seedCode: code, allowContinue: true, normalized: true,
    label: 'PRACTICE',
    sublabel: 'Ranked rules · offline · not ranked',
    musicSlot: 'ranked',
    exit: { screen: 'ranked' },
    retry: () => practiceDriver(svc, seed),
    next: () => practiceDriver(svc, nextSeed(seed)),
    failed: (o) => { svc.save.mutate((s) => addStats(s, o, false, 0)); },
    complete: (o) => {
      const stars = computeStars(o.timeMs, level.parSeconds, o.stats.fishEaten, o.continued);
      let previousBestMs: number | null = null;
      let newBest = false;
      svc.save.mutate((st) => {
        const b = recordBest(st, bestKey, o.timeMs);
        previousBestMs = b.previous;
        newBest = b.improved;
        addStats(st, o, true, stars);
      });
      return { stars, timeMs: o.timeMs, previousBestMs, newBest, parSeconds: level.parSeconds, rewards: {}, firstClear: false, notes: ['Practice runs never award ranked rewards.'] };
    },
  };
}
