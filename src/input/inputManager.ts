/**
 * Unified input. Keyboard (WASD + held Left Shift) and touch (virtual joystick
 * + held sprint button) both write into the same state and are read as one
 * SimInput — the movement code never knows which device produced it.
 *
 * All held state is cleared on blur / visibility loss / pointer cancel so the
 * penguin never resumes with a stuck sprint or direction.
 */
import { Emitter } from '../core/events';
import type { SimInput } from '../gameplay/sim';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0],
  // Arrow keys as an accessibility convenience; WASD remains the documented scheme.
  ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0],
};

export class InputManager {
  private keys = new Set<string>();
  private joyX = 0;
  private joyY = 0;
  private touchSprint = false;
  private enabled = false;
  readonly events = new Emitter<{ pause: void; anyInput: void }>();
  /** Last device used — lets the UI show the right hints. */
  lastDevice: 'keyboard' | 'touch' | 'mouse' = 'keyboard';

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.enabled && !e.repeat) this.events.emit('pause', undefined);
      return;
    }
    if (!this.enabled) return;
    if (e.code in MOVE_KEYS || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      this.events.emit('anyInput', undefined);
      // Stop arrow keys/space from scrolling the page during play.
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => this.clear();
  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      this.clear();
      if (this.enabled) this.events.emit('pause', undefined);
    }
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Gameplay input is only collected while enabled (not in menus/pause). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
  }

  setJoystick(x: number, y: number): void {
    this.joyX = x;
    this.joyY = y;
    if (x !== 0 || y !== 0) {
      this.lastDevice = 'touch';
      this.events.emit('anyInput', undefined);
    }
  }

  setTouchSprint(on: boolean): void {
    this.touchSprint = on;
    if (on) this.lastDevice = 'touch';
  }

  clear(): void {
    this.keys.clear();
    this.joyX = 0;
    this.joyY = 0;
    this.touchSprint = false;
  }

  read(): SimInput {
    if (!this.enabled) return { moveX: 0, moveY: 0, sprint: false };
    let kx = 0, ky = 0;
    for (const k of this.keys) {
      const v = MOVE_KEYS[k];
      if (v) { kx += v[0]; ky += v[1]; }
    }
    // Normalise keyboard diagonals so diagonal speed equals straight speed.
    const kl = Math.sqrt(kx * kx + ky * ky);
    if (kl > 0) { kx /= kl; ky /= kl; }
    let mx = kx + this.joyX, my = ky + this.joyY;
    const ml = Math.sqrt(mx * mx + my * my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint;
    return { moveX: mx, moveY: my, sprint };
  }

  get sprintHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint;
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}
