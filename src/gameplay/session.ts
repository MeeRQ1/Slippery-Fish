/**
 * GameSession — glue between one GameSim and the outside world.
 *
 * Drives the fixed-step loop (called by the Phaser GameScene each frame),
 * reads unified input, pauses safely on visibility/focus loss, and fans
 * simulation events out to presentation listeners (renderer FX, audio, HUD,
 * result flow). It owns no rendering and no persistence.
 */
import { PHYSICS, STAMINA, WARNING } from '../config/gameplay';
import { Emitter } from '../core/events';
import { FixedStepper } from '../core/fixedStep';
import type { InputManager } from '../input/inputManager';
import type { GameMode, LevelDef } from '../levels/types';
import type { GameplayModifiers } from './modifiers';
import { GameSim, NO_INPUT, type SimEvent } from './sim';

export interface SessionConfig {
  level: LevelDef;
  mode: GameMode;
  modifiers: GameplayModifiers;
  hard: boolean;
  /** Ranked: stat bonuses disabled. */
  normalized: boolean;
  /** Atlas frame for the player's penguin. */
  penguinFrame: string;
  /** Equipped Hood id (always rendered; stats only apply outside Ranked). */
  hoodId: string | null;
}

export type StaminaVisualState = 'normal' | 'sprinting' | 'low' | 'empty';

export interface HudSnapshot {
  timeMs: number;
  stamina: number;
  staminaMax: number;
  staminaState: StaminaVisualState;
  canSprint: boolean;
  /** 0 = safe … 1 = immediate danger. */
  danger: number;
  stashed: number;
  required: number;
  fishTotal: number;
  fishEaten: number;
  status: GameSim['status'];
  paused: boolean;
  started: boolean;
}

export interface SessionEvents {
  sim: SimEvent;
  pauseChanged: boolean;
}

export class GameSession {
  readonly sim: GameSim;
  readonly stepper = new FixedStepper(PHYSICS.fixedStep, PHYSICS.maxStepsPerFrame);
  readonly events = new Emitter<SessionEvents>();
  paused = false;
  /** The stopwatch (and enemies) wait for the first movement or a short timeout. */
  started = false;
  private armedAt = 0;
  private dangerSmoothed = 0;
  private disposed = false;
  private onPauseRequest = (): void => this.setPaused(true);
  private unsubPause: () => void;

  constructor(readonly config: SessionConfig, private readonly input: InputManager) {
    this.sim = new GameSim(config.level, { modifiers: config.modifiers, hard: config.hard });
    input.setEnabled(true);
    this.unsubPause = input.events.on('pause', this.onPauseRequest);
  }

  /** Advances the simulation for a rendered frame; returns steps run. */
  frame(frameSeconds: number): number {
    if (this.disposed) return 0;
    if (this.paused || this.sim.status !== 'playing') {
      this.stepper.reset();
      this.updateDanger(frameSeconds, true);
      return 0;
    }
    if (!this.started) {
      if (this.armedAt === 0) this.armedAt = performance.now();
      const probe = this.input.read();
      const moved = Math.abs(probe.moveX) + Math.abs(probe.moveY) > 0.1 || probe.sprint;
      if (!moved && performance.now() - this.armedAt < 3000) {
        this.updateDanger(frameSeconds, true);
        return 0;
      }
      this.started = true;
      this.stepper.reset();
    }
    const steps = this.stepper.advance(frameSeconds);
    for (let i = 0; i < steps; i++) {
      const input = this.input.read();
      this.sim.step(input);
      for (const e of this.sim.events) this.events.emit('sim', e);
      if (this.sim.status !== 'playing') break;
    }
    this.updateDanger(frameSeconds, false);
    return steps;
  }

  private updateDanger(dt: number, frozen: boolean): void {
    let target = 0;
    if (!frozen && this.sim.status === 'playing') {
      const far = WARNING.farDistance * this.config.modifiers.warningDistance;
      const d = this.sim.dangerDistance();
      target = d >= far ? 0 : Math.min(1, Math.max(0, (far - d) / (far - WARNING.nearDistance)));
    }
    const k = 1 - Math.exp(-WARNING.fadeRate * dt);
    this.dangerSmoothed += (target - this.dangerSmoothed) * k;
  }

  setPaused(p: boolean): void {
    if (this.disposed || this.paused === p) return;
    if (p) this.armedAt = performance.now();
    if (p && this.sim.status !== 'playing') return;
    this.paused = p;
    this.input.setEnabled(!p);
    this.stepper.reset();
    this.events.emit('pauseChanged', p);
  }

  continueAfterFail(): void {
    this.sim.applyContinue();
    this.stepper.reset();
    this.input.setEnabled(true);
  }

  snapshot(): HudSnapshot {
    const pl = this.sim.player;
    const frac = pl.stamina / pl.maxStamina;
    let staminaState: StaminaVisualState = 'normal';
    if (pl.exhausted || pl.stamina <= 0.01) staminaState = 'empty';
    else if (pl.sprinting) staminaState = frac <= STAMINA.lowFraction ? 'low' : 'sprinting';
    else if (frac <= STAMINA.lowFraction) staminaState = 'low';
    return {
      timeMs: this.sim.timeMs,
      stamina: pl.stamina,
      staminaMax: pl.maxStamina,
      staminaState,
      canSprint: !pl.exhausted && pl.stamina > 0,
      danger: this.dangerSmoothed,
      stashed: this.sim.stashedValue,
      required: this.sim.required,
      fishTotal: this.sim.fish.length,
      fishEaten: this.sim.stats.fishEaten,
      status: this.sim.status,
      paused: this.paused,
      started: this.started,
    };
  }

  /** Input reading stops; listeners are released. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubPause();
    this.input.setEnabled(false);
    this.events.clear();
  }

  get idleInput(): typeof NO_INPUT {
    return NO_INPUT;
  }
}
