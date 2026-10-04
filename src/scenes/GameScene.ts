/**
 * GameScene — renders a GameSession. Pure presentation: it reads simulation
 * state (interpolated between fixed steps) and reacts to SimEvents with
 * sprites, particles and camera feedback. All gameplay rules live in GameSim.
 */
import Phaser from 'phaser';
import { BANK_MARGIN, drawGlaze, drawSnowbanks, drawSurfacePatch, hexToInt } from '../art/procedural';
import { CAMERA, ENEMIES, ENEMY_EXPRESSION, FISH, GOAL, PLAYER } from '../config/gameplay';
import { OBSTACLES } from '../config/obstacles';
import { REGION_BY_ID, type RegionDef } from '../config/regions';
import { decorPool, groupsForRegion, type FrameMeta } from '../core/assets';
import { Rng, hash32 } from '../core/rng';
import type { EnemyEntity, FishEntity, SimEvent } from '../gameplay/sim';
import type { GameSession } from '../gameplay/session';
import type { AudioManager } from '../audio/audioManager';
import type { Settings } from '../save/settings';
import { addCanvasTexture, ensureProceduralTextures, loadAtlasGroups, loadStandaloneImages, tex } from './textures';
import { drawHood, HOOD_CANVAS } from '../art/hoodArt';
import { HOOD_BY_ID } from '../progression/hoods';
import { FENCE_COLORS, drawChick, drawCourtyard, drawFencePost, drawHeart, type ChickMood } from '../art/goalArt';
import { RING_DIRS, RING_SEGMENTS, doorPoint, isIglooSegment, isSolidSegment, openings, ringPoint } from '../gameplay/goal';

export interface GameSceneData {
  session: GameSession;
  settings: () => Readonly<Settings>;
  audio: AudioManager;
  dpr: () => number;
  /** Called once visuals are built and the first frame can render. */
  onReady?: () => void;
}

interface FishView { fish: FishEntity; img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; lines: Phaser.GameObjects.Image; angle: number; baseFrame: { key: string; frame?: string }; scale: number; entering: { t: number; x: number; y: number } | null; trailT?: number }
interface ChickView { img: Phaser.GameObjects.Image; x: number; y: number; phase: number; tint: number; mood: ChickMood }
type Expression = 'idle' | 'alert' | 'eager' | 'imminent';
interface EnemyView { enemy: EnemyEntity; root: Phaser.GameObjects.Container; img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; scale: number; lean: number; phase: number; alert: number; expr: Expression; exprHold: number; emote: Phaser.GameObjects.Image; voiceCd: number }
interface Particle { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; max: number; s0: number; s1: number; a0: number; a1: number; spin: number; gravity: number; active: boolean }
interface Flake { img: Phaser.GameObjects.Image; vx: number; vy: number; phase: number }

const DEPTH = { outside: -100, decorBack: -60, floor: -20, decal: -16, surface: -14, bank: -10, stash: -5, actors: 0, decorFront: 50000, fx: 60000, weather: 61000 } as const;

export class GameScene extends Phaser.Scene {
  private data_!: GameSceneData;
  private session!: GameSession;
  private region!: RegionDef;
  private playerRoot!: Phaser.GameObjects.Container;
  private playerInner!: Phaser.GameObjects.Container;
  private playerShadow!: Phaser.GameObjects.Image;
  private playerScale = 1;
  private fishViews: FishView[] = [];
  private enemyViews: EnemyView[] = [];
  private igloo!: Phaser.GameObjects.Image;
  private goalGlow!: Phaser.GameObjects.Image;
  private goalPlaque!: Phaser.GameObjects.Text;
  private chicks: ChickView[] = [];
  private cheerTimer = 0;
  private popups: Phaser.GameObjects.Text[] = [];
  private stashArrow: Phaser.GameObjects.Image | null = null;
  private particles: Particle[] = [];
  private skidTimer = 0;
  private lastPv = { x: 0, y: 0 };
  private flakes: Flake[] = [];
  private followMode = false;
  private cssPerUnit = 1;
  private textureKeys: string[] = [];
  private squashT = 0;
  private time0 = 0;
  private puffTimer = 0;
  private offEvents: Array<() => void> = [];
  private intro = { s: 1 };

  constructor() {
    super({ key: 'game' });
  }

  init(data: GameSceneData): void {
    this.data_ = data;
    this.session = data.session;
    this.region = REGION_BY_ID[data.session.config.level.region];
    this.fishViews = [];
    this.enemyViews = [];
    this.particles = [];
    this.flakes = [];
    this.textureKeys = [];
    this.stashArrow = null;
    this.chicks = [];
    this.popups = [];
    this.cheerTimer = 0;
    this.offEvents = [];
  }

  preload(): void {
    // Region decoration atlases are lazy-loaded; core atlases are loaded at boot.
    void loadAtlasGroups(this, ['gameplay', 'obstacles', ...groupsForRegion(this.region.id)]);
    void loadStandaloneImages(this, [this.region.floorTexture, this.region.outsideTexture].filter((k) => k.startsWith('tex_')));
  }

