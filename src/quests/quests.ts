/**
 * Quests — Tutorial, Daily, Weekly, Monthly (spec §60).
 *
 * Periodic quests rotate deterministically by UTC period key (day / ISO week /
 * month) so everyone sees the same set; progress resets when a period ends.
 * Claims are idempotent (one transaction per quest+period). Local clocks are
 * editable — quests are convenience rewards, not anti-cheat protected.
 */
import { Rng } from '../core/rng';
import type { Reward, Wallet } from '../economy/wallet';
import { questMultipliers } from '../progression/hoods';
import type { SaveManager } from '../save/saveManager';

export type QuestCategory = 'tutorial' | 'daily' | 'weekly' | 'monthly';

export type Metric =
  | 'distanceWaddled' | 'sprintSeconds' | 'staminaEmpty' | 'fishTouches' | 'fishStashed' | 'enemyLevelsCompleted'
  | 'threeStarLevels' | 'fiveStarLevels' | 'hoodsEquipped' | 'levelsCompleted' | 'wallBounces' | 'sprintHits'
  | 'starsEarned' | 'dailyLevels' | 'infiniteLevels' | 'hardWins' | 'chestsOpened' | 'hoodsBought' | 'adventureLevels'
  | 'noLossLevels' | 'rareFishStashed' | 'bankShots' | 'petFed' | 'roadmapChests';

export interface QuestDef {
  id: string;
  category: QuestCategory;
  title: string;
  metric: Metric;
  target: number;
  reward: Reward;
  /** Teaching quests point at what they teach. */
  teaches?: string;
  /** Progress display conversion (e.g. world units → metres). */
  display?: { div: number; suffix: string };
}

/** World units per displayed metre (one penguin is ~48 units across). */
export const UNITS_PER_METRE = 48;
const METRES = { div: UNITS_PER_METRE, suffix: ' m' };

/**
 * Tutorial line (economy v2): teaches in play order; its Shards (35 before the
 * Hood step) afford exactly one first Hood from the Pollution rarity, so the
 * Hood loop is introduced without handing out high rarities.
 */
export const TUTORIAL_QUESTS: QuestDef[] = [
  { id: 't_move', category: 'tutorial', title: 'Waddle 50 m', metric: 'distanceWaddled', target: 50 * UNITS_PER_METRE, reward: { icicles: 40 }, teaches: 'movement', display: METRES },
  { id: 't_sprint', category: 'tutorial', title: 'Hold sprint for 3 seconds', metric: 'sprintSeconds', target: 3, reward: { icicles: 40 }, teaches: 'sprint' },
  { id: 't_stamina', category: 'tutorial', title: 'Sprint until your stamina runs dry, then let it refill', metric: 'staminaEmpty', target: 1, reward: { icicles: 40 }, teaches: 'stamina' },
  { id: 't_dribble', category: 'tutorial', title: 'Bump fish 15 times', metric: 'fishTouches', target: 15, reward: { icicles: 50 }, teaches: 'dribbling' },
  { id: 't_score', category: 'tutorial', title: 'Stash 5 fish in the igloo yard', metric: 'fishStashed', target: 5, reward: { icicles: 60, shards: 10 }, teaches: 'scoring' },
  { id: 't_bank', category: 'tutorial', title: 'Score a bank shot (bounce a fish off a wall into the yard)', metric: 'bankShots', target: 1, reward: { icicles: 60, shards: 5 }, teaches: 'bank shots' },
  { id: 't_enemy', category: 'tutorial', title: 'Beat a level with a predator in it', metric: 'enemyLevelsCompleted', target: 1, reward: { icicles: 80, shards: 10 }, teaches: 'enemy avoidance' },
  { id: 't_stars', category: 'tutorial', title: 'Earn 3+ stars on a level', metric: 'threeStarLevels', target: 1, reward: { icicles: 80, shards: 10 }, teaches: 'stars' },
  { id: 't_hood', category: 'tutorial', title: 'Equip a Hood', metric: 'hoodsEquipped', target: 1, reward: { shards: 20 }, teaches: 'Hood equipping' },
  { id: 't_pet', category: 'tutorial', title: 'Feed your pet goldfish', metric: 'petFed', target: 1, reward: { fish: 2 }, teaches: 'pet care' },
  { id: 't_chest', category: 'tutorial', title: 'Open a chest on the Adventure route', metric: 'roadmapChests', target: 1, reward: { icicles: 100 }, teaches: 'roadmap rewards' },
];

