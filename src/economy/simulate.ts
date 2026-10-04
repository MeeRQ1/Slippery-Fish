/**
 * Deterministic economy simulation (used by tests/unit/economySim.test.ts and
 * docs/ECONOMY.md). It drives the REAL reward code — mode drivers, quest
 * service, roadmap chests, pet care, limited exchanges, Hood prices and the
 * idempotent wallet — with synthetic but explicit player behaviour, on a
 * simulated clock. Nothing here is imported by the game bundle.
 *
 * Results are ESTIMATES: real players vary. The behaviour model is stated in
 * PlayerModel so the assumptions are inspectable and repeatable.
 */
import { EXCHANGE_OFFERS } from '../config/economy';
import { PET_MAX_TIER, petTier } from '../config/pet';
import { DAILY_LEVELS } from '../levels/daily';
import { adventureDriver, dailyDriver, type DriverServices, type PlayDriver } from '../progression/drivers';
import { HOODS, RARITIES } from '../progression/hoods';
import { claimRoadmapChest, availableRoadmapChests } from '../progression/roadmap';
import type { RunOutcome } from '../progression/results';
import { feedPet, collectPetBenefit, upgradePet } from '../pet/petService';
import { QuestService } from '../quests/quests';
import { SaveManager } from '../save/saveManager';
import { MemoryBackend } from '../save/storage';
import { Wallet } from './wallet';
import { trade, tradesLeft } from './exchange';
import type { LevelDef } from '../levels/types';

export interface PlayerModel {
  name: string;
  /**
   * Level time = par × parFactor + aimSecPerFish × fish (+ overhead for menus
   * and results). Par is the 5-star (expert) time, so ordinary play is well
   * above it: 4★ ≤ 1.3× par, 3★ ≤ 1.7× par.
   */
  parFactor: number;
  aimSecPerFish: number;
  overheadSec: number;
  /** Fraction of levels that need one failed attempt first (time lost, no reward). */
  failRate: number;
  /** Average fish lost per level (rounded per level deterministically). */
  fishLostPerLevel: number;
  bankShotsPerLevel: number;
  /** Minutes of play per day and how many Daily Challenge levels of that are done. */
  minutesPerDay: number;
  dailyLevelsPerDay: number;
  /** Uses the limited Icicle→Shard exchange when possible. */
  usesExchange: boolean;
  /** Feeds the pet once per day when affordable; upgrades when Icicles allow. */
  caresForPet: boolean;
}

export const PLAYER_MODELS: Record<'casual' | 'regular' | 'skilled', PlayerModel> = {
  casual: { name: 'casual', parFactor: 2.4, aimSecPerFish: 8, overheadSec: 25, failRate: 0.3, fishLostPerLevel: 0.35, bankShotsPerLevel: 0.1, minutesPerDay: 15, dailyLevelsPerDay: 5, usesExchange: false, caresForPet: true },
  regular: { name: 'regular', parFactor: 1.8, aimSecPerFish: 5, overheadSec: 18, failRate: 0.15, fishLostPerLevel: 0.15, bankShotsPerLevel: 0.25, minutesPerDay: 30, dailyLevelsPerDay: 15, usesExchange: true, caresForPet: true },
  skilled: { name: 'skilled', parFactor: 1.25, aimSecPerFish: 2, overheadSec: 10, failRate: 0.05, fishLostPerLevel: 0.05, bankShotsPerLevel: 0.5, minutesPerDay: 60, dailyLevelsPerDay: 40, usesExchange: true, caresForPet: true },
};

export interface SimSnapshot {
  playSec: number;
  icicles: number;
  shards: number;
  fish: number;
  shardsEarned: number;
  hoodsOwned: number;
  bestOwnedRarity: number;
  /** Highest rarity whose cheapest Hood the player could afford right now (−1 none). */
  bestAffordableRarity: number;
  adventureCleared: number;
}

export interface SimResult {
  model: string;
  snapshots: SimSnapshot[];
  /** Play seconds until cumulative Shards earned (if never spent) first reached each rarity's cheapest price. */
  timeToAffordRarity: Array<number | null>;
  final: SimSnapshot;
  shardsBySource: Record<string, number>;
}

const CHEAPEST = RARITIES.map((_, ri) => Math.min(...HOODS.filter((h) => h.rarityIndex === ri).map((h) => h.price)));

/** Fixed simulated start: a Monday 09:00 UTC, so week/month boundaries are deterministic. */
export const SIM_EPOCH = Date.UTC(2026, 0, 5, 9, 0, 0);