  create(): void {
    ensureProceduralTextures(this);
    const level = this.session.config.level;
    const pal = this.region.palette;
    const { width: W, height: H } = level.arena;
    const cam = this.cameras.main;
    cam.setBackgroundColor(pal.outside);
    this.time0 = this.time.now;

    // --- outside ground + scenery
    const outsideKey = this.region.outsideTexture;
    const ow = W + 2400, oh = H + 2400;
    const outside = this.add.tileSprite(W / 2, H / 2, ow, oh, tex(this, outsideKey).key).setDepth(DEPTH.outside);
    outside.setTileScale(0.7, 0.7);
    outside.setAlpha(outsideKey.startsWith('tex_water') || outsideKey.startsWith('tex_deep') ? 1 : 0.55);
    this.placeOutsideDecor(level.seed);

    // --- arena floor
    this.add.rectangle(W / 2, H / 2, W, H, hexToInt(pal.floor)).setDepth(DEPTH.floor - 1);
    const floor = this.add.tileSprite(W / 2, H / 2, W, H, tex(this, this.region.floorTexture).key).setDepth(DEPTH.floor);
    floor.setTileScale(0.9, 0.9);
    floor.setAlpha(pal.floorTextureAlpha);
    if (level.modifiers.includes('glazedIce')) {
      const glazeKey = `glaze_${level.id}_${Date.now()}`;
      this.textures.addCanvas(glazeKey, drawGlaze(W, H, hash32(level.seed) ^ 0x5f3759df));
      this.textureKeys.push(glazeKey);
      this.add.image(0, 0, glazeKey).setOrigin(0, 0).setScale(2).setDepth(DEPTH.floor + 1).setAlpha(0.7);
    }
    this.placeFloorDecals(level.seed);
    level.surfaces.forEach((s, i) => {
      const key = `surf_${level.id}_${i}`;
      this.textures.addCanvas(key, drawSurfacePatch(s.type, s.rx, s.ry, hash32(key)));
      this.textureKeys.push(key);
      this.add.image(s.x, s.y, key).setDepth(DEPTH.surface);
    });

    // --- snow banks (visual edge == collision edge)
    const bankKey = `bank_${level.id}_${Date.now()}`;
    this.textures.addCanvas(bankKey, drawSnowbanks(level, pal, hash32(level.seed)));
    this.textureKeys.push(bankKey);
    this.add.image(-BANK_MARGIN, -BANK_MARGIN, bankKey).setOrigin(0, 0).setDepth(DEPTH.bank);

    // --- goal: courtyard, fences, igloo, chicks
    this.buildGoal();

    // --- obstacles (Batch 4) with soft contact shadows
    for (const o of level.obstacles) {
      const def = OBSTACLES[o.type]!;
      const t = tex(this, def.sprite);
      const img = this.add.image(o.x, o.y, t.key, t.frame).setScale(o.scale).setFlipX(o.flip);
      img.setDepth(DEPTH.actors + o.y + img.displayHeight * 0.3);
      const sh = this.add.image(o.x, o.y + img.displayHeight * 0.36, 'proc_shadow').setDepth(DEPTH.surface + 1);
      sh.setDisplaySize(img.displayWidth * 1.05, img.displayHeight * 0.38).setAlpha(0.55);
    }

    // --- fish
    for (const f of this.session.sim.fish) {
      const cfgLen = f.cfg.radius * 2 * f.cfg.spriteLengthFactor;
      const t = tex(this, f.cfg.sprite);
      const img = this.add.image(f.body.x, f.body.y, t.key, t.frame);
      const scale = cfgLen / Math.max(1, img.width);
      img.setScale(scale);
      const sh = this.add.image(f.body.x, f.body.y + f.cfg.radius * 0.7, 'proc_shadow').setDisplaySize(cfgLen * 0.9, f.cfg.radius * 1.1).setAlpha(0.45);
      const lt = tex(this, 'fx_fish_speed_lines');
      const lines = this.add.image(f.body.x, f.body.y, lt.key, lt.frame).setScale(scale * 0.9).setAlpha(0).setDepth(DEPTH.surface + 2);
      this.fishViews.push({ fish: f, img, shadow: sh, lines, angle: 0, baseFrame: t, scale, entering: null });
    }

    this.makeFxTextures();
    // --- enemies
    for (const e of this.session.sim.enemies) {
      const cfg = ENEMIES[e.type];
      const t = tex(this, cfg.sprite);
      const img = this.add.image(0, 0, t.key, t.frame).setOrigin(0.5, 0.55);
      const scale = (cfg.radius * 2 * cfg.spriteScaleFactor) / Math.max(1, img.width);
      img.setScale(scale);
      const shadow = this.add.image(e.body.x, e.body.y + cfg.radius * 0.75, 'proc_shadow').setDisplaySize(cfg.radius * 2.4, cfg.radius * 0.9).setAlpha(0.5);
      const root = this.add.container(e.body.x, e.body.y, [img]);
      const emote = this.add.image(e.body.x, e.body.y, 'emote_alert').setVisible(false).setDepth(DEPTH.fx - 1);
      this.enemyViews.push({ enemy: e, root, img, shadow, scale, lean: 0, phase: Math.random() * 6, alert: 0, expr: 'idle', exprHold: 0, emote, voiceCd: 0 });
    }

    // --- player penguin (round, single-sided, rotates while moving)
    const cfg = this.session.config;
    const pt = tex(this, cfg.penguinFrame);
    const pimg = this.add.image(0, 0, pt.key, pt.frame).setOrigin(0.5, 0.5);
    this.playerScale = (PLAYER.radius * 2 * 1.2) / Math.max(1, pimg.width);
    pimg.setScale(this.playerScale);
    const innerChildren: Phaser.GameObjects.GameObject[] = [pimg];
    const hoodDef = cfg.hoodId ? HOOD_BY_ID[cfg.hoodId] : undefined;
    if (hoodDef) {
      const key = `hood_${hoodDef.id}`;
      addCanvasTexture(this, key, () => drawHood(hoodDef.art, 2));
      // Hood sits on top of the round penguin and rolls with it (single-sided sprite).
      const hood = this.add.image(0, -PLAYER.radius * 0.72, key).setOrigin(0.5, HOOD_CANVAS.baseY / HOOD_CANVAS.height);
      hood.setScale((PLAYER.radius * 1.55) / (HOOD_CANVAS.width * 2) * 1.0);
      innerChildren.push(hood);
    }
    this.playerInner = this.add.container(0, 0, innerChildren);
    this.playerRoot = this.add.container(level.player.x, level.player.y, [this.playerInner]);
    this.playerShadow = this.add.image(level.player.x, level.player.y + PLAYER.radius * 0.8, 'proc_shadow').setDisplaySize(PLAYER.radius * 2.6, PLAYER.radius).setAlpha(0.5);

    // --- weather
    this.createWeather();

    // --- camera
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.offEvents.push(this.session.events.on('sim', (e) => this.onSimEvent(e)));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // Intro: the penguin drops in with a squash.
    this.intro.s = 0.2;
    this.tweens.add({ targets: this.intro, s: 1, duration: 420, ease: 'Back.Out' });
    this.data_.onReady?.();
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    for (const off of this.offEvents) off();
    this.offEvents = [];
    for (const k of this.textureKeys) if (this.textures.exists(k)) this.textures.remove(k);
    this.textureKeys = [];
  }

  // ------------------------------------------------------------------ camera

