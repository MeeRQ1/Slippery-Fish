/**
 * Late-bound hooks so low-level UI components (buttons) can play sounds,
 * show toasts and respect the router's transition lock without importing the
 * App (avoids circular dependencies). Wired once in main.ts.
 */
import type { SfxId } from '../config/audio';

export const uiHooks = {
  sound: (_id: SfxId, _isUi?: boolean): void => undefined,
  haptic: (_ms: number): void => undefined,
  toast: (_msg: string): void => undefined,
  isBusy: (): boolean => false,
};
