/**
 * Versioned save schema + validation + migrations.
 *
 * Every load passes through `sanitizeSave`, which accepts anything (old
 * versions, hand-edited exports, corrupted JSON fragments) and returns a
 * complete, type-correct SaveData. Local saves are convenience storage, never
 * an anti-cheat authority.
 */
import { SAVE_VERSION } from '../config/versions';

export interface SeedHistoryEntry {
  code: string;
  level: number;
  hard: boolean;
  bestMs: number | null;
  playedAt: number;
  contentVersion: number;
  generatorVersion: number;
}

export type ConsentState = 'unknown' | 'granted' | 'denied' | 'notRequired';

export interface StatsData {
  fishStashed: number;
  fishEaten: number;
  distanceWaddled: number;
  timesOutmatched: number;
  fiveStarLevels: number;
  rankedVictories: number;
  wallBounces: number;
  sprintSeconds: number;
  levelsCompleted: number;
  chestsOpened: number;
  sprintHits: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  profile: { username: string; iconId: string; createdAt: number };
  wallet: { icicles: number; shards: number; fish: number };
  /** Recently applied transaction ids, newest last (idempotency guard). */
  appliedTx: string[];
  waddles: { owned: string[]; selected: string };
  hoods: { owned: string[]; equipped: string | null };
  adventure: {
    /** Highest level the player may start (1-based). */
    highestUnlocked: number;
    stars: Record<string, number>;
    hardStars: Record<string, number>;
  };
  /** Keyed by bestTimeKey(); values in ms. */
  bestTimes: Record<string, number>;
  infinite: { highestLevel: number; highestLevelHard: number; history: SeedHistoryEntry[] };
  daily: {
    cycleId: string;
    completed: number[];
    completedHard: number[];
    claimed: number[];
    /** Largest wall-clock time ever observed (ms) — rollback detection (not security). */
    maxObservedTime: number;
  };
  quests: {
    progress: Record<string, number>;
    claimed: Record<string, true>;
    periods: { daily: string; weekly: string; monthly: string };
    active: { daily: string[]; weekly: string[]; monthly: string[] };
  };
  chests: { adChestReadyAt: number; opened: Record<string, number>; inventory: Record<string, number> };
  stats: StatsData;
  ranked: { localPracticeWins: number; localPracticeLosses: number };
  tutorial: { seenHints: string[] };
  privacy: { consent: ConsentState; updatedAt: number; policyVersionSeen: string | null };
}

export const DEFAULT_USERNAME = 'Waddler';

export function defaultStats(): StatsData {
  return {
    fishStashed: 0, fishEaten: 0, distanceWaddled: 0, timesOutmatched: 0, fiveStarLevels: 0,
    rankedVictories: 0, wallBounces: 0, sprintSeconds: 0, levelsCompleted: 0, chestsOpened: 0, sprintHits: 0,
  };
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    profile: { username: DEFAULT_USERNAME, iconId: 'icon_penguin_classic', createdAt: now },
    wallet: { icicles: 200, shards: 0, fish: 0 },
    appliedTx: [],
    waddles: { owned: ['classic'], selected: 'classic' },
    hoods: { owned: [], equipped: null },
    adventure: { highestUnlocked: 1, stars: {}, hardStars: {} },
    bestTimes: {},
    infinite: { highestLevel: 0, highestLevelHard: 0, history: [] },
    daily: { cycleId: '', completed: [], completedHard: [], claimed: [], maxObservedTime: now },
    quests: { progress: {}, claimed: {}, periods: { daily: '', weekly: '', monthly: '' }, active: { daily: [], weekly: [], monthly: [] } },
    chests: { adChestReadyAt: 0, opened: {}, inventory: {} },
    stats: defaultStats(),
    ranked: { localPracticeWins: 0, localPracticeLosses: 0 },
    tutorial: { seenHints: [] },
    privacy: { consent: 'unknown', updatedAt: 0, policyVersionSeen: null },
  };
}