  private fitCamera(): void {
    const cam = this.cameras.main;
    const dpr = this.data_.dpr();
    const level = this.session.config.level;
    const cssW = this.scale.width / dpr, cssH = this.scale.height / dpr;
    cam.setSize(this.scale.width, this.scale.height);
    const top = CAMERA.hudReserveTop;
    const fitCss = Math.min((cssW - CAMERA.margin * 2) / (level.arena.width + 40), (cssH - top - CAMERA.margin) / (level.arena.height + 40));
    const cssPerUnit = Math.max(fitCss, CAMERA.minCssPxPerUnit);
    this.followMode = fitCss < CAMERA.minCssPxPerUnit;
    cam.setZoom(cssPerUnit * dpr);
    this.cssPerUnit = cssPerUnit;
    if (!this.followMode) cam.centerOn(level.arena.width / 2, level.arena.height / 2 - (top / 2) / cssPerUnit);
    else {
      const t = this.followTarget(level.player.x, level.player.y);
      cam.centerOn(t.x, t.y);
    }
  }

  /**
   * Follow-camera target: keeps the penguin centred in the area BELOW the HUD
   * and clamps to the arena (plus its snowbank) so the playfield never hides
   * under the HUD or scrolls into empty space.
   */
  private followTarget(px: number, py: number): { x: number; y: number } {
    const { width: W, height: H } = this.session.config.level.arena;
    const dpr = this.data_.dpr();
    const cpu = this.cssPerUnit;
    const viewW = this.scale.width / dpr / cpu, viewH = this.scale.height / dpr / cpu;
    const hud = CAMERA.hudReserveTop / cpu;
    const pad = 36;
    const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    return {
      x: clamp(px, -pad + viewW / 2, W + pad - viewW / 2),
      y: clamp(py - hud / 2, -pad - hud + viewH / 2, H + pad - viewH / 2),
    };
  }

  // ------------------------------------------------------------------ decor

  private placeOutsideDecor(seed: string): void {
    const level = this.session.config.level;
    const pool = decorPool(this.region.id, 'outside');
    if (pool.length === 0) return;
    // Separate cosmetic stream: decoration can never influence gameplay seeds.
    const rng = new Rng(`${seed}:decor`);
    const { width: W, height: H } = level.arena;
    const big = pool.filter((f) => f.h >= 100);
    const small = pool.filter((f) => f.h < 100);
    const place = (x: number, y: number, front: boolean) => {
      const useBig = big.length > 0 && (small.length === 0 || rng.chance(0.55));
      const f = rng.pick(useBig ? big : small);
      const targetH = useBig ? rng.range(95, 135) : rng.range(42, 64);
      const t = tex(this, f.id);
      const img = this.add.image(x, y, t.key, t.frame).setOrigin(0.5, 0.95);
      img.setScale(Math.min(1.1, targetH / f.h));
      img.setFlipX(rng.chance(0.5));
      img.setDepth(front ? DEPTH.decorFront + y : DEPTH.decorBack + y * 0.001);
    };
    const step = 130;
    for (let x = -BANK_MARGIN; x <= W + BANK_MARGIN; x += step * rng.range(0.7, 1.3)) {
      place(x, -BANK_MARGIN + rng.range(-40, 5), false);
      if (rng.chance(0.6)) place(x + rng.range(-40, 40), -BANK_MARGIN - rng.range(70, 160), false);
      place(x, H + BANK_MARGIN + rng.range(10, 70), true);
    }
    for (let y = -BANK_MARGIN; y <= H + BANK_MARGIN; y += step * rng.range(0.8, 1.3)) {
      place(-BANK_MARGIN + rng.range(-60, 10), y, false);
      place(W + BANK_MARGIN + rng.range(-10, 60), y, false);
    }
  }

