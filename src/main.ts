/**
 * Slippery Fish — entry point.
 *
 * Startup (see index.html for the inline part that paints before this bundle):
 *  1. The Inverse Smiles mark animates immediately; everything below runs
 *     concurrently with it (no serial logo wait).
 *  2. TabGuard decides whether this tab may own the save.
 *  3. The save, fonts and core atlases load with REAL progress shown on the
 *     loading scene, whose profile card was filled from the cached summary
 *     and is reconciled from the real save as soon as it loads.
 *  4. When the brand has finished and loading is done, the menu (or a safe
 *     deep link) appears. If loading finished first, the loading scene is
 *     skipped entirely.
 */
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/luckiest-guy/latin-400.css';
import './ui/styles.css';
import './ui/screens.css';
import './ui/panels.css';
import './ui/living.css';
import { App } from './app';
import { TabGuard } from './core/tabGuard';
import { evaluateProgressTitles } from './progression/titles';
import { buildSummary, writeSummary } from './profile/summaryCache';
import { showTabBlocker } from './ui/tabBlocker';
import { uiHooks } from './ui/uiHooks';
import { registerScreens, SAFE_DEEP_LINKS } from './ui/screens/registry';

interface BootApi {
  brandDone: Promise<void>;
  hideBrand(): void;
  setProgress(label: string | null, fraction?: number): void;
  setCard(summary: unknown): boolean;
  fail(message: string): void;
  finish(): void;
}

const noopBoot: BootApi = {
  brandDone: Promise.resolve(),
  hideBrand: () => undefined,
  setProgress: () => undefined,
  setCard: () => false,
  fail: (m) => console.error(m),
  finish: () => document.getElementById('boot-loader')?.remove(),
};
const boot: BootApi = (window as unknown as { __sfBoot?: BootApi }).__sfBoot ?? noopBoot;

async function start(): Promise<void> {
  const app = new App();
  uiHooks.sound = (id, isUi) => app.audio.play(id, { isUi: isUi ?? false });
  uiHooks.haptic = (ms) => app.audio.haptic(ms);
  uiHooks.toast = (msg) => app.router.toast(msg);
  uiHooks.isBusy = () => app.router.busy;
  registerScreens(app.router);

  // When the brand finishes before loading does, reveal the loading scene.
  let ready = false;
  void boot.brandDone.then(() => { if (!ready) boot.hideBrand(); });

  // ---- one active tab (before the save is read or written)
  let removeBlocker: (() => void) | null = null;
  let started = false;
  const guard = new TabGuard({
    onActive: async (afterTakeover) => {
      app.save.setReadOnly(false);
      if (afterTakeover) {
        await app.save.reload();
        removeBlocker?.();
        removeBlocker = null;
        if (started) await app.router.go('menu', {}, { replace: true });
      }
    },
    onBlocked: () => {
      app.save.setReadOnly(true);
      removeBlocker = showTabBlocker('blocked', () => void guard.takeOver());
    },
    onReleased: async () => {
      await app.save.flush();
      app.save.setReadOnly(true);
      if (app.router.currentId === 'play') await app.router.go('menu', {}, { replace: true });
      removeBlocker = showTabBlocker('released', () => void guard.takeOver());
    },
  });
  await guard.start();

  // ---- real loading
  boot.setProgress('Opening your save…', 0.04);
  await app.save.load();
  boot.setCard(buildSummary(app.save.data));
  boot.setProgress('Fetching the art…', 0.1);
  // Fonts first so canvas text and measurements are right (fallbacks are safe if they fail).
  const fonts = Promise.race([
    Promise.all([document.fonts.load('700 20px Fredoka'), document.fonts.load('400 20px "Luckiest Guy"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => undefined);
  const failed = await app.boot((p) => boot.setProgress(p < 1 ? `Polishing the ice… ${Math.round(p * 100)}%` : 'Building the arena…', 0.1 + p * 0.8), { saveLoaded: true });
  if (failed.length > 0) {
    boot.fail(`Some game art couldn't be downloaded (${failed.length} file${failed.length === 1 ? '' : 's'}). Check your connection and try again — your progress is safe.`);
    return;
  }
  boot.setProgress('Waking up the penguins…', 0.94);
  await fonts;
  // Titles that existing saves already earned (reliable counters only).
  evaluateProgressTitles(app.save, Date.now());
  writeSummary(app.save.data);
  app.game.scene.start('backdrop', { reducedMotion: () => app.settings.get().reducedMotion, dpr: () => app.dpr(), quality: () => app.settings.get().quality, theme: () => app.menuTheme.current });
  app.quests.refresh();

  const hash = location.hash.replace(/^#\/?/, '');
  const first = SAFE_DEEP_LINKS.includes(hash) ? hash : 'menu';
  await app.router.go(first);
  boot.setProgress('Ready!', 1);
  ready = true;
  started = true;
  await boot.brandDone;
  boot.finish();

  // Keep the display-only summary in sync with identity/progress/title changes.
  let summaryTimer = 0;
  app.save.changes.on('change', () => {
    window.clearTimeout(summaryTimer);
    summaryTimer = window.setTimeout(() => {
      writeSummary(app.save.data);
      for (const t of evaluateProgressTitles(app.save, Date.now())) app.router.toast(`Title earned: “${t.name}”`);
    }, 600);
  });

  // Hash edits / same-page links (#/daily …) switch screens too — never out
  // of gameplay (leaving a level always goes through its own pause/leave UI).
  window.addEventListener('hashchange', () => {
    const target = location.hash.replace(/^#\/?/, '');
    const current = app.router.currentId;
    if (current === 'play' || app.router.busy) return;
    const next = SAFE_DEEP_LINKS.includes(target) ? target : target === '' ? 'menu' : null;
    if (next && next !== current) void app.router.go(next);
  });

  // Persist important state before the page goes away.
  window.addEventListener('pagehide', () => void app.save.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void app.save.flush();
  });
  if (import.meta.env.DEV) (window as unknown as { __sf: App }).__sf = app;
}

start().catch((err: unknown) => {
  console.error(err);
  boot.fail('Something went wrong while loading. Please try again — your progress is safe.');
});
