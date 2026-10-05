/**
 * Earned profile titles — cosmetic labels, never stat multipliers or rewards.
 *
 * Criteria are evaluated only from committed progression (save data written
 * by result processing) or from a finished, won run's outcome. Two kinds:
 *
 *  - `progress` titles read a counter from the save (distinct Adventure
 *    levels, stars, regions, owned Hoods, lifetime stats). They are
 *    backfilled for existing saves because the counters are reliable.
 *  - `run` titles check a single won run. Timed ones require DEFAULT RULES:
 *    no gameplay-stat Hood equipped (economy-only Hoods are fine), no
 *    continue, never paused, and no level modifiers. Old best times did not
 *    record those conditions, so timed titles are NEVER backfilled.
 */
export type TitleCriterion =
  | { kind: 'progress'; metric: TitleMetric; target: number }
  | { kind: 'run'; mode: 'adventure'; maxSeconds: number; minLevel: number; minFish?: number; hard?: boolean; defaultRules: true };

export type TitleMetric =
  | 'distinctAdventure' | 'regionsCompleted' | 'adventureStars' | 'fiveStarAdventure' | 'bankShots'
  | 'hoodsOwned' | 'cleanEnemyClears' | 'petDaysFed' | 'dailyFullClears' | 'fishStashed';

export interface TitleDef {
  id: string;
  name: string;
  /** Player-facing criteria text (exact). */
  criteria: string;
  criterion: TitleCriterion;
}

export const TITLES: readonly TitleDef[] = [
  { id: 'fresh_flippers', name: 'Fresh Flippers', criteria: 'Clear your first Adventure level.', criterion: { kind: 'progress', metric: 'distinctAdventure', target: 1 } },
  { id: 'fish_courier', name: 'Fish Courier', criteria: 'Clear 25 different Adventure levels.', criterion: { kind: 'progress', metric: 'distinctAdventure', target: 25 } },
  { id: 'igloo_regular', name: 'Igloo Regular', criteria: 'Clear 100 different Adventure levels.', criterion: { kind: 'progress', metric: 'distinctAdventure', target: 100 } },
  { id: 'tundra_trailblazer', name: 'Tundra Trailblazer', criteria: 'Clear 300 different Adventure levels.', criterion: { kind: 'progress', metric: 'distinctAdventure', target: 300 } },
  { id: 'winter_warden', name: 'Warden of Classic Winter', criteria: 'Complete the first region (Adventure level 50).', criterion: { kind: 'progress', metric: 'regionsCompleted', target: 1 } },
  { id: 'four_region_rover', name: 'Four-Region Rover', criteria: 'Complete 4 Adventure regions.', criterion: { kind: 'progress', metric: 'regionsCompleted', target: 4 } },
  { id: 'horizon_halfway', name: 'Halfway to the Horizon', criteria: 'Complete 8 Adventure regions.', criterion: { kind: 'progress', metric: 'regionsCompleted', target: 8 } },
  { id: 'grand_tour', name: 'Grand Tour Penguin', criteria: 'Complete all 16 Adventure regions.', criterion: { kind: 'progress', metric: 'regionsCompleted', target: 16 } },
  { id: 'star_collector', name: 'Star Collector', criteria: 'Earn 150 Excellence Stars in Adventure.', criterion: { kind: 'progress', metric: 'adventureStars', target: 150 } },
  { id: 'five_star_fusspot', name: 'Five-Star Fusspot', criteria: 'Earn 5 stars on 25 different Adventure levels.', criterion: { kind: 'progress', metric: 'fiveStarAdventure', target: 25 } },
  { id: 'bank_shot_artist', name: 'Bank Shot Artist', criteria: 'Score 25 bank shots (bump a fish off a wall or obstacle into the igloo yard).', criterion: { kind: 'progress', metric: 'bankShots', target: 25 } },
  { id: 'untouchable', name: 'The Untouchable', criteria: 'Clear 20 levels with predators without losing a fish.', criterion: { kind: 'progress', metric: 'cleanEnemyClears', target: 20 } },
  { id: 'hood_hoarder', name: 'Hood Hoarder', criteria: 'Own 20 Hoods.', criterion: { kind: 'progress', metric: 'hoodsOwned', target: 20 } },
  { id: 'goldfish_bff', name: 'Goldfish Best Friend', criteria: 'Feed your pet goldfish on 7 different days.', criterion: { kind: 'progress', metric: 'petDaysFed', target: 7 } },
  { id: 'popsicle_devotee', name: 'Popsicle Devotee', criteria: 'Open all 8 Daily Popsicles in a single day.', criterion: { kind: 'progress', metric: 'dailyFullClears', target: 1 } },
  { id: 'chick_feeder', name: 'Chick Feeder Supreme', criteria: 'Stash 1,000 fish in the igloo yard.', criterion: { kind: 'progress', metric: 'fishStashed', target: 1000 } },
  {
    id: 'speed_skater', name: 'Speed Skater',
    criteria: 'Clear Adventure level 30 or later in under 20 seconds with default rules (no gameplay-stat Hood, no continue, no pause, no level twist).',
    criterion: { kind: 'run', mode: 'adventure', maxSeconds: 20, minLevel: 30, defaultRules: true },
  },
  {
    id: 'blizzard_blitz', name: 'Blizzard Blitz',
    criteria: 'Clear a Hard Mode Adventure level with 4+ fish in under 45 seconds with default rules (no gameplay-stat Hood, no continue, no pause, no level twist).',
    criterion: { kind: 'run', mode: 'adventure', maxSeconds: 45, minLevel: 1, minFish: 4, hard: true, defaultRules: true },
  },
];

export const TITLE_BY_ID: Record<string, TitleDef> = Object.fromEntries(TITLES.map((t) => [t.id, t]));