const DAILY_POOL: QuestDef[] = [
  { id: 'd_stash15', category: 'daily', title: 'Stash 15 fish', metric: 'fishStashed', target: 15, reward: { icicles: 100, shards: 5 } },
  { id: 'd_levels3', category: 'daily', title: 'Complete 3 levels', metric: 'levelsCompleted', target: 3, reward: { icicles: 90, shards: 4, fish: 1 } },
  { id: 'd_bounce20', category: 'daily', title: 'Bounce fish off snow banks 20 times', metric: 'wallBounces', target: 20, reward: { icicles: 100, shards: 5 } },
  { id: 'd_sprinthit8', category: 'daily', title: 'Land 8 sprint hits on fish', metric: 'sprintHits', target: 8, reward: { icicles: 100, shards: 5 } },
  { id: 'd_stars8', category: 'daily', title: 'Earn 8 Excellence Stars', metric: 'starsEarned', target: 8, reward: { icicles: 110, shards: 6, fish: 1 } },
  { id: 'd_daily2', category: 'daily', title: 'Clear 2 Daily Challenge levels', metric: 'dailyLevels', target: 2, reward: { icicles: 100, shards: 5, fish: 1 } },
  { id: 'd_inf3', category: 'daily', title: 'Clear 3 Infinite levels', metric: 'infiniteLevels', target: 3, reward: { icicles: 100, shards: 5, fish: 1 } },
  { id: 'd_waddle1k', category: 'daily', title: 'Waddle 1,000 m', metric: 'distanceWaddled', target: 1000 * UNITS_PER_METRE, reward: { icicles: 80, shards: 4 }, display: METRES },
  { id: 'd_noloss2', category: 'daily', title: 'Clear 2 levels without losing a fish', metric: 'noLossLevels', target: 2, reward: { icicles: 110, shards: 6 } },
  { id: 'd_bank3', category: 'daily', title: 'Score 3 bank shots', metric: 'bankShots', target: 3, reward: { icicles: 110, shards: 6, fish: 1 } },
];

const WEEKLY_POOL: QuestDef[] = [
  { id: 'w_stash200', category: 'weekly', title: 'Stash 200 fish', metric: 'fishStashed', target: 200, reward: { icicles: 600, shards: 35, fish: 4 } },
  { id: 'w_five5', category: 'weekly', title: 'Earn 5 stars on 5 levels', metric: 'fiveStarLevels', target: 5, reward: { icicles: 700, shards: 45, fish: 6 } },
  { id: 'w_hard5', category: 'weekly', title: 'Win 5 Hard Mode levels', metric: 'hardWins', target: 5, reward: { icicles: 800, shards: 45, fish: 8 } },
  { id: 'w_daily20', category: 'weekly', title: 'Clear 20 Daily Challenge levels', metric: 'dailyLevels', target: 20, reward: { icicles: 650, shards: 40, fish: 5 } },
  { id: 'w_adv40', category: 'weekly', title: 'Clear 40 Adventure levels', metric: 'adventureLevels', target: 40, reward: { icicles: 650, shards: 40, fish: 5 } },
  { id: 'w_rare3', category: 'weekly', title: 'Stash 3 golden Rare Fish', metric: 'rareFishStashed', target: 3, reward: { icicles: 500, shards: 35, fish: 5 } },
  { id: 'w_bank15', category: 'weekly', title: 'Score 15 bank shots', metric: 'bankShots', target: 15, reward: { icicles: 650, shards: 40, fish: 5 } },
];

const MONTHLY_POOL: QuestDef[] = [
  { id: 'm_stash1000', category: 'monthly', title: 'Stash 1,000 fish', metric: 'fishStashed', target: 1000, reward: { icicles: 2500, shards: 140, fish: 20 } },
  { id: 'm_inf60', category: 'monthly', title: 'Clear 60 Infinite levels', metric: 'infiniteLevels', target: 60, reward: { icicles: 2500, shards: 130, fish: 20 } },
  { id: 'm_chests3', category: 'monthly', title: 'Open 3 Treasure Chests', metric: 'chestsOpened', target: 3, reward: { icicles: 1500, shards: 100 } },
  { id: 'm_hoods5', category: 'monthly', title: 'Collect 5 new Hoods', metric: 'hoodsBought', target: 5, reward: { icicles: 2000, shards: 60, fish: 15 } },
  { id: 'm_stars400', category: 'monthly', title: 'Earn 400 Excellence Stars', metric: 'starsEarned', target: 400, reward: { icicles: 2600, shards: 140, fish: 20 } },
  { id: 'm_pet20', category: 'monthly', title: 'Feed your goldfish on 20 days', metric: 'petFed', target: 20, reward: { icicles: 1500, shards: 80, fish: 10 } },
];