export class EconomySim {
  readonly save = new SaveManager();
  wallet!: Wallet;
  quests!: QuestService;
  svc!: DriverServices;
  clock = SIM_EPOCH;
  playSec = 0;
  shardsEarned = 0;
  private runCounter = 0;
  timeToAfford: Array<number | null> = RARITIES.map(() => null);
  /** Shards granted, by transaction-id prefix (quest:, roadmap:, daily:, pet:, store:, …). */
  readonly shardsBySource: Record<string, number> = {};

  constructor(readonly model: PlayerModel) {}

  async init(): Promise<void> {
    await this.save.load(new MemoryBackend());
    this.wallet = new Wallet(this.save);
    const tally = (txId: string, shards: number | undefined) => {
      if (!shards) return;
      const src = txId.startsWith('quest:') ? `quest:${txId.split(':')[1]!.split('_')[0]}` : txId.split(':')[0]!;
      this.shardsBySource[src] = (this.shardsBySource[src] ?? 0) + shards;
    };
    const grant = this.wallet.grant.bind(this.wallet);
    this.wallet.grant = (txId, reward, extra, source) => { const ok = grant(txId, reward, extra, source); if (ok) tally(txId, reward.shards); return ok; };
    const exchange = this.wallet.exchange.bind(this.wallet);
    this.wallet.exchange = (txId, cost, reward, extra, source) => { const ok = exchange(txId, cost, reward, extra, source); if (ok) tally(txId, reward.shards); return ok; };
    this.quests = new QuestService(this.save, this.wallet, () => this.clock);
    this.svc = { save: this.save, wallet: this.wallet, quests: this.quests, now: () => this.clock };
    this.wallet.events.on('changed', (e) => {
      if (e.currency === 'shards' && e.delta > 0) {
        this.shardsEarned += e.delta;
        for (let ri = 0; ri < CHEAPEST.length; ri++) if (this.timeToAfford[ri] === null && this.shardsEarned >= CHEAPEST[ri]!) this.timeToAfford[ri] = this.playSec;
      }
    });
  }

  private advance(sec: number): void {
    this.playSec += sec;
    this.clock += sec * 1000;
  }

