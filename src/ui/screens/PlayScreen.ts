/**
 * Play — the in-level screen: HUD, touch controls, danger vignette, pause,
 * and the result flows (falling-trophy victory, 4-option failure, OUTMATCHED
 * for Ranked). Mode behaviour comes from a PlayDriver.
 */
import { CONTINUE_COST_ICICLES } from '../../config/economy';
import { WARNING } from '../../config/gameplay';
import { formatTime } from '../../core/format';
import type { HudSnapshot } from '../../gameplay/session';
import type { GameSession } from '../../gameplay/session';
import type { PlayDriver } from '../../progression/drivers';
import { economyBonus, gameplayModifiers } from '../../progression/hoods';
import { newRunId, type ResultSummary, type RunOutcome } from '../../progression/results';
import { waddleFrame } from '../../profile/waddles';
import { drawPaperStar, drawTrophy } from '../../art/procedural';
import { animate, SPRING, SpringTransform, ticker } from '../anim';
import { iceButton, woodButton, setDisabled } from '../components/buttons';
import { currencyIcon, CurrencyBar } from '../components/currency';
import { DangerVignette, FishTracker, StaminaMeter, TimerBlock } from '../components/hud';
import { TouchControls } from '../components/touchControls';
import { canvasImg, h, sprite, wait } from '../dom';
import { Screen, type ScreenParams } from '../screen';
import type { App } from '../../app';
import type { Router } from '../router';

const WIN_TITLES = ['FISH-TASTIC!', 'STASHED IT!', 'WADDLE-ICIOUS!', 'SLIPPERY SUCCESS!', 'FIN-CREDIBLE!', 'NICE DRIBBLING!'];
const FAIL_TITLES = ['FISH TRAGICALLY EATEN!', 'OH NO, MY FISH!', 'NOM NOM… NOT YOURS.'];

export class PlayScreen extends Screen {
  readonly id = 'play';
  override curtain = true;
  override backdrop = null;
  private driver: PlayDriver;
  private session!: GameSession;
  private stamina!: StaminaMeter;
  private timer!: TimerBlock;
  private tracker!: FishTracker;
  private vignette!: DangerVignette;
  private touch: TouchControls | null = null;
  private overlay: HTMLElement | null = null;
  private banner!: HTMLElement;
  private hud!: HTMLElement;
  private runId = newRunId();
  private continued = false;
  private handled: 'none' | 'won' | 'failed' = 'none';
  private lastDanger = 0;

  constructor(app: App, router: Router, params: ScreenParams) {
    super(app, router, params);
    this.driver = params.driver as PlayDriver;
    this.music = this.driver.musicSlot;
  }

  build(): void {
    const s = this.app.save.data;
    this.el.className = 'screen play-screen';
    const best = s.bestTimes[this.driver.bestKey] ?? null;
    this.stamina = new StaminaMeter();
    this.timer = new TimerBlock(best, this.driver.seedCode);
    this.tracker = new FishTracker(this.driver.level.fishRequired, this.driver.level.fish.length);
    this.vignette = new DangerVignette(() => this.app.settings.get().warningIntensity, () => this.app.settings.get().reducedMotion);
    const pause = iceButton('', { round: true, label: 'Pause', class: 'pause-btn', icon: h('span', { class: 'pause-ico', attrs: { 'aria-hidden': 'true' } }, h('i'), h('i')), sound: 'clickSoft', onActivate: () => this.session.setPaused(true) });
    const levelBadge = h('div', { class: 'hud-level ice-slab' }, h('div', { class: 'hud-level-main', text: this.driver.label }), h('div', { class: 'hud-level-sub', text: this.driver.sublabel }));
    this.hud = h('div', { class: 'hud' },
      h('div', { class: 'hud-left' }, this.timer.el),
      h('div', { class: 'hud-center' }, this.stamina.el),
      h('div', { class: 'hud-right' }, h('div', { class: 'hud-right-row' }, levelBadge, pause), this.tracker.el),
    );
    this.banner = h('div', { class: 'ready-banner', attrs: { 'aria-live': 'assertive' } });
    this.el.append(this.vignette.el, this.hud, this.banner);
    const hint = this.driver.level.tutorial?.hint;
    if (hint) {
      const hintEl = h('div', { class: 'tutorial-hint paper-panel', attrs: { role: 'note' } }, h('span', { class: 'hint-pin', attrs: { 'aria-hidden': 'true' } }), hint);
      this.el.append(hintEl);
      // Step out of the way once the player has read it and started moving.
      this.d.timeout(() => hintEl.classList.add('faded'), 7000);
    }
    if (this.wantsTouch()) this.enableTouch();
    else this.d.listen(window, 'pointerdown', (e) => { if (e.pointerType === 'touch') this.enableTouch(); });

    const hoodId = s.hoods.equipped;
    const normalized = this.driver.normalized;
    this.session = this.app.startGame({
      level: this.driver.level,
      mode: this.driver.mode,
      modifiers: gameplayModifiers(hoodId, normalized),
      hard: this.driver.hard,
      normalized,
      penguinFrame: waddleFrame(s.waddles.selected),
      hoodId,
    });
    this.d.add(this.session.events.on('pauseChanged', (p) => (p ? this.showPause() : this.hidePause())));
    this.d.add(this.session.events.on('sim', (e) => {
      if (e.type === 'fishEaten') this.flashFishLost();
    }));
    this.d.frameLoop((dt) => this.frame(dt));
  }