  private placeFloorDecals(seed: string): void {
    const level = this.session.config.level;
    const pool: FrameMeta[] = decorPool(this.region.id, 'floorDecal');
    if (pool.length === 0) return;
    const rng = new Rng(`${seed}:decals`);
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i++) {
      const x = rng.range(80, level.arena.width - 80), y = rng.range(80, level.arena.height - 80);
      if (Math.hypot(x - level.stash.x, y - level.stash.y) < GOAL.wallRadius + 90) continue;
      if (this.session.sim.world.overlapsStatic(x, y, 50, 7)) continue;
      const f = rng.pick(pool);
      const t = tex(this, f.id);
      this.add.image(x, y, t.key, t.frame).setDepth(DEPTH.decal).setAlpha(0.5).setScale(rng.range(0.7, 1.1)).setFlipX(rng.chance(0.5));
    }
  }

  private createWeather(): void {
    const w = this.region.weather;
    const q = this.data_.settings().quality;
    if (w.kind === 'none' || this.data_.settings().reducedMotion) return;
    const budget = q === 'low' ? 20 : q === 'medium' ? 45 : 80;
    const count = Math.round(budget * w.density);
    const key = w.kind === 'leaves' ? 'px_leaf' : w.kind === 'petals' ? 'px_petal' : w.kind === 'sprinkles' ? 'px_sprinkle' : w.kind === 'sparkles' ? 'px_sparkle' : 'px_snow';
    const level = this.session.config.level;
    const sprinkleTints = [0xef6f9c, 0x7fd0f0, 0xf6c945, 0x8fd18a];
    for (let i = 0; i < count; i++) {
      const img = this.add.image(Math.random() * (level.arena.width + 400) - 200, Math.random() * (level.arena.height + 400) - 200, key).setDepth(DEPTH.weather);
      const s = w.kind === 'snow' ? 0.25 + Math.random() * 0.45 : 0.5 + Math.random() * 0.5;
      img.setScale(s).setAlpha(w.kind === 'sparkles' ? 0.6 : 0.85);
      if (w.kind === 'sprinkles') img.setTint(sprinkleTints[i % sprinkleTints.length]!);
      if (w.kind === 'sparkles') img.setTint(0xcff6ff);
      this.flakes.push({ img, vx: 20 + w.wind * 90 * (0.5 + Math.random()), vy: w.kind === 'sparkles' ? 6 : 30 + Math.random() * 40, phase: Math.random() * 6.28 });
    }
  }

  // ------------------------------------------------------------------ frame

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.session.frame(dt);
    const alpha = this.session.stepper.alpha;
    const sim = this.session.sim;
    const reduced = this.data_.settings().reducedMotion;
    const t = (this.time.now - this.time0) / 1000;

    // Player
    const pb = sim.player.body;
    const px = pb.px + (pb.x - pb.px) * alpha, py = pb.py + (pb.y - pb.py) * alpha;
    this.playerRoot.setPosition(px, py);
    this.playerShadow.setPosition(px, py + PLAYER.radius * 0.85);
    const speed = Math.hypot(pb.vx, pb.vy);
    const stretch = Math.min(0.12, speed / 4200);
    this.squashT = Math.max(this.squashT * Math.exp(-9 * dt), sim.player.squash);
    sim.player.squash = 0;
    const sq = this.squashT * PLAYER.impactSquash;
    const heading = speed > 5 ? Math.atan2(pb.vy, pb.vx) : this.playerRoot.rotation;
    this.playerRoot.rotation = heading;
    const wob = speed < 20 && !reduced ? Math.sin(t * 3.2) * 0.04 : 0;
    const k = this.intro.s;
    this.playerRoot.setScale(k * (1 + stretch - sq * 0.6), k * (1 - stretch * 0.7 + sq));
    this.playerInner.rotation = sim.player.roll + wob - heading;
    this.playerRoot.setDepth(DEPTH.actors + py);
    this.playerShadow.setDepth(DEPTH.actors + py - 1);
    if (sim.player.sprinting && speed > 200) {
      this.puffTimer -= dt;
      if (this.puffTimer <= 0) {
        this.puffTimer = 0.07;
        this.spawn('px_puff', undefined, px - (pb.vx / speed) * 20, py - (pb.vy / speed) * 20 + 12, { vx: -pb.vx * 0.15, vy: -pb.vy * 0.15 - 10, life: 0.4, s0: 0.35, s1: 0.75, a0: 0.75, a1: 0, depth: DEPTH.actors + py - 2 });
      }
    }

    // Ice skid marks when turning or braking hard at speed (presentation only, pooled, short-lived).
    this.skidTimer -= dt;
    if (!reduced && speed > 170 && this.skidTimer <= 0) {
      const pv = Math.hypot(this.lastPv.x, this.lastPv.y);
      const turn = pv > 1 ? 1 - (pb.vx * this.lastPv.x + pb.vy * this.lastPv.y) / (speed * pv) : 0;
      const brake = pv - speed;
      if (turn > 0.012 || brake > 9) {
        this.skidTimer = 0.035;
        this.spawn('fx_skid', undefined, px, py + 14, { vx: 0, vy: 0, life: 1.1, s0: 0.9, s1: 0.9, a0: 0.6, a1: 0, depth: DEPTH.decal + 1 })?.img.setRotation(heading);
        if (turn > 0.03 || brake > 18) this.data_.audio.play('skid');
      }
    }
    this.lastPv.x = pb.vx;
    this.lastPv.y = pb.vy;

    // Fish
    for (const v of this.fishViews) this.updateFish(v, alpha, dt);
    // Enemies
    for (const v of this.enemyViews) this.updateEnemy(v, alpha, dt, t, reduced);
    // Goal
    this.updateGoal(dt, t, reduced);

    // Particles + weather
    this.updateParticles(dt);
    this.updateWeather(dt, t);
    if (this.followMode) {
      const cam = this.cameras.main;
      const t = this.followTarget(px, py);
      const cx = cam.midPoint.x + (t.x - cam.midPoint.x) * Math.min(1, CAMERA.followRate * dt);
      const cy = cam.midPoint.y + (t.y - cam.midPoint.y) * Math.min(1, CAMERA.followRate * dt);
      cam.centerOn(cx, cy);
    }
  }

  private updateFish(v: FishView, alpha: number, dt: number): void {
    const f = v.fish;
    if (f.state === 'stashed' && v.entering) {
      // Presentation only: the fish already left gameplay; it slides into the doorway and is occluded by the igloo.
      const e = v.entering;
      e.t = Math.min(1, e.t + dt / 0.36);
      const [dx, dy] = doorPoint(this.session.config.level.stash.x, this.session.config.level.stash.y);
      const k = e.t * e.t;
      const x = e.x + (dx - e.x) * k, y = e.y + (dy - e.y) * k;
      v.img.setPosition(x, y).setScale(v.scale * (1 - 0.4 * e.t)).setDepth(DEPTH.actors + y);
      v.img.rotation = Math.atan2(dy - e.y, dx - e.x);
      v.img.setFlipY(Math.cos(v.img.rotation) < 0);
      v.img.setAlpha(e.t > 0.8 ? (1 - e.t) / 0.2 : 1);
      v.shadow.setVisible(false);
      v.lines.setVisible(false);
      if (e.t >= 1) {
        v.entering = null;
        v.img.setVisible(false);
      }
      return;
    }
    if (f.state !== 'free') {
      if (v.img.visible) {
        v.img.setVisible(false);
        v.shadow.setVisible(false);
        v.lines.setVisible(false);
      }
      return;
    }
    if (!v.img.visible) {
      v.img.setVisible(true).setAlpha(1);
      v.shadow.setVisible(true);
      v.lines.setVisible(true);
      v.img.setScale(v.scale);
    }
    const b = f.body;
    const x = b.px + (b.x - b.px) * alpha, y = b.py + (b.y - b.py) * alpha;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 70) {
      const target = Math.atan2(b.vy, b.vx);
      let d = target - v.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.angle += d * Math.min(1, 10 * dt) + b.angVel * dt * 0.25;
    } else {
      v.angle += b.angVel * dt;
    }
    v.img.setPosition(x, y);
    v.img.rotation = v.angle;
    const cos = Math.cos(v.angle);
    v.img.setFlipY(cos < 0);
    let frameId = f.cfg.sprite;
    if (f.react > 0) frameId = f.reactKind === 'flop' ? 'fish_flopping' : 'fish_squashed';
    const want = tex(this, frameId);
    if (v.img.frame.name !== (want.frame ?? '__BASE')) v.img.setTexture(want.key, want.frame);
    const reactScale = f.react > 0 ? 1 + Math.sin((f.react / 0.28) * Math.PI) * 0.12 : 1;
    v.img.setScale(v.scale * reactScale * (frameId === f.cfg.sprite ? 1 : 0.95));
    v.img.setDepth(DEPTH.actors + y);
    v.shadow.setPosition(x, y + f.cfg.radius * 0.75).setDepth(DEPTH.actors + y - 1);
    // Speed lines only at high velocity (Batch 3 rule).
    const th = FISH.speedLinesThreshold;
    if (speed > th * 0.8 && !this.data_.settings().reducedMotion) {
      v.trailT = (v.trailT ?? 0) - dt;
      if (v.trailT <= 0) {
        v.trailT = 0.045;
        this.spawn('fx_trail', undefined, x - (b.vx / speed) * f.cfg.radius, y - (b.vy / speed) * f.cfg.radius, { vx: 0, vy: 0, life: 0.45, s0: 0.9, s1: 0.4, a0: 0.7, a1: 0, depth: DEPTH.actors + y - 3 });
      }
    }
    if (speed > th) {
      const a = Math.min(1, (speed - th) / (FISH.maxSpeed - th));
      v.lines.setAlpha(0.35 + a * 0.6);
      v.lines.setPosition(x - (b.vx / speed) * f.cfg.radius * 2.4, y - (b.vy / speed) * f.cfg.radius * 2.4);
      v.lines.rotation = Math.atan2(b.vy, b.vx);
      v.lines.setDepth(DEPTH.actors + y - 2);
    } else if (v.lines.alpha > 0) {
      v.lines.setAlpha(Math.max(0, v.lines.alpha - dt * 4));
    }
  }

  private updateEnemy(v: EnemyView, alpha: number, dt: number, t: number, reduced: boolean): void {
    const e = v.enemy;
    const b = e.body;
    const x = b.px + (b.x - b.px) * alpha, y = b.py + (b.y - b.py) * alpha;
    v.root.setPosition(x, y);
    v.shadow.setPosition(x, y + e.cfg.radius * 0.8);
    const targetLean = Math.max(-0.38, Math.min(0.38, b.vx / 420));
    v.lean += (targetLean - v.lean) * Math.min(1, 8 * dt);
    const speed = Math.hypot(b.vx, b.vy);
    const waddle = reduced ? 0 : Math.sin(t * (e.type === 'polarBear' ? 6 : 11) + v.phase) * Math.min(0.12, speed / 1800);
    v.root.rotation = v.lean + waddle;
    let sx = 1, sy = 1;
    if (e.state === 'munching') {
      const c = Math.sin(t * 22) * 0.08;
      sx = 1 + c;
      sy = 1 - c;
    } else if (e.state === 'waiting') {
      const br = reduced ? 0 : Math.sin(t * 2 + v.phase) * 0.03;
      sx = 1 + br;
      sy = 1 - br;
    } else if (e.type === 'seal') {
      sx = 1 + Math.min(0.15, speed / 2400);
      sy = 1 - Math.min(0.12, speed / 3000);
    }
    v.img.setScale(v.scale * sx, v.scale * sy);
    v.img.setFlipX(b.vx < -20 ? false : b.vx > 20 ? true : v.img.flipX);
    v.root.setDepth(DEPTH.actors + y);
    v.shadow.setDepth(DEPTH.actors + y - 1);
    if (v.alert > 0) v.alert -= dt;
    this.updateExpression(v, x, y, dt, t, reduced);
  }

  /** Readable expression state from distance to the enemy's target (or nearest exposed fish), with hysteresis. */
  private updateExpression(v: EnemyView, x: number, y: number, dt: number, t: number, reduced: boolean): void {
    const e = v.enemy;
    const sim = this.session.sim;
    v.voiceCd = Math.max(0, v.voiceCd - dt);
    v.exprHold += dt;
    let d = Infinity;
    const target = sim.fish.find((f) => f.id === e.targetFish && f.state === 'free');
    if (target) d = Math.hypot(target.body.x - e.body.x, target.body.y - e.body.y);
    else for (const f of sim.exposedFish) d = Math.min(d, Math.hypot(f.body.x - e.body.x, f.body.y - e.body.y));
    const E = ENEMY_EXPRESSION;
    const raw: Expression = e.state === 'munching' || e.state === 'waiting' ? 'idle' : d <= E.imminent ? 'imminent' : d <= E.eager ? 'eager' : d <= E.alert ? 'alert' : 'idle';
    const rank = { idle: 0, alert: 1, eager: 2, imminent: 3 } as const;
    let next = v.expr;
    if (rank[raw] > rank[v.expr]) next = raw; // escalate immediately
    else if (rank[raw] < rank[v.expr] && v.exprHold >= E.minHold) {
      // calm down only once clearly outside the band
      const band = v.expr === 'imminent' ? E.imminent : v.expr === 'eager' ? E.eager : E.alert;
      if (d > band + E.hysteresis || e.state === 'munching' || e.state === 'waiting') next = raw;
    }
    if (next !== v.expr) {
      if (rank[next] >= 2 && rank[v.expr] < 2 && v.voiceCd <= 0) {
        this.data_.audio.play(e.type === 'polarBear' ? 'bearGrowl' : e.type === 'arcticWolf' ? 'wolfYip' : 'sealBark');
        v.voiceCd = E.voiceCooldown;
      }
      v.expr = next;
      v.exprHold = 0;
      if (next === 'idle') v.emote.setVisible(false);
      else v.emote.setTexture(`emote_${next}`).setVisible(true);
    }
    if (v.emote.visible) {
      const bob = reduced ? 0 : Math.sin(t * (v.expr === 'imminent' ? 14 : 5)) * (v.expr === 'imminent' ? 3 : 2);
      v.emote.setPosition(x + e.cfg.radius * 0.55, y - e.cfg.radius - 22 + bob).setScale(v.expr === 'imminent' ? 0.62 : 0.5);
    }
    v.img.setTint(v.expr === 'imminent' && !reduced && Math.sin(t * 16) > 0 ? 0xffd0d0 : 0xffffff);
  }

  /** Emote bubbles and trail decals (procedural, generated once per scene). */
  private makeFxTextures(): void {
    const bubble = (key: string, fill: string, glyph: string, glyphColor: string) => addCanvasTexture(this, key, () => {
      const c = document.createElement('canvas');
      c.width = 72; c.height = 72;
      const g = c.getContext('2d')!;
      g.lineWidth = 5; g.strokeStyle = '#1b2a44'; g.fillStyle = fill;
      g.beginPath(); g.arc(36, 32, 26, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(26, 54); g.lineTo(22, 68); g.lineTo(38, 57); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = fill; g.beginPath(); g.arc(36, 32, 23, 0, Math.PI * 2); g.fill();
      g.font = '900 34px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = '#1b2a44'; g.strokeText(glyph, 36, 34); g.fillStyle = glyphColor; g.fillText(glyph, 36, 34);
      return c;
    });
    bubble('emote_alert', '#ffffff', '?', '#3d8fd6');
    bubble('emote_eager', '#fff3c4', '!', '#f2a01a');
    bubble('emote_imminent', '#ffd6d6', '!!', '#ff3b3b');
    addCanvasTexture(this, 'fx_skid', () => {
      const c = document.createElement('canvas');
      c.width = 34; c.height = 14;
      const g = c.getContext('2d')!;
      g.strokeStyle = 'rgba(160,205,240,0.9)'; g.lineWidth = 3; g.lineCap = 'round';
      for (const yy of [4, 10]) { g.beginPath(); g.moveTo(3, yy); g.quadraticCurveTo(17, yy - 2, 31, yy); g.stroke(); }
      return c;
    });
    addCanvasTexture(this, 'fx_trail', () => {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(8, 8, 1, 8, 8, 8);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(200,235,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
      return c;
    });
  }

  // ------------------------------------------------------------------ goal

  private buildGoal(): void {
    const level = this.session.config.level;
    const { x: cx, y: cy } = level.stash;
    const tx = (key: string, make: () => HTMLCanvasElement) => addCanvasTexture(this, key, make);
    tx('goal_post', () => drawFencePost(false));
    tx('goal_post_tall', () => drawFencePost(true));
    tx('goal_courtyard', () => drawCourtyard(GOAL.wallRadius, GOAL.interiorRadius));
    tx('goal_heart', drawHeart);
    for (let i = 0; i < 3; i++) for (const m of ['idle', 'cheer', 'worried'] as const) tx(`chick_${m}_${i}`, () => drawChick(m, i));

    // Courtyard floor + score flash.
    this.add.image(cx, cy, 'goal_courtyard').setScale(0.5).setDepth(DEPTH.surface + 0.5);
    this.goalGlow = this.add.image(cx, cy, 'px_snow').setDepth(DEPTH.surface + 0.6).setScale(GOAL.interiorRadius / 9).setAlpha(0).setTint(0xfff3a0);

    // Gate approaches: a softly trampled path outside each opening so gates read from afar.
    const paths = this.add.graphics().setDepth(DEPTH.decal + 0.5);
    for (const run of openings(level.goal)) {
      let mx = 0, my = 0;
      for (const seg of run) {
        const a = RING_DIRS[seg]!, b = RING_DIRS[(seg + 1) % RING_SEGMENTS]!;
        mx += a[0] + b[0]; my += a[1] + b[1];
      }
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml; my /= ml;
      for (let j = 0; j < 4; j++) {
        const r = GOAL.wallRadius + 26 + j * 22;
        paths.fillStyle(0xd6e9f7, 0.55 - j * 0.11);
        paths.fillEllipse(cx + mx * r, cy + my * r, 26 - j * 3, 16 - j * 2);
      }
    }

    // Solid ring segments: fences (wood + snow) and the igloo's snow-brick wing walls.
    const posts = new Map<number, boolean>(); // direction index → is gate post
    const openAt = (seg: number) => !isSolidSegment(level.goal, ((seg % RING_SEGMENTS) + RING_SEGMENTS) % RING_SEGMENTS);
    for (let i = 0; i < RING_SEGMENTS; i++) {
      if (!isSolidSegment(level.goal, i)) continue;
      const [ax, ay] = ringPoint(cx, cy, i);
      const [bx, by] = ringPoint(cx, cy, i + 1);
      if (isIglooSegment(i)) {
        if (ay > cy + GOAL.iglooBaseY - 4 || by > cy + GOAL.iglooBaseY - 4) this.drawIceWall(ax, ay, bx, by);
        if (openAt(i - 1)) posts.set(i, true);
        if (openAt(i + 1)) posts.set((i + 1) % RING_SEGMENTS, true);
        continue;
      }
      this.drawRails(ax, ay, bx, by);
      posts.set(i, posts.get(i) || openAt(i - 1));
      posts.set((i + 1) % RING_SEGMENTS, posts.get((i + 1) % RING_SEGMENTS) || openAt(i + 1));
    }
    for (const [k, gate] of posts) {
      const [px, py] = ringPoint(cx, cy, k);
      this.add.image(px, py + 3, gate ? 'goal_post_tall' : 'goal_post').setOrigin(0.5, 0.94).setScale(0.5).setDepth(DEPTH.actors + py);
    }

    // The igloo (supplied Batch 8A art), sitting behind the courtyard with its door on the north rim.
    const ig = tex(this, 'igloo_8a');
    this.igloo = this.add.image(cx, cy + GOAL.iglooBaseY + 8, ig.key, ig.frame).setOrigin(0.5, 1);
    this.igloo.setScale(GOAL.iglooWidth / Math.max(1, this.igloo.width)).setDepth(DEPTH.actors + cy + GOAL.iglooBaseY);
    const sh = this.add.image(cx, cy + GOAL.iglooBaseY + 2, 'proc_shadow').setDepth(DEPTH.surface + 1);
    sh.setDisplaySize(GOAL.iglooWidth * 1.05, 34).setAlpha(0.45);

    // Chicks flanking the doorway.
    const by = cy + GOAL.iglooBaseY + 4;
    [-34, 34].forEach((ox, i) => {
      const img = this.add.image(cx + ox, by, `chick_idle_${i}`).setOrigin(0.5, 0.95).setScale(0.5).setDepth(DEPTH.actors + by + 1);
      img.setFlipX(ox > 0);
      this.chicks.push({ img, x: cx + ox, y: by, phase: i * 1.7, tint: i, mood: 'idle' });
    });

    // Progress plaque on the dome (objective role of the old stash).
    this.goalPlaque = this.add.text(cx, cy + GOAL.iglooBaseY - this.igloo.displayHeight * 0.62, '', {
      fontFamily: 'Luckiest Guy, Fredoka, sans-serif', fontSize: '22px', color: '#ffffff', stroke: '#1b2a44', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(DEPTH.actors + cy + GOAL.iglooBaseY + 0.5);
    this.updatePlaque();

    if (level.tutorial?.showStashArrow) {
      const a = tex(this, 'ui_stash_arrow');
      this.stashArrow = this.add.image(cx, cy - 40, a.key, a.frame).setDepth(DEPTH.fx - 1).setScale(0.5);
    }
  }

  private drawRails(ax: number, ay: number, bx: number, by: number): void {
    const g = this.add.graphics().setDepth(DEPTH.actors + Math.max(ay, by) - 0.5);
    const c = FENCE_COLORS;
    for (const h of [9, 20]) {
      g.lineStyle(7, c.outline, 1);
      g.lineBetween(ax, ay - h, bx, by - h);
      g.lineStyle(4.2, c.wood, 1);
      g.lineBetween(ax, ay - h, bx, by - h);
    }
    // Snow along the top rail.
    g.lineStyle(3.4, c.snowShade, 1);
    g.lineBetween(ax, ay - 21.5, bx, by - 21.5);
    g.lineStyle(2.4, c.snow, 1);
    g.lineBetween(ax, ay - 22.5, bx, by - 22.5);
  }

  private drawIceWall(ax: number, ay: number, bx: number, by: number): void {
    const g = this.add.graphics().setDepth(DEPTH.actors + Math.max(ay, by) - 0.5);
    const c = FENCE_COLORS;
    const h = 16;
    g.fillStyle(c.ice, 1);
    g.lineStyle(3, 0x1b2a44, 1);
    g.beginPath();
    g.moveTo(ax, ay + 2); g.lineTo(bx, by + 2); g.lineTo(bx, by - h); g.lineTo(ax, ay - h);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.lineStyle(1.6, c.iceLine, 1);
    g.lineBetween(ax, ay - h / 2, bx, by - h / 2);
    g.lineBetween((ax + bx) / 2, (ay + by) / 2 - h, (ax + bx) / 2, (ay + by) / 2 - h / 2);
    g.fillStyle(c.snow, 1);
    g.fillEllipse((ax + bx) / 2, (ay + by) / 2 - h - 1, Math.hypot(bx - ax, by - ay) + 6, 7);
  }

  private updatePlaque(): void {
    const sim = this.session.sim;
    this.goalPlaque.setText(`${Math.min(sim.stashedValue, sim.required)}/${sim.required}`);
    this.goalPlaque.setColor(sim.stashedValue >= sim.required ? '#ffe066' : '#ffffff');
  }

  private updateGoal(dt: number, t: number, reduced: boolean): void {
    this.goalGlow.setAlpha(Math.max(0, this.goalGlow.alpha - dt * 1.5));
    if (this.stashArrow) this.stashArrow.y = this.session.config.level.stash.y - 40 + Math.sin(t * 4) * 8;
    if (this.cheerTimer > 0) this.cheerTimer -= dt;
    const danger = this.session.snapshot().danger;
    for (const c of this.chicks) {
      const mood: ChickMood = this.cheerTimer > 0 ? 'cheer' : danger > 0.65 ? 'worried' : 'idle';
      if (mood !== c.mood) {
        c.mood = mood;
        c.img.setTexture(`chick_${mood}_${c.tint}`);
      }
      const hop = mood === 'cheer' ? Math.abs(Math.sin(t * 10 + c.phase)) * 9 : reduced ? 0 : Math.abs(Math.sin(t * 2.2 + c.phase)) * 1.6;
      c.img.setPosition(c.x, c.y - hop);
      const sq = mood === 'cheer' ? 1 : 1 + (reduced ? 0 : Math.sin(t * 4.4 + c.phase) * 0.03);
      c.img.setScale(0.5 * (2 - sq), 0.5 * sq);
    }
  }

  private popup(x: number, y: number, text: string, color: string): void {
    let p = this.popups.find((pp) => !pp.visible);
    if (!p) {
      if (this.popups.length >= 4) p = this.popups.shift()!;
      else p = this.add.text(0, 0, '', { fontFamily: 'Luckiest Guy, Fredoka, sans-serif', fontSize: '30px', color: '#ffffff', stroke: '#1b2a44', strokeThickness: 7 }).setOrigin(0.5);
      this.popups.push(p);
    }
    this.tweens.killTweensOf(p);
    p.setText(text).setColor(color).setPosition(x, y).setAlpha(1).setScale(0.4).setVisible(true).setDepth(DEPTH.fx + 1);
    const reduced = this.data_.settings().reducedMotion;
    this.tweens.add({ targets: p, scale: 1, duration: reduced ? 1 : 160, ease: 'Back.Out' });
    this.tweens.add({ targets: p, y: y - 46, alpha: 0, delay: 420, duration: 380, ease: 'Quad.In', onComplete: () => p!.setVisible(false) });
  }

  // ------------------------------------------------------------------ events → feedback

  private onSimEvent(e: SimEvent): void {
    const audio = this.data_.audio;
    const s = this.data_.settings();
    switch (e.type) {
      case 'impact': {
        const intensity = Math.min(1, e.speed / 700);
        if (e.kind === 'fishFence') {
          audio.play('fenceKnock', { intensity, volume: 0.35 + intensity * 0.6 });
          if (e.speed > 260) this.splash(e.x, e.y, e.nx, e.ny, intensity * 0.7);
        } else if (e.kind === 'fishWall' || e.kind === 'fishObstacle' || e.kind === 'fishFish') {
          audio.play('fishBounce', { intensity, volume: 0.4 + intensity * 0.6 });
          if (e.speed > 260) this.splash(e.x, e.y, e.nx, e.ny, intensity);
        } else if (e.kind === 'fishPenguin') {
          audio.play('fishBounce', { intensity: intensity * 0.8, volume: 0.6 + intensity * 0.4, pitch: 1.15 });
          if (e.speed > 380) this.shake(intensity * 0.6);
        } else if (e.kind === 'penguinWall' || e.kind === 'penguinObstacle' || e.kind === 'penguinFence' || e.kind === 'penguinEnemy') {
          if (e.speed > 120) audio.play('collision', { intensity });
          if (e.speed > 300) this.shake(intensity);
          if (e.speed > 220) this.spawn('px_puff', undefined, e.x, e.y, { vx: e.nx * 30, vy: e.ny * 30, life: 0.45, s0: 0.3, s1: 0.8, a0: 0.8, a1: 0, depth: DEPTH.fx });
        }
        break;
      }
      case 'fishScored': {
        audio.play('scorePop');
        audio.play('fishScore');
        audio.haptic(25);
        const st = this.session.config.level.stash;
        const v = this.fishViews.find((fv) => fv.fish === e.fish);
        if (v) v.entering = { t: 0, x: e.x, y: e.y };
        this.burst(st.x, st.y + GOAL.iglooBaseY + 10);
        this.goalGlow.setAlpha(0.9);
        this.cheerTimer = 0.9;
        this.tweens.add({ targets: this.igloo, scaleX: this.igloo.scaleX * 1.05, scaleY: this.igloo.scaleY * 0.95, duration: 100, yoyo: true, ease: 'Quad.Out' });
        const heart = this.chicks[Math.floor(Math.random() * this.chicks.length)];
        if (heart) this.spawn('goal_heart', undefined, heart.x, heart.y - 30, { vx: (Math.random() - 0.5) * 20, vy: -60, life: 0.8, s0: 0.5, s1: 0.7, a0: 1, a1: 0, depth: DEPTH.fx });
        this.updatePlaque();
        this.popup(st.x, st.y - 16, e.bank ? 'BANK SHOT!' : `+${e.fish.cfg.scoreValue}`, e.bank ? '#ffe066' : '#ffffff');
        break;
      }
      case 'fishEaten': {
        audio.play('fishEaten');
        audio.play('puff');
        audio.haptic(60);
        const b = e.fish.body;
        const t = tex(this, 'fx_fish_lost_puff');
        this.spawn(t.key, t.frame, b.x, b.y - 10, { vx: 0, vy: -40, life: 0.8, s0: 0.25, s1: 0.5, a0: 1, a1: 0, depth: DEPTH.fx });
        const bone = tex(this, 'fish_eaten_icon');
        this.spawn(bone.key, bone.frame, b.x, b.y, { vx: (Math.random() - 0.5) * 60, vy: -160, life: 1.1, s0: 0.22, s1: 0.22, a0: 1, a1: 0, spin: 4, gravity: 360, depth: DEPTH.fx });
        this.shake(0.4);
        break;
      }
      case 'enemyAlert': {
        audio.play('enemyAlert');
        const v = this.enemyViews.find((ev) => ev.enemy === e.enemy);
        if (v) {
          v.alert = 0.6;
          const txt = this.add.text(v.root.x, v.root.y - e.enemy.cfg.radius - 30, '!', { fontFamily: 'Luckiest Guy, Fredoka, sans-serif', fontSize: '40px', color: '#ff4b4b', stroke: '#1b2a44', strokeThickness: 8 }).setOrigin(0.5).setDepth(DEPTH.fx);
          this.tweens.add({ targets: txt, y: txt.y - 24, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => txt.destroy() });
        }
        break;
      }
      case 'enemyDash':
        audio.play('sealDash');
        break;
      case 'sprintStart':
        audio.play('sprint');
        break;
      case 'sprintEnd':
        audio.play('sprintEnd');
        break;
      case 'staminaLow':
        audio.play('staminaLow');
        break;
      case 'staminaEmpty':
        audio.play('staminaEmpty');
        break;
      case 'won':
        this.shake(0.3);
        break;
      default:
        break;
    }
    void s;
  }

  private shake(intensity: number): void {
    const s = this.data_.settings();
    if (s.reducedMotion || s.screenShake <= 0) return;
    this.cameras.main.shake(140, CAMERA.impactShake * intensity * s.screenShake);
  }

  private splash(x: number, y: number, nx: number, ny: number, intensity: number): void {
    const t = tex(this, 'fx_fish_impact_splash');
    const p = this.spawn(t.key, t.frame, x, y, { vx: nx * 20, vy: ny * 20, life: 0.35, s0: 0.12 + intensity * 0.12, s1: 0.22 + intensity * 0.16, a0: 0.95, a1: 0, depth: DEPTH.fx });
    if (p) p.img.rotation = Math.atan2(ny, nx) + Math.PI / 2;
  }

  private burst(x: number, y: number): void {
    const b = tex(this, 'fx_scoring_burst');
    this.spawn(b.key, b.frame, x, y - 20, { vx: 0, vy: -10, life: 0.55, s0: 0.3, s1: 0.6, a0: 1, a1: 0, depth: DEPTH.fx });
    const sp = tex(this, 'fx_fish_stash_sparkle');
    this.spawn(sp.key, sp.frame, x, y - 30, { vx: 0, vy: -50, life: 0.8, s0: 0.35, s1: 0.5, a0: 1, a1: 0, depth: DEPTH.fx });
    const q = this.data_.settings().quality;
    const n = q === 'low' ? 4 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = this.spawn('px_sparkle', undefined, x, y - 10, { vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 - 60, life: 0.6, s0: 0.6, s1: 0.1, a0: 1, a1: 0, spin: 6, gravity: 200, depth: DEPTH.fx });
      p?.img.setTint(i % 2 ? 0xffe066 : 0x9fe3ff);
    }
  }

  private spawn(key: string, frame: string | undefined, x: number, y: number,
    o: { vx: number; vy: number; life: number; s0: number; s1: number; a0: number; a1: number; spin?: number; gravity?: number; depth: number }): Particle | null {
    const q = this.data_.settings().quality;
    const max = q === 'low' ? 30 : q === 'medium' ? 70 : 120;
    let p = this.particles.find((pp) => !pp.active);
    if (!p) {
      if (this.particles.length >= max) return null;
      p = { img: this.add.image(x, y, key, frame), vx: 0, vy: 0, life: 0, max: 1, s0: 1, s1: 1, a0: 1, a1: 0, spin: 0, gravity: 0, active: false };
      this.particles.push(p);
    }
    p.img.setTexture(key, frame).setPosition(x, y).setVisible(true).setDepth(o.depth).setRotation(0).clearTint();
    p.vx = o.vx; p.vy = o.vy; p.life = o.life; p.max = o.life; p.s0 = o.s0; p.s1 = o.s1; p.a0 = o.a0; p.a1 = o.a1;
    p.spin = o.spin ?? 0; p.gravity = o.gravity ?? 0; p.active = true;
    p.img.setScale(o.s0).setAlpha(o.a0);
    return p;
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.img.setVisible(false);
        continue;
      }
      const k = 1 - p.life / p.max;
      p.vy += p.gravity * dt;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.rotation += p.spin * dt;
      p.img.setScale(p.s0 + (p.s1 - p.s0) * k);
      p.img.setAlpha(p.a0 + (p.a1 - p.a0) * k);
    }
  }

  private updateWeather(dt: number, t: number): void {
    if (this.flakes.length === 0) return;
    // Flakes live in world space (they parallax correctly as the camera follows) but wrap
    // around the CURRENT camera view, so weather keeps filling the screen while moving.
    const v = this.cameras.main.worldView;
    const m = 120;
    const W = v.width + m * 2, H = v.height + m * 2;
    for (const f of this.flakes) {
      f.img.x += (f.vx + Math.sin(t * 1.3 + f.phase) * 18) * dt;
      f.img.y += f.vy * dt;
      f.img.rotation += dt * 0.8;
      if (f.img.x > v.right + m) f.img.x -= W;
      else if (f.img.x < v.x - m) f.img.x += W;
      if (f.img.y > v.bottom + m) f.img.y -= H;
      else if (f.img.y < v.y - m) f.img.y += H;
    }
  }

}
