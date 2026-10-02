/**
 * Screen base classes.
 *  - Screen: full dedicated screens (menus, modes, gameplay HUD).
 *  - SignScreen: hanging wooden sign submenus (Quests, Hoods, Profile,
 *    Settings, Purchases, Chests) — background dims, chains rattle, the sign
 *    drops, overshoots, swings, settles, THEN content appears.
 */
import type { App } from '../app';
import type { MusicSlot } from '../config/audio';
import { TRANSITIONS } from '../config/ui';
import { Disposer } from '../core/disposer';
import type { BackdropMode, BackdropOptions } from '../scenes/BackdropScene';
import { animate, SPRING, SpringTransform, ticker } from './anim';
import { iceButton } from './components/buttons';
import { h, wait } from './dom';
import type { Router } from './router';

export type ScreenParams = Record<string, unknown>;

export abstract class Screen {
  readonly el: HTMLElement;
  protected readonly d = new Disposer();
  kind: 'full' | 'sign' = 'full';
  /** Backdrop environment; null keeps whatever is showing (or gameplay). */
  backdrop: { mode: BackdropMode; opts?: BackdropOptions } | null = { mode: 'menu' };
  music: MusicSlot | null = 'main_menu';
  /** Use the snow curtain when entering/leaving (gameplay). */
  curtain = false;
  /** Location hash for refresh/deep links ('' = none). */
  hash = '';

  constructor(readonly app: App, readonly router: Router, readonly params: ScreenParams = {}) {
    this.el = h('div', { class: 'screen' });
  }

  abstract readonly id: string;
  abstract build(): void | Promise<void>;

  /** Fade/rise in; elements with [data-pop] pop in with a stagger. */
  async enter(): Promise<void> {
    const pops = [...this.el.querySelectorAll<HTMLElement>('[data-pop]')];
    for (const p of pops) p.style.opacity = '0';
    await animate(this.el, [{ opacity: 0, transform: 'translateY(14px) scale(0.985)' }, { opacity: 1, transform: 'none' }], { duration: TRANSITIONS.screenInMs, easing: 'cubic-bezier(0.22,1,0.36,1)' });
    this.el.style.transform = '';
    pops.forEach((p, i) => {
      setTimeout(() => {
        p.style.opacity = '';
        void animate(p, [{ opacity: 0, transform: 'scale(0.6) translateY(16px)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'ease-out' });
      }, ticker.reducedMotion ? 0 : i * TRANSITIONS.staggerMs);
    });
  }

  async leave(): Promise<void> {
    await animate(this.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(0.985)' }], { duration: TRANSITIONS.screenOutMs, easing: 'cubic-bezier(0.55,0,0.9,0.4)' });
  }

  /** Back/Escape behaviour. */
  onBack(): void {
    void this.router.back();
  }

  /** Called when a sign closes and this screen is revealed again. */
  onReveal(): void {
    /* optional */
  }

  destroy(): void {
    this.d.dispose();
    this.el.remove();
  }
}

export abstract class SignScreen extends Screen {
  override kind: 'full' | 'sign' = 'sign';
  override backdrop = null;
  override music: MusicSlot | null = null;
  protected board!: HTMLElement;
  protected content!: HTMLElement;
  private rig!: HTMLElement;
  private dimEl!: HTMLElement;
  private st!: SpringTransform;
  abstract readonly title: string;
  /** Extra class on the board for per-sign sizing. */
  protected boardClass = '';

  protected abstract buildContent(content: HTMLElement): void | Promise<void>;

  async build(): Promise<void> {
    this.el.className = 'screen sign-layer';
    this.dimEl = h('div', { class: 'dim', on: { click: () => this.onBack() } });
    const close = iceButton('', { round: true, label: 'Close', class: 'sign-close', icon: h('span', { class: 'x-icon', text: '✕' }), sound: 'back', onActivate: () => this.onBack() });
    this.content = h('div', { class: 'sign-content' });
    this.board = h('div', { class: `sign-board ${this.boardClass}`, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': this.title } },
      h('div', { class: 'sign-nail tl' }), h('div', { class: 'sign-nail tr' }), h('div', { class: 'sign-nail bl' }), h('div', { class: 'sign-nail br' }),
      h('div', { class: 'sign-header' }, h('h2', { class: 'title-wood', text: this.title })),
      close,
      this.content,
    );
    this.rig = h('div', { class: 'sign-rig' }, h('div', { class: 'sign-chain left' }), h('div', { class: 'sign-chain right' }), this.board);
    this.el.append(this.dimEl, this.rig);
    await this.buildContent(this.content);
  }

  override async enter(): Promise<void> {
    this.st = new SpringTransform(this.rig, SPRING.wood);
    this.content.style.opacity = '0';
    this.st.snap({ y: -window.innerHeight * 1.1, rot: 0 });
    void animate(this.dimEl, [{ opacity: 0 }, { opacity: 1 }], { duration: TRANSITIONS.signDimMs, easing: 'ease-out' });
    this.app.audio.play('chains');
    await wait(ticker.reducedMotion ? 0 : 90);
    this.st.set({ y: 0 });
    this.st.kick({ rot: (Math.random() < 0.5 ? -1 : 1) * 70 });
    setTimeout(() => this.app.audio.play('woodCreak'), 380);
    await wait(ticker.reducedMotion ? 0 : 520);
    this.app.audio.play('wood', );
    this.content.style.opacity = '';
    await animate(this.content, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    const first = this.board.querySelector<HTMLElement>('button, [tabindex="0"], input');
    first?.focus({ preventScroll: true });
  }

  override async leave(): Promise<void> {
    this.app.audio.play('chains');
    void animate(this.dimEl, [{ opacity: 1 }, { opacity: 0 }], { duration: TRANSITIONS.signCloseMs, easing: 'ease-in' });
    await animate(this.rig, [{ transform: this.rig.style.transform || 'none' }, { transform: `translateY(${-window.innerHeight * 1.15}px) rotate(-4deg)` }], { duration: TRANSITIONS.signCloseMs, easing: 'cubic-bezier(0.6,-0.2,0.9,0.5)' });
  }

  override onBack(): void {
    void this.router.closeSign();
  }
}
