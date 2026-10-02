/**
 * Player preferences. Small and needed before anything renders, so they live
 * in localStorage (with an in-memory fallback when storage is blocked).
 * Gameplay progress lives in the IndexedDB save instead.
 */
import { Emitter } from '../core/events';

export type QualityLevel = 'auto' | 'high' | 'medium' | 'low';
export type TouchControlsMode = 'auto' | 'on' | 'off';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicOn: boolean;
  buttonSounds: boolean;
  haptics: boolean;
  /** 0 = off … 1 = full. */
  screenShake: number;
  reducedMotion: boolean;
  /** Danger vignette intensity multiplier 0.25–1.5. */
  warningIntensity: number;
  /** UI scale 0.85–1.3 for readability. */
  uiScale: number;
  quality: QualityLevel;
  touchControls: TouchControlsMode;
  /** Put the sprint button on the left and joystick on the right. */
  swapTouchSides: boolean;
  showFps: boolean;
}

const KEY = 'slipperyfish.settings.v1';

function systemPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8,
    musicVolume: 0.55,
    sfxVolume: 0.85,
    musicOn: true,
    buttonSounds: true,
    haptics: true,
    screenShake: 0.7,
    reducedMotion: systemPrefersReducedMotion(),
    warningIntensity: 1,
    uiScale: 1,
    quality: 'auto',
    touchControls: 'auto',
    swapTouchSides: false,
    showFps: false,
  };
}

const clampNum = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d);

/** Validates untrusted JSON into a complete Settings object. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return {
    masterVolume: clampNum(r.masterVolume, 0, 1, d.masterVolume),
    musicVolume: clampNum(r.musicVolume, 0, 1, d.musicVolume),
    sfxVolume: clampNum(r.sfxVolume, 0, 1, d.sfxVolume),
    musicOn: bool(r.musicOn, d.musicOn),
    buttonSounds: bool(r.buttonSounds, d.buttonSounds),
    haptics: bool(r.haptics, d.haptics),
    screenShake: clampNum(r.screenShake, 0, 1, d.screenShake),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    warningIntensity: clampNum(r.warningIntensity, 0.25, 1.5, d.warningIntensity),
    uiScale: clampNum(r.uiScale, 0.85, 1.3, d.uiScale),
    quality: oneOf(r.quality, ['auto', 'high', 'medium', 'low'] as const, d.quality),
    touchControls: oneOf(r.touchControls, ['auto', 'on', 'off'] as const, d.touchControls),
    swapTouchSides: bool(r.swapTouchSides, d.swapTouchSides),
    showFps: bool(r.showFps, d.showFps),
  };
}

export class SettingsStore {
  private value: Settings;
  readonly changes = new Emitter<{ change: Settings }>();
  /** False when localStorage threw (private mode / blocked): settings last only this session. */
  persistent = true;

  constructor() {
    let raw: unknown = null;
    try {
      const s = localStorage.getItem(KEY);
      raw = s ? JSON.parse(s) : null;
    } catch {
      this.persistent = false;
    }
    this.value = sanitizeSettings(raw);
  }

  get(): Readonly<Settings> {
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    this.value = sanitizeSettings({ ...this.value, ...patch });
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
      this.persistent = true;
    } catch {
      this.persistent = false;
    }
    this.changes.emit('change', this.value);
  }

  reset(): void {
    this.update(defaultSettings());
  }
}
