/**
 * Slippery Fish — entry point.
 * Loads fonts + styles, boots the App (save, Phaser, core atlases), wires UI
 * hooks, registers screens and shows the Main Menu (or a safe deep link).
 */
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/luckiest-guy/latin-400.css';
import './ui/styles.css';
import './ui/screens.css';
import './ui/panels.css';
import { App } from './app';
import { uiHooks } from './ui/uiHooks';
import { registerScreens, SAFE_DEEP_LINKS } from './ui/screens/registry';

const status = document.getElementById('boot-status');
const loader = document.getElementById('boot-loader');

async function start(): Promise<void> {
  const app = new App();
  uiHooks.sound = (id, isUi) => app.audio.play(id, { isUi: isUi ?? false });
  uiHooks.haptic = (ms) => app.audio.haptic(ms);
  uiHooks.toast = (msg) => app.router.toast(msg);
  uiHooks.isBusy = () => app.router.busy;
  registerScreens(app.router);

  // Fonts first so canvas text and measurements are right (fallbacks are safe if they fail).
  const fonts = Promise.race([
    Promise.all([document.fonts.load('700 20px Fredoka'), document.fonts.load('400 20px "Luckiest Guy"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => undefined);
  await app.boot((p) => {
    if (status) status.textContent = p < 1 ? `Polishing the ice… ${Math.round(p * 100)}%` : 'Waddling in…';
  });
  await fonts;
  app.game.scene.start('backdrop', { reducedMotion: () => app.settings.get().reducedMotion, dpr: () => app.dpr(), quality: () => app.settings.get().quality });
  app.quests.refresh();

  const hash = location.hash.replace(/^#\/?/, '');
  const first = SAFE_DEEP_LINKS.includes(hash) ? hash : 'menu';
  await app.router.go(first);
  loader?.classList.add('gone');
  setTimeout(() => loader?.remove(), 600);

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
  if (status) status.textContent = 'Something went wrong while loading. Please refresh the page.';
});