  override async enter(): Promise<void> {
    await super.enter();
    void this.readyBanner();
  }

  private wantsTouch(): boolean {
    const m = this.app.settings.get().touchControls;
    if (m === 'on') return true;
    if (m === 'off') return false;
    try {
      return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    } catch {
      return false;
    }
  }

  private enableTouch(): void {
    if (this.touch || this.app.settings.get().touchControls === 'off') return;
    this.touch = new TouchControls(this.app.input, this.app.settings.get().swapTouchSides, () => this.app.audio.unlock());
    this.el.append(this.touch.el);
    this.el.classList.add('has-touch');
    this.d.add(() => this.touch?.destroy());
  }

  private async readyBanner(): Promise<void> {
    this.banner.textContent = 'READY?';
    this.banner.className = 'ready-banner show';
    while (!this.session.started && !this.d.isDisposed) await wait(50);
    if (this.d.isDisposed) return;
    this.banner.textContent = 'WADDLE!';
    this.banner.className = 'ready-banner show go';
    this.app.audio.play('click', { pitch: 1.4 });
    await wait(650);
    this.banner.className = 'ready-banner';
  }

  private frame(dt: number): void {
    const snap: HudSnapshot = this.session.snapshot();
    this.timer.update(snap);
    this.stamina.update(snap, dt);
    this.tracker.update(snap);
    this.vignette.update(snap.danger, dt, WARNING.pulseHzFar, WARNING.pulseHzNear, WARNING.opacityFar, WARNING.opacityNear);
    this.touch?.setSprintAvailable(snap.canSprint, snap.staminaState === 'low');
    if (snap.danger > 0.65 && this.lastDanger <= 0.65) this.app.audio.play('danger');
    this.lastDanger = snap.danger;
    if (snap.status === 'won' && this.handled === 'none') {
      this.handled = 'won';
      void this.onWin();
    } else if (snap.status === 'failed' && this.handled === 'none') {
      this.handled = 'failed';
      void this.onFail();
    }
  }

  private flashFishLost(): void {
    this.tracker.el.classList.remove('lost');
    void this.tracker.el.offsetWidth;
    this.tracker.el.classList.add('lost');
  }

  private outcome(): RunOutcome {
    const sim = this.session.sim;
    return {
      runId: this.runId,
      timeMs: sim.timeMs,
      stats: { ...sim.stats },
      continued: this.continued,
      stashed: sim.stashedValue,
      required: sim.required,
      hadEnemies: sim.enemies.length > 0,
    };
  }

  // ------------------------------------------------------------------ pause