export const ALL_QUESTS: QuestDef[] = [...TUTORIAL_QUESTS, ...DAILY_POOL, ...WEEKLY_POOL, ...MONTHLY_POOL];
export const QUEST_POOLS = { daily: DAILY_POOL, weekly: WEEKLY_POOL, monthly: MONTHLY_POOL } as const;
const BY_ID = Object.fromEntries(ALL_QUESTS.map((q) => [q.id, q]));

export function periodKeys(nowMs: number): { daily: string; weekly: string; monthly: string } {
  const d = new Date(nowMs);
  const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  // ISO week number (UTC).
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return { daily: day, weekly: `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, monthly: day.slice(0, 7) };
}

export interface QuestView {
  def: QuestDef;
  key: string;
  progress: number;
  done: boolean;
  claimed: boolean;
  reward: Reward;
}

export class QuestService {
  constructor(private save: SaveManager, private wallet: Wallet, private now: () => number = () => Date.now()) {}

  /** Rotates periodic quests when a new UTC day/week/month begins. */
  refresh(): void {
    const keys = periodKeys(this.now());
    const q = this.save.data.quests;
    if (q.periods.daily === keys.daily && q.periods.weekly === keys.weekly && q.periods.monthly === keys.monthly) return;
    this.save.mutate((s) => {
      const pick = (pool: QuestDef[], key: string, n: number) => new Rng(`quests:${key}`).shuffle([...pool]).slice(0, n).map((x) => x.id);
      if (s.quests.periods.daily !== keys.daily) s.quests.active.daily = pick(DAILY_POOL, keys.daily, 3);
      if (s.quests.periods.weekly !== keys.weekly) s.quests.active.weekly = pick(WEEKLY_POOL, keys.weekly, 3);
      if (s.quests.periods.monthly !== keys.monthly) s.quests.active.monthly = pick(MONTHLY_POOL, keys.monthly, 3);
      s.quests.periods = keys;
      // Drop progress for expired periodic quests (keys embed their period).
      for (const k of Object.keys(s.quests.progress)) {
        const at = k.indexOf('@');
        if (at < 0) continue;
        const period = k.slice(at + 1);
        if (period !== keys.daily && period !== keys.weekly && period !== keys.monthly) delete s.quests.progress[k];
      }
    }, { immediate: true });
  }

  private keyFor(def: QuestDef): string {
    const p = this.save.data.quests.periods;
    switch (def.category) {
      case 'tutorial': return def.id;
      case 'daily': return `${def.id}@${p.daily}`;
      case 'weekly': return `${def.id}@${p.weekly}`;
      case 'monthly': return `${def.id}@${p.monthly}`;
    }
  }

  active(): QuestDef[] {
    const a = this.save.data.quests.active;
    return [...TUTORIAL_QUESTS, ...[...a.daily, ...a.weekly, ...a.monthly].map((id) => BY_ID[id]).filter((x): x is QuestDef => !!x)];
  }

  /** Records progress for every active quest that uses `metric`. */
  track(metric: Metric, amount: number): void {
    if (amount <= 0) return;
    this.refresh();
    const defs = this.active().filter((d) => d.metric === metric);
    if (defs.length === 0) return;
    this.save.mutate((s) => {
      for (const d of defs) {
        const k = this.keyFor(d);
        if (s.quests.claimed[k]) continue;
        s.quests.progress[k] = Math.min(d.target, (s.quests.progress[k] ?? 0) + amount);
      }
    });
  }

  views(): QuestView[] {
    this.refresh();
    const s = this.save.data;
    const hood = s.hoods.equipped;
    const mult = questMultipliers(hood);
    return this.active().map((def) => {
      const key = this.keyFor(def);
      const progress = s.quests.progress[key] ?? 0;
      const reward: Reward = {
        ...(def.reward.icicles ? { icicles: Math.round(def.reward.icicles * mult.icicles) } : {}),
        ...(def.reward.shards ? { shards: Math.round(def.reward.shards * mult.shards) } : {}),
        ...(def.reward.fish ? { fish: def.reward.fish } : {}),
      };
      return { def, key, progress, done: progress >= def.target, claimed: !!s.quests.claimed[key], reward };
    });
  }

  claim(key: string, source?: { x: number; y: number }): QuestView | null {
    const v = this.views().find((q) => q.key === key);
    if (!v || !v.done || v.claimed) return null;
    const ok = this.wallet.grant(`quest:${key}`, v.reward, (s) => { s.quests.claimed[key] = true; }, source);
    return ok ? { ...v, claimed: true } : null;
  }

  claimableCount(): number {
    return this.views().filter((q) => q.done && !q.claimed).length;
  }
}
