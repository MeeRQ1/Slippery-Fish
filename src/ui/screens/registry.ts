/**
 * Screen registry: the explicit list of every screen the router can show.
 */
import type { Router } from '../router';
import { MainMenuScreen } from './MainMenuScreen';
import { AdventureScreen } from './AdventureScreen';
import { PlayScreen } from './PlayScreen';
import { PendingSign } from './PendingSign';

/** Screens that may be restored from location.hash on refresh (never gameplay). */
export const SAFE_DEEP_LINKS = ['adventure', 'daily', 'infinite', 'ranked', 'fishing', 'waddle'];

export function registerScreens(router: Router): void {
  router.register('menu', (app, r, p) => new MainMenuScreen(app, r, p));
  router.register('adventure', (app, r, p) => new AdventureScreen(app, r, p));
  router.register('play', (app, r, p) => new PlayScreen(app, r, p));
  for (const id of ['daily', 'infinite', 'ranked', 'fishing', 'waddle', 'hoods', 'quests', 'chests', 'store', 'settings', 'profile']) {
    router.register(id, (app, r, p) => new PendingSign(app, r, { ...p, which: id }));
  }
}
