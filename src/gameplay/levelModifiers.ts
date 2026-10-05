/**
 * Level modifiers — a small, deliberate set of per-level rule twists that are
 * part of a level's definition (generated from its seed, so a given level id
 * always carries the same modifiers and its records stay comparable).
 *
 * Distinct from Hood stat bonuses (GameplayModifiers). Never applied in
 * Ranked/Practice (normalized rules). Reward bonuses are capped
 * (MAX_REWARD_BONUS) so combinations cannot compound into an exploit.
 */
export type LevelModifierId = 'glazedIce' | 'featherFish' | 'shortBreath' | 'hungryHunters' | 'luckyCatch';

export interface LevelModifierEffects {
  /** Multiplies fish sliding damping everywhere (lower = longer slides). */
  fishDamping: number;
  /** Multiplies penguin acceleration/braking (lower = skatier). */
  playerAccel: number;
  /** Multiplies fish mass (lower = launched further by the same hit). */
  fishMass: number;
  /** Added to fish restitution against walls/obstacles. */
  fishBounce: number;
  sprintDrain: number;
  staminaRegen: number;
  enemySpeed: number;
}

export interface LevelModifierDef {
  id: LevelModifierId;
  name: string;
  /** Short glyph for chips. */
  icon: string;
  /** Player-facing, plain description of the real effect. */
  description: string;
  /** Extra Icicle reward fraction (e.g. 0.2 = +20%). */
  rewardBonus: number;
  effects: Partial<LevelModifierEffects>;
  /** Par-time multiplier so Excellence Stars stay fair. */
  parFactor: number;
}

export const MAX_REWARD_BONUS = 0.25;

export const LEVEL_MODIFIERS: Record<LevelModifierId, LevelModifierDef> = {
  glazedIce: {
    id: 'glazedIce', name: 'Glazed Ice', icon: '❄',
    description: 'Freshly polished ice: fish slide 35% further and penguins skate wider turns.',
    rewardBonus: 0.1, effects: { fishDamping: 0.65, playerAccel: 0.72 }, parFactor: 1.08,
  },
  featherFish: {
    id: 'featherFish', name: 'Featherweight Fish', icon: '🪶',
    description: 'Extra-light fish: every bump launches them further and they bounce livelier.',
    rewardBonus: 0, effects: { fishMass: 0.72, fishBounce: 0.06 }, parFactor: 0.97,
  },
  shortBreath: {
    id: 'shortBreath', name: 'Short of Breath', icon: '💨',
    description: 'Frosty air: sprinting drains stamina 35% faster, but it also refills 35% faster.',
    rewardBonus: 0.05, effects: { sprintDrain: 1.35, staminaRegen: 1.35 }, parFactor: 1.04,
  },
  hungryHunters: {
    id: 'hungryHunters', name: 'Hungry Hunters', icon: '🐾',
    description: 'The predators skipped breakfast: enemies move 12% faster. +20% Icicles.',
    rewardBonus: 0.2, effects: { enemySpeed: 1.12 }, parFactor: 1.05,
  },
  luckyCatch: {
    id: 'luckyCatch', name: 'Lucky Catch', icon: '🍀',
    description: 'A lucky day on the ice: no rule changes, +25% Icicles for clearing it.',
    rewardBonus: 0.25, effects: {}, parFactor: 1,
  },
};

export const LEVEL_MODIFIER_IDS = Object.keys(LEVEL_MODIFIERS) as LevelModifierId[];

/** Pairs that never appear together (reward stacking or muddled rules). */
const EXCLUSIVE: ReadonlyArray<[LevelModifierId, LevelModifierId]> = [
  ['luckyCatch', 'hungryHunters'],
  ['luckyCatch', 'glazedIce'],
  ['glazedIce', 'featherFish'],
];

export function compatible(a: LevelModifierId, b: LevelModifierId): boolean {
  return a !== b && !EXCLUSIVE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function combinedEffects(ids: readonly LevelModifierId[]): LevelModifierEffects {
  const out: LevelModifierEffects = { fishDamping: 1, playerAccel: 1, fishMass: 1, fishBounce: 0, sprintDrain: 1, staminaRegen: 1, enemySpeed: 1 };
  for (const id of ids) {
    const e = LEVEL_MODIFIERS[id]?.effects;
    if (!e) continue;
    if (e.fishDamping !== undefined) out.fishDamping *= e.fishDamping;
    if (e.playerAccel !== undefined) out.playerAccel *= e.playerAccel;
    if (e.fishMass !== undefined) out.fishMass *= e.fishMass;
    if (e.fishBounce !== undefined) out.fishBounce += e.fishBounce;
    if (e.sprintDrain !== undefined) out.sprintDrain *= e.sprintDrain;
    if (e.staminaRegen !== undefined) out.staminaRegen *= e.staminaRegen;
    if (e.enemySpeed !== undefined) out.enemySpeed *= e.enemySpeed;
  }
  return out;
}

/** Total Icicle reward bonus fraction, capped. */
export function rewardBonus(ids: readonly LevelModifierId[]): number {
  let b = 0;
  for (const id of ids) b += LEVEL_MODIFIERS[id]?.rewardBonus ?? 0;
  return Math.min(MAX_REWARD_BONUS, b);
}

export function parFactor(ids: readonly LevelModifierId[]): number {
  let f = 1;
  for (const id of ids) f *= LEVEL_MODIFIERS[id]?.parFactor ?? 1;
  return f;
}
