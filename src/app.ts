/**
 * App — owns the long-lived systems and passes them explicitly to screens
 * (no hidden globals). Creates the Phaser game with DPR-aware sizing and
 * handles resize/orientation/visual-viewport changes without resetting state.
 */
import Phaser from 'phaser';
import { AudioManager } from './audio/audioManager';
import { InputManager } from './input/inputManager';
import { SaveManager } from './save/saveManager';
import { SettingsStore, type Settings } from './save/settings';
import { BootScene } from './scenes/BootScene';
import { BackdropScene } from './scenes/BackdropScene';
import { GameScene, type GameSceneData } from './scenes/GameScene';
import { GameSession, type SessionConfig } from './gameplay/session';
import { ticker } from './ui/anim';
import { Wallet } from './economy/wallet';
import { QuestService } from './quests/quests';
import { createAdService, type AdService } from './services/ads';
import { GuestAuthService, LocalOnlyCloudSave, type AuthService, type CloudSaveService } from './services/account';
import { DisabledPaymentService, type PaymentService } from './services/payments';
import { PrivacyManager } from './services/privacy';
import { RankedAdapter, type RankedService } from './services/ranked';
import { RemoteConfig } from './services/remoteConfig';
import type { DriverServices } from './progression/drivers';
import { Router } from './ui/router';

export class App {
  readonly settings = new SettingsStore();
  readonly save = new SaveManager();
  readonly input = new InputManager();
  readonly audio: AudioManager;
  readonly wallet: Wallet;
  readonly quests: QuestService;
  readonly ads: AdService = createAdService();
  readonly auth: AuthService = new GuestAuthService();
  readonly cloudSave: CloudSaveService = new LocalOnlyCloudSave();
  readonly payments: PaymentService = new DisabledPaymentService();
  readonly ranked: RankedService = new RankedAdapter();
  readonly remoteConfig = new RemoteConfig();
  readonly privacy: PrivacyManager;
  readonly router: Router;
  game!: Phaser.Game;
  readonly uiRoot: HTMLElement;
  private currentDpr = 1;
  private resizeRaf = 0;
  private session: GameSession | null = null;

  constructor() {
    this.audio = new AudioManager(this.settings.get());
    this.wallet = new Wallet(this.save);
    this.quests = new QuestService(this.save, this.wallet);
    this.privacy = new PrivacyManager(this.save);
    this.router = new Router(this);
    const ui = document.getElementById('ui');
    if (!ui) throw new Error('#ui root missing');
    this.uiRoot = ui;
    this.applySettings(this.settings.get());
    this.settings.changes.on('change', (s) => this.applySettings(s));
    // Audio may only start after an intentional gesture (autoplay policy).
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('touchend', unlock, { capture: true });
  }

  private applySettings(s: Readonly<Settings>): void {
    ticker.reducedMotion = s.reducedMotion;
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
    this.audio.applySettings(s as Settings);
    if (this.game) this.handleResize();
  }

  /** Device-pixel ratio used for the canvas, capped by quality for performance. */
  dpr(): number {
    return this.currentDpr;
  }

  private computeDpr(): number {
    const q = this.settings.get().quality;
    const native = window.devicePixelRatio || 1;
    const cap = q === 'low' ? 1 : q === 'medium' ? 1.5 : q === 'high' ? 2.5 : 2;
    return Math.max(1, Math.min(native, cap));
  }

  private viewportSize(): { w: number; h: number } {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    return { w: Math.max(200, w), h: Math.max(200, h) };
  }

  async boot(onProgress: (p: number) => void): Promise<void> {
    await this.save.load();
    this.currentDpr = this.computeDpr();
    const { w, h } = this.viewportSize();
    await new Promise<void>((resolve) => {
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game',
        backgroundColor: '#9fd2f2',
        banner: false,
        scale: { mode: Phaser.Scale.NONE, width: w * this.currentDpr, height: h * this.currentDpr, zoom: 1 / this.currentDpr },
        // All input is handled by the DOM layer; Phaser never captures events.
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        audio: { noAudio: true },
        render: { antialias: true, powerPreference: 'high-performance', roundPixels: false },
        scene: [],
      });
      this.game.scene.add('backdrop', BackdropScene, false);
      this.game.scene.add('game', GameScene, false);
      this.game.scene.add('boot', BootScene, true, { onProgress, onReady: () => resolve() });
    });
    window.addEventListener('resize', this.scheduleResize);
    window.visualViewport?.addEventListener('resize', this.scheduleResize);
    window.addEventListener('orientationchange', this.scheduleResize);
  }

  private scheduleResize = (): void => {
    if (this.resizeRaf) return;
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.handleResize();
    });
  };

  private handleResize(): void {
    if (!this.game) return;
    this.currentDpr = this.computeDpr();
    const { w, h } = this.viewportSize();
    this.game.scale.resize(w * this.currentDpr, h * this.currentDpr);
    this.game.scale.setZoom(1 / this.currentDpr);
  }

  /** Services handed to mode drivers (keeps progression logic UI-free). */
  get driverServices(): DriverServices {
    return { save: this.save, wallet: this.wallet, quests: this.quests, now: () => Date.now() };
  }

  backdrop(): BackdropScene {
    return this.game.scene.getScene('backdrop') as BackdropScene;
  }

  /** Starts a level. The backdrop sleeps while gameplay renders. */
  startGame(config: SessionConfig, onReady?: () => void): GameSession {
    this.stopGame();
    const session = new GameSession(config, this.input);
    this.session = session;
    if (this.game.scene.isActive('backdrop')) this.game.scene.sleep('backdrop');
    const data: GameSceneData = {
      session,
      settings: () => this.settings.get(),
      audio: this.audio,
      dpr: () => this.dpr(),
      ...(onReady ? { onReady } : {}),
    };
    this.game.scene.start('game', data);
    return session;
  }

  stopGame(): void {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    if (this.game.scene.isActive('game') || this.game.scene.isPaused('game')) this.game.scene.stop('game');
    if (this.game.scene.isSleeping('backdrop')) this.game.scene.wake('backdrop');
  }

  get activeSession(): GameSession | null {
    return this.session;
  }
}