// --------------------------------------------------------------- validators

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const int = (v: unknown, d: number, lo = 0, hi = Number.MAX_SAFE_INTEGER): number => Math.floor(num(v, d, lo, hi));
const str = (v: unknown, d: string, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : d);
const strArr = (v: unknown, max = 5000): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-max) : []);
const intArr = (v: unknown, lo: number, hi: number): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= lo && x <= hi))].sort((a, b) => a - b) : [];
const numRecord = (v: unknown, lo: number, hi: number): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'number' && Number.isFinite(val) && val >= lo && val <= hi) out[k.slice(0, 120)] = val;
  }
  return out;
};
const trueRecord = (v: unknown): Record<string, true> => {
  const out: Record<string, true> = {};
  if (!isObj(v)) return out;
  for (const [k, val] of Object.entries(v)) if (val === true) out[k.slice(0, 120)] = true;
  return out;
};

const MAX_CURRENCY = 1_000_000_000;

/** Turns any JSON value into a complete, valid SaveData (after migrations). */
export function sanitizeSave(raw: unknown, now = Date.now()): SaveData {
  const d = defaultSave(now);
  if (!isObj(raw)) return d;
  const r = migrate(raw);
  const profile = isObj(r.profile) ? r.profile : {};
  const wallet = isObj(r.wallet) ? r.wallet : {};
  const waddles = isObj(r.waddles) ? r.waddles : {};
  const hoods = isObj(r.hoods) ? r.hoods : {};
  const adv = isObj(r.adventure) ? r.adventure : {};
  const inf = isObj(r.infinite) ? r.infinite : {};
  const daily = isObj(r.daily) ? r.daily : {};
  const quests = isObj(r.quests) ? r.quests : {};
  const qp = isObj(quests.periods) ? quests.periods : {};
  const qa = isObj(quests.active) ? quests.active : {};
  const chests = isObj(r.chests) ? r.chests : {};
  const stats = isObj(r.stats) ? r.stats : {};
  const ranked = isObj(r.ranked) ? r.ranked : {};
  const tutorial = isObj(r.tutorial) ? r.tutorial : {};
  const privacy = isObj(r.privacy) ? r.privacy : {};
  const ds = defaultStats();
  const ownedWaddles = strArr(waddles.owned, 100);
  if (!ownedWaddles.includes('classic')) ownedWaddles.unshift('classic');
  const selected = str(waddles.selected, 'classic', 40);
  const ownedHoods = strArr(hoods.owned, 400);
  const equipped = typeof hoods.equipped === 'string' && ownedHoods.includes(hoods.equipped) ? hoods.equipped : null;
  const history: SeedHistoryEntry[] = Array.isArray(inf.history)
    ? inf.history.filter(isObj).slice(-60).map((h) => ({
      code: str(h.code, '', 24),
      level: int(h.level, 1, 1, 1_000_000),
      hard: h.hard === true,
      bestMs: typeof h.bestMs === 'number' && h.bestMs > 0 ? h.bestMs : null,
      playedAt: num(h.playedAt, 0, 0),
      contentVersion: int(h.contentVersion, 1, 0),
      generatorVersion: int(h.generatorVersion, 1, 0),
    })).filter((h) => h.code.length > 0)
    : [];
  const consentRaw = str(privacy.consent, 'unknown', 20);
  const consent: ConsentState = (['unknown', 'granted', 'denied', 'notRequired'] as const).includes(consentRaw as ConsentState)
    ? (consentRaw as ConsentState) : 'unknown';
  return {
    version: SAVE_VERSION,
    createdAt: num(r.createdAt, now, 0),
    updatedAt: num(r.updatedAt, now, 0),
    profile: {
      username: sanitizeUsernameLoose(str(profile.username, d.profile.username, 40)),
      iconId: str(profile.iconId, d.profile.iconId, 60),
      createdAt: num(profile.createdAt, now, 0),
    },
    wallet: {
      icicles: int(wallet.icicles, d.wallet.icicles, 0, MAX_CURRENCY),
      shards: int(wallet.shards, 0, 0, MAX_CURRENCY),
      fish: int(wallet.fish, 0, 0, MAX_CURRENCY),
    },
    appliedTx: strArr(r.appliedTx, 500),
    waddles: { owned: ownedWaddles, selected: ownedWaddles.includes(selected) ? selected : 'classic' },
    hoods: { owned: ownedHoods, equipped },
    adventure: {
      highestUnlocked: int(adv.highestUnlocked, 1, 1, 800),
      stars: numRecord(adv.stars, 1, 5),
      hardStars: numRecord(adv.hardStars, 1, 5),
    },
    bestTimes: numRecord(r.bestTimes, 1, 1e9),
    infinite: {
      highestLevel: int(inf.highestLevel, 0, 0),
      highestLevelHard: int(inf.highestLevelHard, 0, 0),
      history,
    },
    daily: {
      cycleId: str(daily.cycleId, '', 60),
      completed: intArr(daily.completed, 1, 40),
      completedHard: intArr(daily.completedHard, 1, 40),
      claimed: intArr(daily.claimed, 1, 8),
      maxObservedTime: num(daily.maxObservedTime, now, 0),
    },
    quests: {
      progress: numRecord(quests.progress, 0, 1e12),
      claimed: trueRecord(quests.claimed),
      periods: { daily: str(qp.daily, '', 30), weekly: str(qp.weekly, '', 30), monthly: str(qp.monthly, '', 30) },
      active: { daily: strArr(qa.daily, 10), weekly: strArr(qa.weekly, 10), monthly: strArr(qa.monthly, 10) },
    },
    chests: { adChestReadyAt: num(chests.adChestReadyAt, 0, 0), opened: numRecord(chests.opened, 0, 1e9), inventory: numRecord(chests.inventory, 0, 1e6) },
    stats: Object.fromEntries(Object.keys(ds).map((k) => [k, num(stats[k], 0, 0)])) as unknown as StatsData,
    ranked: { localPracticeWins: int(ranked.localPracticeWins, 0), localPracticeLosses: int(ranked.localPracticeLosses, 0) },
    tutorial: { seenHints: strArr(tutorial.seenHints, 100) },
    privacy: {
      consent,
      updatedAt: num(privacy.updatedAt, 0, 0),
      policyVersionSeen: typeof privacy.policyVersionSeen === 'string' ? privacy.policyVersionSeen.slice(0, 40) : null,
    },
  };
}