  private showPause(): void {
    if (this.overlay || this.handled !== 'none') return;
    this.touch?.releaseAll();
    const st = this.app.settings;
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const b = iceButton(`${label}: ${get() ? 'ON' : 'OFF'}`, { sound: 'settings', onActivate: () => { set(!get()); b.querySelector('span')!.textContent = `${label}: ${get() ? 'ON' : 'OFF'}`; } });
      return b;
    };
    const panel = h('div', { class: 'pause-panel ice-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' } },
      h('h2', { class: 'title-ice', text: 'PAUSED' }),
      h('p', { class: 'pause-sub', text: `${this.driver.label} · ${formatTime(this.session.sim.timeMs)}` }),
      h('div', { class: 'pause-actions' },
        woodButton('RESUME', { variant: 'green', size: 'big', onActivate: () => this.session.setPaused(false) }),
        woodButton('RESTART', { onActivate: () => this.restart() }),
        woodButton('LEAVE', { variant: 'red', onActivate: () => this.exitLevel() }),
      ),
      h('div', { class: 'pause-quick' },
        toggle('Music', () => st.get().musicOn, (v) => st.update({ musicOn: v })),
        toggle('Sounds', () => st.get().sfxVolume > 0, (v) => st.update({ sfxVolume: v ? 0.85 : 0 })),
        toggle('Shake', () => st.get().screenShake > 0, (v) => st.update({ screenShake: v ? 0.7 : 0 })),
      ),
      h('p', { class: 'pause-tip', text: 'Tip: Esc / P pauses. The stopwatch only counts while you play.' }),
    );
    this.overlay = h('div', { class: 'result-layer' }, h('div', { class: 'dim' }), panel);
    this.el.append(this.overlay);
    void animate(panel, [{ opacity: 0, transform: 'scale(0.85) translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.34,1.56,0.64,1)' });
    panel.querySelector<HTMLElement>('button')?.focus();
  }

  private hidePause(): void {
    if (!this.overlay || this.handled !== 'none') return;
    const o = this.overlay;
    this.overlay = null;
    void animate(o, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).then(() => o.remove());
  }

  // ------------------------------------------------------------------ navigation

  private restart(): void {
    void this.router.go('play', { driver: this.driver.retry() }, { replace: true });
  }

  private exitLevel(): void {
    void this.router.go(this.driver.exit.screen, this.driver.exit.params ?? {}, { replace: true });
  }

  override onBack(): void {
    this.session.setPaused(true);
  }

  override destroy(): void {
    this.app.stopGame();
    super.destroy();
  }

  // ------------------------------------------------------------------ victory

  private async onWin(): Promise<void> {
    this.touch?.releaseAll();
    this.app.input.setEnabled(false);
    const summary = this.driver.complete(this.outcome());
    await wait(450);
    if (this.d.isDisposed) return;
    this.app.audio.playMusic('victory');
    const layer = h('div', { class: 'result-layer victory' }, h('div', { class: 'dim soft' }));
    this.overlay?.remove();
    this.overlay = layer;
    this.el.append(layer);
    this.hud.classList.add('faded');

    // --- trophy drop (anticipation → whoosh → fall → impact → squash → wobble)
    const stage = h('div', { class: 'victory-stage' });
    const penguin = h('div', { class: 'victory-penguin' }, sprite(waddleFrame(this.app.save.data.waddles.selected), { height: 120 }));
    const trophyImg = canvasImg(drawTrophy(150), 'trophy-img', 'Trophy');
    const trophy = h('div', { class: 'trophy-drop' }, trophyImg);
    stage.append(h('div', { class: 'victory-shadow' }), penguin, trophy);
    layer.append(stage);
    const pst = new SpringTransform(penguin, SPRING.wobbly);
    const fast = ticker.reducedMotion;
    if (!fast) {
      trophy.style.transform = 'translateY(-60vh)';
      await wait(80);
      // Gets briefly stuck at the top edge...
      await animate(trophy, [{ transform: 'translateY(-60vh) rotate(0deg)' }, { transform: 'translateY(-52vh) rotate(-8deg)' }, { transform: 'translateY(-54vh) rotate(7deg)' }, { transform: 'translateY(-53vh) rotate(-4deg)' }, { transform: 'translateY(-53vh) rotate(0deg)' }], { duration: 520, easing: 'ease-in-out' });
      this.app.audio.play('trophyWhoosh');
      await animate(trophy, [{ transform: 'translateY(-53vh) rotate(0deg)' }, { transform: 'translateY(0) rotate(2deg)' }], { duration: 330, easing: 'cubic-bezier(0.55,0,1,0.45)' });
    }
    this.app.audio.play('trophy');
    this.app.audio.haptic(40);
    pst.snap({ s: 1 });
    pst.set({ sx: 1.35, sy: 0.6 });
    await wait(fast ? 0 : 90);
    pst.set({ sx: 1, sy: 1 });
    pst.kick({ rot: 260 });
    void animate(trophy, [{ transform: 'translateY(0)' }, { transform: 'translateY(-26px) rotate(-6deg)' }, { transform: 'translateY(0) rotate(0deg)' }], { duration: 420, easing: 'ease-out' });
    this.confetti(layer);
    this.app.audio.play('victory');

    // --- result card
    const card = this.resultCard(summary);
    layer.append(card);
    await animate(card, [{ opacity: 0, transform: 'translateY(40px) scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(0.34,1.56,0.64,1)' });
    await this.revealStars(card.querySelector('.stars-row')!, summary.stars);
    const rewardEl = card.querySelector<HTMLElement>('.result-rewards');
    if (rewardEl) {
      rewardEl.classList.add('show');
      const r = rewardEl.getBoundingClientRect();
      const bar = card.querySelector('.currency-bar') as HTMLElement | null;
      void bar;
      void r;
    }
    card.querySelector<HTMLElement>('.result-actions button')?.focus({ preventScroll: true });
  }

  private resultCard(summary: ResultSummary): HTMLElement {
    const next = this.driver.next();
    const title = WIN_TITLES[Math.floor(Math.random() * WIN_TITLES.length)]!;
    const stars = h('div', { class: 'stars-row', attrs: { 'aria-label': `${summary.stars} of 5 Excellence Stars` } });
    for (let i = 0; i < 5; i++) stars.append(h('div', { class: 'star-slot' }, canvasImg(drawPaperStar(i * 7 + 3, 96, false), 'star-empty')));
    const times = h('div', { class: 'result-times' },
      h('div', { class: 'rt' }, h('span', { class: 'rt-k', text: 'TIME' }), h('span', { class: 'rt-v', text: formatTime(summary.timeMs) })),
      h('div', { class: 'rt' }, h('span', { class: 'rt-k', text: 'BEST' }), h('span', { class: 'rt-v', text: formatTime(summary.newBest ? summary.timeMs : summary.previousBestMs) })),
      summary.newBest ? h('div', { class: 'new-best-stamp', text: 'NEW BEST!' }) : null,
    );
    const rewards = h('div', { class: 'result-rewards' });
    for (const c of ['icicles', 'shards', 'fish'] as const) {
      const v = summary.rewards[c];
      if (v) rewards.append(h('div', { class: 'reward-chip' }, currencyIcon(c, 28), h('b', { text: `+${v}` })));
    }
    if (summary.milestone) rewards.append(h('div', { class: 'reward-chip milestone' }, h('span', { text: '🍦' }), h('b', { text: summary.milestone.label })));
    const notes = h('div', { class: 'result-notes' }, ...summary.notes.map((n) => h('div', { class: 'note', text: n })));
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    const actions = h('div', { class: 'result-actions' },
      next ? woodButton(this.driver.mode === 'infinite' ? 'NEXT LEVEL' : 'NEXT', { variant: 'green', size: 'big', onActivate: () => void this.router.go('play', { driver: next }, { replace: true }) }) : null,
      woodButton('RETRY', { onActivate: () => this.restart() }),
      woodButton('MENU', { onActivate: () => this.exitLevel() }),
    );
    // Fly the earned Icicles from the reward chip to the counter after the stars land.
    setTimeout(() => {
      const chip = rewards.querySelector('.reward-chip');
      if (chip && summary.rewards.icicles) {
        const r = chip.getBoundingClientRect();
        void bar.flyTo('icicles', { x: r.left + 20, y: r.top + 14 });
      }
    }, 1400);
    return h('div', { class: 'result-card ice-panel', attrs: { role: 'dialog', 'aria-label': 'Level complete' } },
      h('div', { class: 'result-top' }, bar.el),
      h('h2', { class: 'title-ice result-title', text: title }),
      stars, times, rewards, notes, actions,
    );
  }

  private async revealStars(row: HTMLElement, count: number): Promise<void> {
    const slots = [...row.querySelectorAll<HTMLElement>('.star-slot')];
    for (let i = 0; i < count; i++) {
      await wait(ticker.reducedMotion ? 0 : 230);
      const img = canvasImg(drawPaperStar(i * 13 + 5 + count, 96, true), 'star-earned');
      const tilt = (Math.random() - 0.5) * 30;
      slots[i]!.append(img);
      this.app.audio.play('star', { intensity: i / 4 });
      void animate(img, [
        { transform: `translateY(-60px) scale(1.8) rotate(${tilt * 3}deg)`, opacity: 0 },
        { transform: `translateY(4px) scale(0.92) rotate(${tilt * 0.6}deg)`, opacity: 1, offset: 0.7 },
        { transform: `translateY(0) scale(1) rotate(${tilt * 0.4}deg)`, opacity: 1 },
      ], { duration: 380, easing: 'ease-out' });
    }
  }

  private confetti(layer: HTMLElement): void {
    if (ticker.reducedMotion) return;
    const colors = ['#f7c531', '#ef4f6a', '#47c28b', '#5fd4ff', '#9b5de5', '#ffffff'];
    for (let i = 0; i < 46; i++) {
      const c = h('div', { class: 'confetti' });
      c.style.background = colors[i % colors.length]!;
      c.style.left = `${Math.random() * 100}%`;
      layer.append(c);
      const dx = (Math.random() - 0.5) * 220, rot = (Math.random() - 0.5) * 1080;
      void animate(c, [{ transform: 'translate(0,-10vh) rotate(0deg)', opacity: 1 }, { transform: `translate(${dx}px, 105vh) rotate(${rot}deg)`, opacity: 0.9 }], { duration: 1800 + Math.random() * 1600, easing: 'cubic-bezier(0.25,0.1,0.5,1)', delay: Math.random() * 400 }).then(() => c.remove());
    }
  }

  // ------------------------------------------------------------------ failure

  private async onFail(): Promise<void> {
    this.touch?.releaseAll();
    this.app.input.setEnabled(false);
    this.driver.failed(this.outcome());
    await wait(900);
    if (this.d.isDisposed) return;
    if (this.driver.mode === 'ranked') return this.showOutmatched();
    this.app.audio.playMusic('defeat');
    this.app.audio.play('defeat');
    setTimeout(() => this.app.audio.play('crying'), 600);
    const discount = economyBonus(this.app.save.data.hoods.equipped, 'recoveryUtility');
    const cost = Math.round(CONTINUE_COST_ICICLES * discount);
    const ad = this.app.ads.availability('failure_continue');
    const balance = this.app.wallet.balance('icicles');
    const crying = h('div', { class: 'cry-penguin' }, sprite(waddleFrame(this.app.save.data.waddles.selected), { height: 110 }), h('span', { class: 'tear l' }), h('span', { class: 'tear r' }));
    const adBtn = woodButton(h('span', { class: 'two-line' }, h('b', { text: 'CONTINUE' }), h('small', { text: 'Watch a rewarded ad' })), {
      label: 'Continue by watching a rewarded ad',
      disabled: !ad.available,
      disabledReason: ad.reason,
      onActivate: () => void this.continueViaAd(),
    });
    const icicleBtn = woodButton(h('span', { class: 'two-line' }, h('b', { text: 'CONTINUE' }), h('small', {}, `${cost.toLocaleString('en-US')} Icicles`)), {
      label: `Continue for ${cost} Icicles`,
      icon: currencyIcon('icicles', 30),
      variant: 'gold',
      disabled: balance < cost,
      disabledReason: `You need ${cost.toLocaleString('en-US')} Icicles (you have ${balance.toLocaleString('en-US')}).`,
      sound: 'chaChing',
      onActivate: () => this.continueViaIcicles(cost),
    });
    const card = h('div', { class: 'result-card fail-card ice-panel', attrs: { role: 'dialog', 'aria-label': 'Level failed' } },
      h('h2', { class: 'title-ice result-title fail', text: FAIL_TITLES[Math.floor(Math.random() * FAIL_TITLES.length)]! }),
      h('div', { class: 'fail-art' }, crying, sprite('fish_eaten_icon', { width: 110 })),
      h('p', { class: 'fail-sub', text: 'Too many fish were eaten to finish this level. What now?' }),
      h('div', { class: 'fail-actions' },
        h('div', { class: 'fail-option' }, adBtn, !ad.available ? h('div', { class: 'fail-note', text: ad.reason }) : null),
        h('div', { class: 'fail-option' }, icicleBtn, h('div', { class: 'fail-note', text: balance < cost ? `You have ${balance.toLocaleString('en-US')} Icicles.` : 'Eaten fish return, enemies reset, the stopwatch keeps going.' })),
        h('div', { class: 'fail-row' },
          woodButton('RESTART', { variant: 'green', onActivate: () => this.restart() }),
          woodButton('LEAVE', { variant: 'red', onActivate: () => this.exitLevel() }),
        ),
      ),
    );
    const layer = h('div', { class: 'result-layer fail' }, h('div', { class: 'dim' }), card);
    this.overlay?.remove();
    this.overlay = layer;
    this.el.append(layer);
    this.hud.classList.add('faded');
    await animate(card, [{ opacity: 0, transform: 'translateY(30px) rotate(-2deg) scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(0.34,1.56,0.64,1)' });
    void setDisabled;
  }

  private resumeAfterContinue(): void {
    this.continued = true;
    this.handled = 'none';
    this.overlay?.remove();
    this.overlay = null;
    this.hud.classList.remove('faded');
    this.session.continueAfterFail();
    this.app.audio.playMusic(this.driver.musicSlot);
    this.app.audio.play('puff');
  }

  private continueViaIcicles(cost: number): void {
    const ok = this.app.wallet.spend(`continue:${this.runId}:${this.session.sim.steps}`, { icicles: cost });
    if (!ok) {
      this.router.toast('Not enough Icicles.');
      return;
    }
    this.resumeAfterContinue();
  }

  private async continueViaAd(): Promise<void> {
    const r = await this.app.ads.showRewarded('failure_continue');
    if (r.status === 'rewarded') {
      // Only the provider's qualifying reward event continues — once per reward id.
      if (this.app.save.transact(`adcontinue:${r.rewardId}`, () => undefined)) this.resumeAfterContinue();
    } else if (r.status === 'cancelled') {
      this.router.toast('Ad closed early — no continue granted.');
    } else {
      this.router.toast(r.reason);
    }
  }

  // ------------------------------------------------------------------ ranked loss

  private showOutmatched(): void {
    this.app.audio.playMusic('outmatched');
    this.app.audio.play('outmatched');
    const layer = h('div', { class: 'result-layer outmatched' }, h('div', { class: 'dim' }),
      h('div', { class: 'outmatched-card' },
        h('div', { class: 'outmatched-title', attrs: { role: 'heading', 'aria-level': '2' } }, ...'OUTMATCHED'.split('').map((ch, i) => h('span', { text: ch, style: { animationDelay: `${i * 60}ms` } }))),
        h('div', { class: 'outmatched-penguin' }, sprite(waddleFrame(this.app.save.data.waddles.selected), { height: 120 })),
        h('p', { text: 'Same seed. Same fish. They were just a little more slippery this time.' }),
        h('div', { class: 'result-actions' }, woodButton('BACK', { onActivate: () => this.exitLevel() })),
      ));
    this.overlay?.remove();
    this.overlay = layer;
    this.el.append(layer);
  }
}
