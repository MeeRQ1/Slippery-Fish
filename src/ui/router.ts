/**
 * Router — explicit screen state machine with smooth, input-locked
 * transitions. Full screens replace each other (with backdrop crossfades and
 * music crossfades); sign screens hang over the current screen.
 *
 * Refresh/deep links: full screens may declare a `hash`; on load the router
 * restores safe screens (never gameplay) from location.hash — static hosting
 * friendly (no server routes needed).
 */
import type { App } from '../app';
import { TRANSITIONS } from '../config/ui';
import { animate } from './anim';
import { h } from './dom';
import type { Screen, ScreenParams } from './screen';

export type ScreenFactory = (app: App, router: Router, params: ScreenParams) => Screen;

interface HistoryEntry { id: string; params: ScreenParams }

export class Router {
  private registry = new Map<string, ScreenFactory>();
  private current: Screen | null = null;
  private sign: Screen | null = null;
  private history: HistoryEntry[] = [];
  private blocker: HTMLElement;
  private curtain: HTMLElement;
  private toastLayer: HTMLElement;
  busy = false;

  constructor(private readonly app: App) {
    this.blocker = h('div', { class: 'input-blocker', attrs: { 'aria-hidden': 'true' } });
    this.curtain = h('div', { class: 'curtain', attrs: { 'aria-hidden': 'true' } });
    this.toastLayer = h('div', { class: 'toast-layer', attrs: { role: 'status', 'aria-live': 'polite' } });
    document.body.append(this.curtain, this.toastLayer);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat || this.busy) return;
      if (this.sign) {
        e.preventDefault();
        this.sign.onBack();
      } else if (this.current && this.current.id !== 'play') {
        this.current.onBack();
      }
    });
  }

  register(id: string, factory: ScreenFactory): void {
    this.registry.set(id, factory);
  }

  get currentId(): string | null {
    return this.current?.id ?? null;
  }

  get signOpen(): boolean {
    return this.sign !== null;
  }

  private lock(on: boolean): void {
    this.busy = on;
    if (on) document.body.append(this.blocker);
    else this.blocker.remove();
  }

  /** Navigate to a full screen or open a sign. Ignored while a transition runs. */
  async go(id: string, params: ScreenParams = {}, opts: { replace?: boolean; noHistory?: boolean } = {}): Promise<void> {
    if (this.busy) return;
    const factory = this.registry.get(id);
    if (!factory) {
      console.warn(`[router] unknown screen ${id}`);
      return;
    }
    this.lock(true);
    try {
      const next = factory(this.app, this, params);
      await next.build();
      if (next.kind === 'sign') {
        if (this.sign) {
          await this.sign.leave();
          this.sign.destroy();
        }
        this.app.uiRoot.append(next.el);
        this.current?.el.setAttribute('inert', '');
        this.sign = next;
        await next.enter();
        return;
      }
      if (this.sign) {
        await this.sign.leave();
        this.sign.destroy();
        this.sign = null;
      }
      const useCurtain = next.curtain || this.current?.curtain === true;
      if (useCurtain) await this.curtainIn();
      if (next.backdrop) void this.app.backdrop().setMode(next.backdrop.mode, next.backdrop.opts);
      if (next.music) this.app.audio.playMusic(next.music);
      if (this.current) {
        if (!useCurtain) await this.current.leave();
        this.current.destroy();
      }
      this.current = next;
      this.app.uiRoot.append(next.el);
      if (!opts.noHistory) {
        if (opts.replace) this.history.pop();
        this.history.push({ id, params });
        if (this.history.length > 20) this.history.shift();
      }
      try {
        const hash = next.hash ? `#/${next.hash}` : '';
        if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
      } catch {
        /* sandboxed iframes may block history */
      }
      if (useCurtain) {
        void next.enter();
        await this.curtainOut();
      } else {
        await next.enter();
      }
    } finally {
      this.lock(false);
    }
  }

  async closeSign(): Promise<void> {
    if (this.busy || !this.sign) return;
    this.lock(true);
    try {
      const s = this.sign;
      this.sign = null;
      await s.leave();
      s.destroy();
      this.current?.el.removeAttribute('inert');
      this.current?.onReveal();
    } finally {
      this.lock(false);
    }
  }

  /** Back to the previous full screen (main menu is the root). */
  async back(): Promise<void> {
    if (this.sign) return this.closeSign();
    if (this.history.length <= 1) return this.go('menu', {}, { replace: true });
    this.history.pop();
    const prev = this.history.pop()!;
    return this.go(prev.id, prev.params);
  }

  private async curtainIn(): Promise<void> {
    await animate(this.curtain, [{ opacity: 0, transform: 'scale(1.08)' }, { opacity: 1, transform: 'scale(1)' }], { duration: TRANSITIONS.curtainInMs, easing: 'ease-in' });
  }

  private async curtainOut(): Promise<void> {
    await animate(this.curtain, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.06)' }], { duration: TRANSITIONS.curtainOutMs, easing: 'ease-out', delay: 60 });
  }

  toast(message: string, ms = 2600): void {
    const t = h('div', { class: 'toast', text: message });
    this.toastLayer.append(t);
    void animate(t, [{ opacity: 0, transform: 'translateY(12px) scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    setTimeout(() => {
      void animate(t, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 260, easing: 'ease-in' }).then(() => t.remove());
    }, ms);
  }
}