function sanitizeUsernameLoose(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
  return cleaned.length >= 3 ? cleaned : DEFAULT_USERNAME;
}

// --------------------------------------------------------------- migrations

/**
 * migrations[n] upgrades a raw object from version n to n+1. Add a new entry
 * whenever SAVE_VERSION is bumped; never edit an existing one.
 */
const migrations: Record<number, (raw: Obj) => Obj> = {
  // 0 → 1: pre-release prototype saves stored currency at the top level.
  0: (raw) => ({
    ...raw,
    wallet: isObj(raw.wallet) ? raw.wallet : { icicles: raw.icicles, shards: raw.shards, fish: raw.fishCurrency },
    version: 1,
  }),
};

export function migrate(raw: Obj): Obj {
  let cur = raw;
  let v = typeof cur.version === 'number' && Number.isInteger(cur.version) ? cur.version : 0;
  if (v > SAVE_VERSION) {
    // Save from a newer build: keep known fields, never crash.
    return { ...cur, version: SAVE_VERSION };
  }
  while (v < SAVE_VERSION) {
    const m = migrations[v];
    cur = m ? m(cur) : { ...cur, version: v + 1 };
    v = typeof cur.version === 'number' ? cur.version : v + 1;
  }
  return cur;
}

/** Best-time records are only compared within identical rule sets. */
export function bestTimeKey(p: { mode: string; levelKey: string; contentVersion: number; generatorVersion: number; hard: boolean; normalized?: boolean }): string {
  return `${p.mode}|${p.levelKey}|c${p.contentVersion}|g${p.generatorVersion}|${p.hard ? 'H' : 'N'}${p.normalized ? '|R' : ''}`;
}
