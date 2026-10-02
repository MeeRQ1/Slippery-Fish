/**
 * Gameplay-affecting stat modifiers (from Hoods). All multipliers default to 1.
 * Ranked always uses NORMALIZED_MODIFIERS (spec §32: stat bonuses disabled).
 */
export interface GameplayModifiers {
  maxStamina: number;
  staminaRegen: number;
  /** Multiplies sprint drain (values < 1 are better). */
  sprintDrain: number;
  moveSpeed: number;
  accel: number;
  fishKick: number;
  /** Lower penguin↔fish restitution = softer, more controllable dribbles. */
  fishControl: number;
  warningDistance: number;
  /** Fraction of max stamina at level start (0–1). */
  startStamina: number;
  /** Shortens the stagger after hard collisions. */
  collisionRecovery: number;
}

export const NORMALIZED_MODIFIERS: Readonly<GameplayModifiers> = Object.freeze({
  maxStamina: 1,
  staminaRegen: 1,
  sprintDrain: 1,
  moveSpeed: 1,
  accel: 1,
  fishKick: 1,
  fishControl: 1,
  warningDistance: 1,
  startStamina: 1,
  collisionRecovery: 1,
});
