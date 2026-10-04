/** Screen registry — every id the router can open. */
import type { Router } from '../router';
import { AdventureScreen } from './AdventureScreen';
import { ChestsSign } from './ChestsSign';
import { DailyScreen } from './DailyScreen';
import { FishingScreen } from './FishingScreen';
import { HoodsSign } from './HoodsSign';
import { InfiniteScreen } from './InfiniteScreen';
import { LegalSign } from './LegalSign';
import { MainMenuScreen } from './MainMenuScreen';
import { PetSign } from './PetSign';
import { PlayScreen } from './PlayScreen';
import { TrainingSign } from './TrainingSign';
import { ProfileSign } from './ProfileSign';
import { QuestsSign } from './QuestsSign';
import { RankedScreen } from './RankedScreen';
import { SettingsSign } from './SettingsSign';
import { StoreSign } from './StoreSign';
import { WaddleScreen } from './WaddleScreen';

/** Full screens that may be restored from the URL hash on refresh (never gameplay). */
export const SAFE_DEEP_LINKS = ['adventure', 'daily', 'infinite', 'ranked', 'fishing', 'waddle'];

export function registerScreens(router: Router): void {
  // Full dedicated screens.
  router.register('menu', (app, r, p) => new MainMenuScreen(app, r, p));
  router.register('adventure', (app, r, p) => new AdventureScreen(app, r, p));
  router.register('daily', (app, r, p) => new DailyScreen(app, r, p));
  router.register('infinite', (app, r, p) => new InfiniteScreen(app, r, p));
  router.register('ranked', (app, r, p) => new RankedScreen(app, r, p));
  router.register('fishing', (app, r, p) => new FishingScreen(app, r, p));
  router.register('waddle', (app, r, p) => new WaddleScreen(app, r, p));
  router.register('play', (app, r, p) => new PlayScreen(app, r, p));
  // Hanging wooden signs.
  router.register('quests', (app, r, p) => new QuestsSign(app, r, p));
  router.register('hoods', (app, r, p) => new HoodsSign(app, r, p));
  router.register('chests', (app, r, p) => new ChestsSign(app, r, p));
  router.register('store', (app, r, p) => new StoreSign(app, r, p));
  router.register('settings', (app, r, p) => new SettingsSign(app, r, p));
  router.register('legal', (app, r, p) => new LegalSign(app, r, p));
  router.register('profile', (app, r, p) => new ProfileSign(app, r, p));
  router.register('pet', (app, r, p) => new PetSign(app, r, p));
  router.register('training', (app, r, p) => new TrainingSign(app, r, p));
}