  /** Deterministic pseudo-random in [0,1) from a counter (no Math.random). */
  private frac(k: number): number {
    const x = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  private outcome(level: LevelDef, timeMs: number): RunOutcome {
    const k = ++this.runCounter;
    const lost = this.frac(k) < this.model.fishLostPerLevel && level.enemies.length > 0 ? 1 : 0;
    const bank = this.frac(k + 0.5) < this.model.bankShotsPerLevel ? 1 : 0;
    return {
      runId: `sim-${k}`,
      timeMs,
      continued: false,
      stashed: level.fishRequired,
      required: level.fishRequired,
      hadEnemies: level.enemies.length > 0,
      stats: {
        wallBounces: 2, fishStashed: level.fishRequired, fishEaten: lost, distanceWaddled: 48 * 40 + level.parSeconds * 48 * 3,
        sprintSeconds: Math.min(6, level.parSeconds * 0.15), sprintHits: 1, fishTouches: level.fishRequired * 4, staminaEmpties: k === 1 ? 1 : 0,
        rareStashed: 0, bankShots: bank,
      },
    };
  }

  private play(driver: PlayDriver): void {
    const level = driver.level;
    const k = this.runCounter + 1;
    if (this.frac(k + 0.25) < this.model.failRate) {
      this.advance(level.parSeconds * this.model.parFactor * 0.6 + this.model.overheadSec);
      driver.failed(this.outcome(level, level.parSeconds * 600));
    }
    const sec = level.parSeconds * this.model.parFactor + this.model.aimSecPerFish * level.fishRequired;
    this.advance(sec + this.model.overheadSec);
    driver.complete(this.outcome(level, sec * 1000));
    this.afterAction();
  }

  /** Claims everything legitimately claimable (quests, roadmap chests, pet benefit) and makes routine choices. */
  afterAction(): void {
    for (const v of this.quests.views()) if (v.done && !v.claimed) this.quests.claim(v.key);
    for (const lv of availableRoadmapChests(this.save.data)) {
      if (claimRoadmapChest(this.save, this.wallet, lv).ok) this.quests.track('roadmapChests', 1);
    }
    if (this.model.caresForPet) {
      collectPetBenefit(this.save, this.wallet, this.clock);
      const fed = feedPet(this.save, this.wallet, this.clock, () => this.quests.track('petFed', 1));
      if (fed.ok) collectPetBenefit(this.save, this.wallet, this.clock);
      // Upgrade only with a comfortable Icicle surplus (keeps 1,000 for continues).
      const s = this.save.data;
      if (s.pet.tier < PET_MAX_TIER && s.wallet.icicles >= petTier(s.pet.tier + 1).upgradePrice + 1000) upgradePet(this.save, this.wallet, this.clock);
    }
    if (this.model.usesExchange) {
      for (const o of EXCHANGE_OFFERS) {
        if (!('icicles' in o.cost)) continue;
        while (tradesLeft(this.save.data, o, this.clock) > 0 && this.save.data.wallet.icicles >= o.cost.icicles + 1000) {
          if (trade(this.save, this.wallet, o, this.clock, `sim-trade-${++this.runCounter}`) !== 'ok') break;
        }
      }
    }
    // The tutorial asks to equip a Hood: buy the cheapest one once affordable, then save up.
    const s = this.save.data;
    if (s.hoods.owned.length === 0) {
      const cheapest = HOODS.filter((h) => h.rarityIndex === 0).sort((a, b) => a.price - b.price)[0]!;
      if (this.wallet.spend(`hood:${cheapest.id}`, { shards: cheapest.price }, (st) => { st.hoods.owned.push(cheapest.id); st.hoods.equipped = cheapest.id; })) {
        this.quests.track('hoodsEquipped', 1);
        this.quests.track('hoodsBought', 1);
      }
    }
  }

  playAdventure(): boolean {
    const n = this.save.data.adventure.highestUnlocked;
    if (Object.keys(this.save.data.adventure.stars).length >= 800) return false;
    const d = adventureDriver(this.svc, n, false);
    this.play(d);
    return true;
  }

  playDaily(): boolean {
    const s = this.save.data;
    const done = new Set(s.daily.completed);
    let next = 0;
    for (let i = 1; i <= DAILY_LEVELS; i++) if (!done.has(i)) { next = i; break; }
    if (!next) return false;
    this.play(dailyDriver(this.svc, next, false));
    return true;
  }

  snapshot(): SimSnapshot {
    const s = this.save.data;
    const ownedR = s.hoods.owned.map((id) => HOODS.find((h) => h.id === id)?.rarityIndex ?? -1);
    let afford = -1;
    for (let ri = 0; ri < CHEAPEST.length; ri++) if (s.wallet.shards >= CHEAPEST[ri]!) afford = ri;
    return {
      playSec: Math.round(this.playSec), icicles: s.wallet.icicles, shards: s.wallet.shards, fish: s.wallet.fish,
      shardsEarned: this.shardsEarned, hoodsOwned: s.hoods.owned.length, bestOwnedRarity: Math.max(-1, ...ownedR),
      bestAffordableRarity: afford, adventureCleared: Object.keys(s.adventure.stars).length,
    };
  }

  /** Jumps the clock to the next day's session start (time away does not count as play). */
  nextDay(): void {
    const day = 86_400_000;
    this.clock = Math.floor((this.clock - SIM_EPOCH) / day + 1) * day + SIM_EPOCH;
  }
}

/** A fresh profile's first `seconds` of play: menus/intro, then the Adventure from level 1 (the real first-session path). */
export async function simulateFreshSession(model: PlayerModel, seconds: number, opts: { tryDaily?: boolean } = {}): Promise<SimSnapshot> {
  const sim = new EconomySim(model);
  await sim.init();
  sim.playSec = 30; // startup, menu, first navigation
  let dailyTried = false;
  while (sim.playSec < seconds) {
    if (opts.tryDaily && !dailyTried && sim.playSec > seconds / 2) { dailyTried = true; sim.playDaily(); continue; }
    if (!sim.playAdventure()) break;
  }
  return sim.snapshot();
}

/** Multi-day routine: each day the model plays its Daily levels first, then Adventure until its minutes are used. */
export async function simulateDays(model: PlayerModel, days: number): Promise<SimResult> {
  const sim = new EconomySim(model);
  await sim.init();
  const snapshots: SimSnapshot[] = [];
  for (let d = 0; d < days; d++) {
    const start = sim.playSec;
    let daily = 0;
    while (sim.playSec - start < model.minutesPerDay * 60) {
      if (daily < model.dailyLevelsPerDay && sim.playDaily()) { daily++; continue; }
      if (!sim.playAdventure()) break;
    }
    sim.afterAction();
    snapshots.push(sim.snapshot());
    sim.nextDay();
  }
  return { model: model.name, snapshots, timeToAffordRarity: [...sim.timeToAfford], final: snapshots[snapshots.length - 1]!, shardsBySource: { ...sim.shardsBySource } };
}
