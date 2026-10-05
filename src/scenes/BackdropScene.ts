/**
 * BackdropScene — living environments behind the DOM menus.
 *
 *  menu       Batch 5 Main Menu environment: sky, aurora, clouds, mountains,
 *             snow field, hero igloo, trees, pond, snowman, foreground bank,
 *             drifting snow + wind, tiny bits of environmental life.
 *  adventure  Region-themed panorama (decor chosen by THEME + FUNCTION).
 *  daily      Sunrise over the snow field with popsicle-coloured sparkles.
 *  infinite   Night sky, twinkling stars, strong aurora, ice crystals.
 *  ranked     Dusk arena with banners and spotlights.
 *  fishing    Frozen lake with the fishing hole, penguin, rod, bobber, bucket.
 *
 * Screen-space layout in CSS pixels (camera zoom = devicePixelRatio). Modes
 * crossfade; everything rebuilds on resize without touching UI state.
 */
import Phaser from 'phaser';
import { makeCanvas } from '../art/canvas';
import { REGION_BY_ID, type RegionId } from '../config/regions';
import { decorPool, groupsForRegion } from '../core/assets';
import { Rng } from '../core/rng';
import { addCanvasTexture, ensureProceduralTextures, loadAtlasGroups, loadStandaloneImages, tex } from './textures';
import type { DayPhase, MenuSeason } from '../config/menuTheme';

/** Menu theme as seen by the backdrop (menus only; the Adventure map ignores it). */
export interface BackdropTheme { season: MenuSeason; phase: DayPhase }

export type BackdropMode = 'menu' | 'adventure' | 'daily' | 'infinite' | 'ranked' | 'fishing' | 'plain';

export interface BackdropOptions {
  region?: RegionId;
  /** Penguin frame shown in scenes that feature the player (fishing). */
  penguinFrame?: string;
  /** Darken for overlay screens (0–1). */
  dim?: number;
}

interface Drifter { obj: Phaser.GameObjects.Image; vx: number; vy: number; wrapW: number; phase: number; sway: number; baseY: number }

export class BackdropScene extends Phaser.Scene {
  private mode: BackdropMode = 'menu';
  private opts: BackdropOptions = {};
  private layer: Phaser.GameObjects.Container | null = null;
  private drifters: Drifter[] = [];
  private updaters: Array<(t: number, dt: number) => void> = [];
  private reduced = () => false;
  private dpr = () => 1;
  private quality: () => string = () => 'auto';
  private theme: () => BackdropTheme = () => ({ season: 'winter', phase: 'day' });
  private dimRect: Phaser.GameObjects.Rectangle | null = null;
  private buildToken = 0;

  constructor() {
    super({ key: 'backdrop' });
  }

  init(data: { reducedMotion: () => boolean; dpr: () => number; quality: () => string; theme?: () => BackdropTheme }): void {
    this.reduced = data.reducedMotion;
    this.dpr = data.dpr;
    this.quality = data.quality;
    if (data.theme) this.theme = data.theme;
  }

  /** Seasonal props for spring/summer/autumn live in the nature atlas (loaded on demand). */
  private async ensureThemeAssets(): Promise<void> {
    if (this.theme().season !== 'winter') await loadAtlasGroups(this, ['decor-nature']);
  }

  /** Menu season / lighting changed: crossfade the current menu-type environment (never the Adventure map). */
  async themeChanged(): Promise<void> {
    if (!this.sys.isActive() || this.mode === 'adventure') return;
    const token = ++this.buildToken;
    await this.ensureThemeAssets();
    if (token !== this.buildToken || !this.sys.isActive()) return;
    const old = this.layer;
    this.drifters = [];
    this.updaters = [];
    this.layer = this.buildLayer();
    this.layer.setAlpha(0);
    this.tweens.add({ targets: this.layer, alpha: 1, duration: 900, ease: 'Sine.InOut' });
    if (old) {
      this.stopLayerTweens(old);
      this.tweens.add({ targets: old, alpha: 0, duration: 900, ease: 'Sine.InOut', onComplete: () => this.destroyLayer(old) });
    }
    this.applyDim();
  }

  create(): void {
    ensureProceduralTextures(this);
    this.makeSkyTextures();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild, this));
    this.rebuild();
    if (this.theme().season !== 'winter') void this.ensureThemeAssets().then(() => this.rebuild());
  }

  /** Switch environment with a short crossfade. */
  async setMode(mode: BackdropMode, opts: BackdropOptions = {}): Promise<void> {
    const same = mode === this.mode && JSON.stringify(opts) === JSON.stringify(this.opts);
    this.mode = mode;
    this.opts = opts;
    if (same || !this.sys.isActive()) {
      this.applyDim();
      return;
    }
    const token = ++this.buildToken;
    if (mode !== 'adventure') await this.ensureThemeAssets();
    if (mode === 'adventure' && opts.region) await loadAtlasGroups(this, groupsForRegion(opts.region));
    if (mode === 'fishing') await loadAtlasGroups(this, ['town']);
    if (mode === 'infinite' || mode === 'fishing') await loadStandaloneImages(this, ['tex_ice']);
    if (token !== this.buildToken) return;
    const old = this.layer;
    this.drifters = [];
    this.updaters = [];
    this.layer = this.buildLayer();
    this.layer.setAlpha(0);
    this.tweens.add({ targets: this.layer, alpha: 1, duration: 380, ease: 'Sine.Out' });
    if (old) {
      this.stopLayerTweens(old);
      this.tweens.add({ targets: old, alpha: 0, duration: 380, ease: 'Sine.In', onComplete: () => this.destroyLayer(old) });
    }
    this.applyDim();
  }

  private rebuild(): void {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(this.dpr());
    cam.setScroll(0, 0);
    cam.setOrigin(0, 0);
    if (this.layer) this.destroyLayer(this.layer);
    this.drifters = [];
    this.updaters = [];
    this.layer = this.buildLayer();
    this.applyDim();
  }

  /**
   * Looping ambient tweens must die with their layer: a tween re-added on a
   * destroyed target completes instantly inside the same update and would
   * loop forever.
   */
  private stopLayerTweens(layer: Phaser.GameObjects.Container): void {
    layer.setData('dead', true);
    for (const child of layer.list) this.tweens.killTweensOf(child);
  }

  private destroyLayer(layer: Phaser.GameObjects.Container): void {
    this.stopLayerTweens(layer);
    layer.destroy();
  }

  /** True while `obj` is alive and its layer has not been retired. */
  private alive(obj: Phaser.GameObjects.GameObject, layer: Phaser.GameObjects.Container): boolean {
    return obj.active && !!obj.scene && !layer.getData('dead');
  }

  private applyDim(): void {
    const { w, h } = this.size();
    if (!this.dimRect) this.dimRect = this.add.rectangle(0, 0, w, h, 0x10203f, 0).setOrigin(0, 0).setDepth(1000);
    this.dimRect.setSize(w, h);
    this.tweens.add({ targets: this.dimRect, fillAlpha: this.opts.dim ?? 0, duration: 300 });
  }

  private size(): { w: number; h: number } {
    return { w: this.scale.width / this.dpr(), h: this.scale.height / this.dpr() };
  }

  // ------------------------------------------------------------------ textures

  private makeSkyTextures(): void {
    const grad = (key: string, stops: Array<[number, string]>) => addCanvasTexture(this, key, () => {
      const { canvas, ctx } = makeCanvas(4, 256);
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      for (const [o, c] of stops) g.addColorStop(o, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256);
      return canvas;
    });
    grad('sky_day', [[0, '#3f9ee6'], [0.55, '#8fcdf3'], [1, '#d7effb']]);
    grad('sky_dawn', [[0, '#7aa6e8'], [0.45, '#f6b7a8'], [0.8, '#ffd9a3'], [1, '#fff1d6']]);
    grad('sky_night', [[0, '#0b1433'], [0.5, '#1d2b5c'], [1, '#3d4f86']]);
    grad('sky_dusk', [[0, '#2b2a5e'], [0.5, '#b4568a'], [1, '#ffb27a']]);
    grad('snowfield', [[0, '#f4fbff'], [0.5, '#e6f3fb'], [1, '#cfe6f6']]);
    grad('field_spring', [[0, '#e9f7d6'], [0.5, '#cdeeb0'], [1, '#a9dc8c']]);
    grad('field_summer', [[0, '#d9f2a6'], [0.45, '#b4e27c'], [1, '#8fcf5e']]);
    grad('field_autumn', [[0, '#f7e2b6'], [0.5, '#ecc486'], [1, '#d99d58']]);
    grad('icefield', [[0, '#e6f6ff'], [1, '#a9d6f2']]);
    addCanvasTexture(this, 'aurora', () => {
      const { canvas, ctx } = makeCanvas(1024, 320);
      for (let band = 0; band < 3; band++) {
        ctx.beginPath();
        const y0 = 90 + band * 55;
        ctx.moveTo(0, y0);
        for (let x = 0; x <= 1024; x += 32) ctx.lineTo(x, y0 + Math.sin(x / 140 + band * 1.7) * 40 + Math.sin(x / 47 + band) * 10);
        ctx.lineWidth = 46 - band * 10;
        const g = ctx.createLinearGradient(0, 0, 1024, 0);
        g.addColorStop(0, 'rgba(90,240,170,0)');
        g.addColorStop(0.25, band === 1 ? 'rgba(120,200,255,0.55)' : 'rgba(90,240,170,0.6)');
        g.addColorStop(0.7, 'rgba(110,255,200,0.5)');
        g.addColorStop(1, 'rgba(90,240,170,0)');
        ctx.strokeStyle = g;
        ctx.filter = 'blur(14px)';
        ctx.stroke();
      }
      ctx.filter = 'none';
      return canvas;
    });
    addCanvasTexture(this, 'streak', () => {
      const { canvas, ctx } = makeCanvas(220, 16);
      const g = ctx.createLinearGradient(0, 0, 220, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4, 10);
      ctx.quadraticCurveTo(110, 2, 216, 8);
      ctx.stroke();
      return canvas;
    });
    addCanvasTexture(this, 'spotlight', () => {
      const { canvas, ctx } = makeCanvas(200, 600);
      const g = ctx.createLinearGradient(0, 0, 0, 600);
      g.addColorStop(0, 'rgba(255,250,220,0.55)');
      g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(85, 0);
      ctx.lineTo(115, 0);
      ctx.lineTo(200, 600);
      ctx.lineTo(0, 600);
      ctx.closePath();
      ctx.fill();
      return canvas;
    });
    addCanvasTexture(this, 'bobber', () => {
      const { canvas, ctx } = makeCanvas(48, 48);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1b2a44';
      ctx.beginPath(); ctx.arc(24, 26, 16, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(24, 26, 16, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#ef4f4f'; ctx.fillRect(0, 0, 48, 24); ctx.restore();
      ctx.beginPath(); ctx.arc(24, 26, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 10); ctx.lineTo(24, 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(18, 20, 4, 3, -0.5, 0, Math.PI * 2); ctx.fill();
      return canvas;
    });
  }

  // ------------------------------------------------------------------ helpers

  private img(c: Phaser.GameObjects.Container, id: string, x: number, y: number, o: { w?: number; h?: number; ox?: number; oy?: number; flip?: boolean; alpha?: number; depth?: number } = {}): Phaser.GameObjects.Image {
    const t = tex(this, id);
    const im = this.add.image(x, y, t.key, t.frame).setOrigin(o.ox ?? 0.5, o.oy ?? 1);
    if (o.w) im.setScale(o.w / im.width);
    else if (o.h) im.setScale(o.h / im.height);
    if (o.flip) im.setFlipX(true);
    if (o.alpha !== undefined) im.setAlpha(o.alpha);
    c.add(im);
    return im;
  }

  /** Seasonal prop: silently skipped if its atlas page is not loaded yet (the scene rebuilds once it is). */
  private has(id: string): boolean {
    if (this.textures.exists(id)) return true;
    for (const p of ['decor-nature-0', 'decor-winter-0', 'menu-0', 'gameplay-0', 'obstacles-0', 'town-0', 'ui-0', 'waddles-0']) {
      if (this.textures.exists(p) && this.textures.get(p).has(id)) return true;
    }
    return false;
  }

  private sky(c: Phaser.GameObjects.Container, key: string, w: number, h: number): void {
    const s = this.add.image(0, 0, key).setOrigin(0, 0);
    s.setDisplaySize(w, h);
    c.add(s);
  }

  private snowfall(c: Phaser.GameObjects.Container, w: number, h: number, density: number, kinds: string[] = ['px_snow']): void {
    if (this.reduced()) return;
    const q = this.quality();
    const n = Math.round((q === 'low' ? 25 : q === 'medium' ? 50 : 80) * density);
    const rng = new Rng(`snow:${w}:${h}`);
    for (let i = 0; i < n; i++) {
      const key = kinds[i % kinds.length]!;
      const t = tex(this, key);
      const im = this.add.image(rng.range(0, w), rng.range(-h, h), t.key, t.frame);
      const big = key.startsWith('menu_snowflake');
      im.setScale(big ? rng.range(0.12, 0.22) : rng.range(0.2, 0.6)).setAlpha(rng.range(0.55, 0.95));
      c.add(im);
      this.drifters.push({ obj: im, vx: rng.range(8, 30), vy: rng.range(18, 50), wrapW: w, phase: rng.range(0, 6.28), sway: rng.range(8, 24), baseY: h });
    }
  }

  private wind(c: Phaser.GameObjects.Container, w: number, h: number, count: number): void {
    if (this.reduced()) return;
    const rng = new Rng(`wind:${w}`);
    for (let i = 0; i < count; i++) {
      const s = this.add.image(rng.range(0, w), rng.range(h * 0.15, h * 0.8), 'streak').setAlpha(0);
      c.add(s);
      const run = () => {
        if (!this.alive(s, c)) return;
        s.setPosition(-240, rng.range(h * 0.15, h * 0.85)).setAlpha(0).setScale(rng.range(0.6, 1.2), 1);
        this.tweens.add({ targets: s, x: w + 240, duration: rng.range(2600, 4200), delay: rng.range(800, 5000), ease: 'Sine.InOut',
          onStart: () => this.tweens.add({ targets: s, alpha: 0.6, yoyo: true, duration: 1300 }), onComplete: run });
      };
      run();
    }
  }

  /** Seasonal ambient particles for menu-type scenes. */
  private seasonFall(c: Phaser.GameObjects.Container, w: number, h: number, density: number): void {
    const { season, phase } = this.theme();
    const before = this.drifters.length;
    if (season === 'winter') this.snowfall(c, w, h, density, ['px_snow', 'px_snow', 'menu_snowflake_a', 'px_snow', 'menu_snowflake_b', 'px_snow', 'menu_snowflake_c']);
    else if (season === 'spring') this.snowfall(c, w, h, density * 0.55, ['px_petal']);
    else if (season === 'autumn') this.snowfall(c, w, h, density * 0.5, ['px_leaf']);
    else this.snowfall(c, w, h, density * (phase === 'night' || phase === 'dusk' ? 0.45 : 0.3), ['px_sparkle']);
    const tints = season === 'spring' ? [0xffb7d2, 0xffd6e6, 0xffffff] : season === 'autumn' ? [0xe8742a, 0xd94a2a, 0xf2b53a, 0xb8642a] : season === 'summer' ? (phase === 'night' || phase === 'dusk' ? [0xfff3a0, 0xd8ff8a] : [0xffffff, 0xfff6c8]) : null;
    if (tints) for (let i = before; i < this.drifters.length; i++) this.drifters[i]!.obj.setTint(tints[i % tints.length]!);
    if (season === 'summer') for (let i = before; i < this.drifters.length; i++) { const d = this.drifters[i]!; d.vy *= 0.25; d.sway *= 2; }
  }

  /** Local day/night lighting over a menu-type scene (stars, warm dawn/dusk grade, dark night). */
  private lighting(c: Phaser.GameObjects.Container, w: number, h: number, horizon: number): void {
    const { phase } = this.theme();
    if (phase === 'day') return;
    if (phase === 'night') {
      const rng = new Rng(`menu-stars:${Math.round(w)}`);
      for (let i = 0; i < Math.round((w * horizon) / 7000); i++) {
        const st = this.add.image(rng.range(0, w), rng.range(0, horizon * 0.85), 'px_sparkle').setScale(rng.range(0.12, 0.35)).setAlpha(rng.range(0.4, 0.95));
        c.addAt(st, 1);
        const ph = rng.range(0, 6.28), sp = rng.range(0.8, 2.4);
        if (!this.reduced()) this.updaters.push((t) => st.setAlpha(0.5 + Math.sin(t * sp + ph) * 0.35));
      }
      c.add(this.add.rectangle(0, 0, w, h, 0x0b1433, 0.46).setOrigin(0, 0));
    } else if (phase === 'dusk') {
      c.add(this.add.rectangle(0, 0, w, h, 0x5a2a6e, 0.16).setOrigin(0, 0));
    } else {
      c.add(this.add.rectangle(0, 0, w, h, 0xffa36a, 0.1).setOrigin(0, 0));
    }
  }

  private skyKey(): string {
    const p = this.theme().phase;
    return p === 'night' ? 'sky_night' : p === 'dusk' ? 'sky_dusk' : p === 'dawn' ? 'sky_dawn' : 'sky_day';
  }

  private fieldKey(): string {
    const s = this.theme().season;
    return s === 'spring' ? 'field_spring' : s === 'summer' ? 'field_summer' : s === 'autumn' ? 'field_autumn' : 'snowfield';
  }

  private buildLayer(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const { w, h } = this.size();
    switch (this.mode) {
      case 'menu': this.buildMenu(c, w, h); break;
      case 'adventure': this.buildAdventure(c, w, h); break;
      case 'daily': this.buildDaily(c, w, h); break;
      case 'infinite': this.buildInfinite(c, w, h); break;
      case 'ranked': this.buildRanked(c, w, h); break;
      case 'fishing': this.buildFishing(c, w, h); break;
      case 'plain': this.sky(c, this.skyKey(), w, h); break;
    }
    return c;
  }

  private mountains(c: Phaser.GameObjects.Container, w: number, horizon: number, bandH: number, alpha = 1): void {
    const t = tex(this, 'menu_mountains_band');
    const probe = this.add.image(0, 0, t.key, t.frame);
    const scale = bandH / probe.height;
    const tileW = probe.width * scale;
    probe.destroy();
    let x = -((tileW - w) / 2) % tileW;
    if (x > 0) x -= tileW;
    let i = 0;
    while (x < w) {
      const m = this.add.image(x, horizon, t.key, t.frame).setOrigin(0, 1).setScale(scale).setAlpha(alpha);
      if (i % 2 === 1) m.setFlipX(true);
      c.add(m);
      x += tileW - 1;
      i++;
    }
  }

  private field(c: Phaser.GameObjects.Container, key: string, w: number, h: number, horizon: number): void {
    const f = this.add.image(0, horizon - 4, key).setOrigin(0, 0);
    f.setDisplaySize(w, h - horizon + 8);
    c.add(f);
  }

  // ------------------------------------------------------------------ modes

  private buildMenu(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const { season, phase } = this.theme();
    const night = phase === 'night';
    const portrait = h > w;
    const horizon = h * (portrait ? 0.4 : 0.47);
    this.sky(c, this.skyKey(), w, horizon + 40);
    if (season === 'winter' || night) {
      const aur = this.add.image(w * 0.62, horizon * 0.25, 'aurora').setAlpha(night ? 0.5 : 0.28).setScale(Math.max(w / 1024, 0.8) * 0.9, 0.8);
      c.add(aur);
      const base = night ? 0.44 : 0.22;
      this.updaters.push((t) => { aur.x = w * 0.62 + Math.sin(t * 0.12) * 30; aur.alpha = base + Math.sin(t * 0.3) * 0.06; });
    }
    if (phase === 'day' && season === 'summer') {
      const sun = this.add.circle(w * 0.84, horizon * 0.26, Math.min(w, h) * 0.06, 0xfff3b0).setAlpha(0.95);
      c.add(this.add.circle(sun.x, sun.y, sun.radius * 1.8, 0xfff0a0, 0.22));
      c.add(sun);
    }
    // drifting clouds
    const clouds = ['menu_cloud_large', 'menu_cloud_small_a', 'menu_cloud_small_b', 'menu_cloud_small_c'];
    const rng = new Rng(`menu:${Math.round(w)}`);
    for (let i = 0; i < 6; i++) {
      const im = this.img(c, clouds[i % clouds.length]!, rng.range(0, w), rng.range(horizon * 0.12, horizon * 0.6), { h: rng.range(30, 70), oy: 0.5, alpha: night ? 0.55 : 0.95 });
      if (phase === 'dusk') im.setTint(0xffc2b0);
      else if (phase === 'dawn') im.setTint(0xffe0c8);
      this.drifters.push({ obj: im, vx: rng.range(4, 12), vy: 0, wrapW: w, phase: 0, sway: 0, baseY: -1 });
    }
    this.mountains(c, w, horizon + 6, Math.min(230, Math.max(130, h * 0.24)));
    if (season !== 'winter') {
      // Lower slopes thaw in the warm seasons (peaks keep their snow).
      const thaw = this.add.rectangle(0, horizon - Math.min(230, Math.max(130, h * 0.24)) * 0.35, w, Math.min(230, Math.max(130, h * 0.24)) * 0.35 + 8,
        season === 'autumn' ? 0xd99d58 : season === 'summer' ? 0x8fcf5e : 0xa9dc8c, 0.35).setOrigin(0, 0);
      c.add(thaw);
    }
    this.field(c, this.fieldKey(), w, h, horizon);
    // mid-ground scenery: the hero igloo is year-round identity; props follow the season.
    const iglooW = Math.min(w * (portrait ? 0.62 : 0.33), h * 0.62);
    const groundY = horizon + (h - horizon) * (portrait ? 0.3 : 0.42);
    const pond = this.img(c, 'menu_frozen_pond', w * 0.8, groundY - iglooW * 0.05, { w: iglooW * 0.9, alpha: 1 });
    if (season !== 'winter') pond.setTint(season === 'autumn' ? 0x9ac8e0 : 0x8fd0f0);
    const P = (winter: string, spring: string, summer: string, autumn: string) => (season === 'spring' ? spring : season === 'summer' ? summer : season === 'autumn' ? autumn : winter);
    const prop = (id: string, x: number, y: number, o: Parameters<BackdropScene['img']>[4] = {}) => (this.has(id) ? this.img(c, id, x, y, o) : null);
    prop(P('menu_snow_mounds', 'bush_flowers', 'berry_bush_red_10', 'leaf_pile'), w * 0.12, groundY - iglooW * 0.12, { w: iglooW * (season === 'winter' ? 0.55 : 0.32) });
    prop(P('pine_tree_7c', 'tree_cherry', 'tree_green', 'tree_autumn'), w * 0.32, groundY - iglooW * 0.14, { h: iglooW * 0.5 });
    prop(P('snowy_tree_large_10', 'tree_green', 'tree_green', 'tree_autumn'), w * 0.27, groundY - iglooW * 0.1, { h: iglooW * 0.42, flip: season !== 'winter' });
    prop(P('pine_tree_7c', 'tree_cherry', 'tree_green', 'pine_tree_10'), w * 0.7, groundY - iglooW * 0.16, { h: iglooW * 0.44, flip: true });
    prop(P('menu_snow_rock', 'rock_large_10', 'rock_large_10', 'rock_large_10'), w * 0.6, groundY + iglooW * 0.02, { w: iglooW * (season === 'winter' ? 0.32 : 0.2) });
    prop(P('menu_bushes', 'tulips', 'sunflowers', 'hay_bale'), w * 0.39, groundY + iglooW * 0.04, { w: iglooW * (season === 'winter' ? 0.28 : 0.2) });
    if (season === 'spring') prop('flower_patch_7b', w * 0.45, groundY + iglooW * 0.22, { w: iglooW * 0.22 });
    if (season === 'summer') prop('lily_pad_flower', w * 0.82, groundY - iglooW * 0.08, { w: iglooW * 0.1 });
    if (season === 'autumn') { prop('mushroom_red', w * 0.42, groundY + iglooW * 0.2, { h: iglooW * 0.1 }); prop('hay_stack', w * 0.08, groundY + iglooW * 0.05, { h: iglooW * 0.26 }); }
    // hero igloo (centerpiece)
    const igloo = this.img(c, 'menu_igloo_main', w * 0.5, groundY + iglooW * 0.12, { w: iglooW });
    // subtle life: a penguin occasionally peeks out of the igloo door
    if (!this.reduced() && !night) {
      const peek = this.img(c, 'penguin_classic', igloo.x + iglooW * 0.19, igloo.y - iglooW * 0.07, { h: iglooW * 0.13, alpha: 0 });
      c.moveBelow(peek, igloo);
      const loop = () => {
        if (!this.alive(peek, c)) return;
        this.tweens.add({ targets: peek, alpha: 1, y: igloo.y - iglooW * 0.13, delay: 3500 + Math.random() * 5000, duration: 350, ease: 'Back.Out', hold: 1400, yoyo: true, onComplete: loop });
      };
      loop();
    }
    prop(P('menu_snowman', 'plant_sprout', 'seashell', 'acorn'), w * 0.87, groundY + iglooW * 0.2, { h: iglooW * (season === 'winter' ? 0.34 : 0.1) });
    this.img(c, 'menu_wooden_sign', w * 0.14, groundY + iglooW * 0.2, { h: iglooW * 0.3 });
    prop(P('menu_rocks', 'stones_set_10', 'stones_set_10', 'stick_pile'), w * 0.22, groundY + iglooW * 0.32, { w: iglooW * (season === 'winter' ? 0.3 : 0.18) });
    if (season === 'winter') this.img(c, 'menu_ice_chunks', w * 0.76, groundY + iglooW * 0.34, { w: iglooW * 0.32 });
    else prop(P('menu_ice_chunks', 'flower_red', 'flower_yellow', 'leaf_pile'), w * 0.76, groundY + iglooW * 0.34, { w: iglooW * 0.14 });
    // foreground bank frames the bottom edge (snow in winter, grassy/leafy otherwise)
    const bankH = Math.max(70, h * 0.13);
    const bankTint = season === 'spring' ? 0xc8ecb0 : season === 'summer' ? 0xb2e08a : season === 'autumn' ? 0xf0c890 : 0xffffff;
    const b1 = this.img(c, 'menu_foreground_snowbank', 0, h + 6, { h: bankH, ox: 0, oy: 1 }).setTint(bankTint);
    const bw = b1.displayWidth;
    for (let x = bw - 2, i = 1; x < w; x += bw - 2, i++) this.img(c, 'menu_foreground_snowbank', x, h + 6, { h: bankH, ox: 0, oy: 1, flip: i % 2 === 1 }).setTint(bankTint);
    this.lighting(c, w, h, horizon);
    if (night || phase === 'dusk') {
      // Warm light spills from the igloo doorway (drawn above the darkening).
      const glow = this.add.ellipse(igloo.x + iglooW * 0.19, igloo.y - iglooW * 0.1, iglooW * 0.3, iglooW * 0.2, 0xffcf6a, night ? 0.42 : 0.24).setBlendMode(Phaser.BlendModes.ADD);
      c.add(glow);
      if (!this.reduced()) this.updaters.push((t) => glow.setAlpha((night ? 0.38 : 0.2) + Math.sin(t * 2.1) * 0.04));
    }
    this.seasonFall(c, w, h, 1);
    if (season === 'winter') this.wind(c, w, h, 2);
  }

  private buildAdventure(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const region = REGION_BY_ID[this.opts.region ?? 'classic_winter'];
    const night = region.nightTint > 0.2;
    const horizon = h * 0.36;
    this.sky(c, night ? 'sky_night' : region.id === 'fall' || region.id === 'beach' || region.id === 'summer' ? 'sky_dawn' : 'sky_day', w, horizon + 40);
    if (region.id === 'aurora' || night) {
      const aur = this.add.image(w * 0.5, horizon * 0.35, 'aurora').setAlpha(0.45).setScale(w / 900, 0.9);
      c.add(aur);
    }
    this.mountains(c, w, horizon + 6, Math.min(200, h * 0.2), night ? 0.75 : 1);
    const ground = this.add.rectangle(0, horizon, w, h - horizon, Phaser.Display.Color.HexStringToColor(region.palette.floor).color).setOrigin(0, 0);
    c.add(ground);
    const ftKey = tex(this, region.floorTexture).key;
    if (this.textures.exists(ftKey)) {
      const ts = this.add.tileSprite(w / 2, horizon + (h - horizon) / 2, w, h - horizon, ftKey).setTileScale(0.7, 0.7).setAlpha(region.palette.floorTextureAlpha * 0.8);
      c.add(ts);
    }
    const pool = decorPool(region.id, 'outside').filter((f) => f.h >= 60);
    const rng = new Rng(`adv-bg:${region.id}:${Math.round(w)}`);
    if (pool.length > 0) {
      const n = Math.ceil(w / 150);
      for (let i = 0; i < n; i++) {
        const f = rng.pick(pool);
        this.img(c, f.id, (i + rng.range(0.1, 0.9)) * (w / n), horizon + rng.range(20, 70), { h: rng.range(70, 120), flip: rng.chance(0.5) });
      }
      for (let i = 0; i < Math.ceil(n / 2); i++) {
        const f = rng.pick(pool);
        this.img(c, f.id, rng.range(0, w), h + 10, { h: rng.range(110, 170), flip: rng.chance(0.5), alpha: 0.95 });
      }
    }
    if (night) c.add(this.add.rectangle(0, 0, w, h, 0x0b1433, region.nightTint * 0.6).setOrigin(0, 0));
    const wk = region.weather.kind;
    if (wk !== 'none') this.snowfall(c, w, h, Math.max(0.3, region.weather.density), [wk === 'leaves' ? 'px_leaf' : wk === 'petals' ? 'px_petal' : wk === 'sprinkles' ? 'px_sprinkle' : wk === 'sparkles' ? 'px_sparkle' : 'px_snow']);
  }

  private buildDaily(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const horizon = h * 0.5;
    const ph = this.theme().phase;
    this.sky(c, ph === 'night' ? 'sky_night' : ph === 'dusk' ? 'sky_dusk' : 'sky_dawn', w, horizon + 40);
    const sun = this.add.circle(w * 0.72, horizon - h * 0.08, Math.min(w, h) * 0.09, ph === 'night' ? 0xeef2ff : 0xfff1b8).setAlpha(0.95);
    c.add(sun);
    c.add(this.add.circle(sun.x, sun.y, sun.radius * 1.6, 0xffe3a0, 0.25));
    this.mountains(c, w, horizon + 6, Math.min(220, h * 0.22));
    this.field(c, this.fieldKey(), w, h, horizon);
    const season = this.theme().season;
    const P = (winter: string, spring: string, summer: string, autumn: string) => (season === 'spring' ? spring : season === 'summer' ? summer : season === 'autumn' ? autumn : winter);
    ((id: string, ...a: [number, number, Parameters<BackdropScene['img']>[4]]) => (this.has(id) ? this.img(c, id, ...a) : null))(P('snowman_large_8a', 'tree_cherry', 'sunflowers', 'hay_stack'), w * 0.12, h * 0.86, { h: h * 0.22 });
    ((id: string, ...a: [number, number, Parameters<BackdropScene['img']>[4]]) => (this.has(id) ? this.img(c, id, ...a) : null))(P('pine_tree_7c', 'tree_green', 'tree_green', 'tree_autumn'), w * 0.9, h * 0.8, { h: h * 0.26 });
    ((id: string, ...a: [number, number, Parameters<BackdropScene['img']>[4]]) => (this.has(id) ? this.img(c, id, ...a) : null))(P('snowy_tree_small_10', 'tulips', 'flower_patch_10', 'leaf_pile'), w * 0.82, h * 0.86, { h: h * (season === 'winter' ? 0.18 : 0.1) });
    this.lighting(c, w, h, horizon);
    this.snowfall(c, w, h, 0.6, ['px_sparkle', season === 'spring' ? 'px_petal' : season === 'autumn' ? 'px_leaf' : season === 'summer' ? 'px_sparkle' : 'px_snow']);
    // popsicle-coloured sparkles
    for (const d of this.drifters) if (d.obj.texture.key === 'px_sparkle') d.obj.setTint([0xef6f9c, 0xf6c945, 0x7fd0f0, 0x8fd18a][Math.floor(Math.random() * 4)]!);
  }

  private buildInfinite(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const horizon = h * 0.58;
    this.sky(c, 'sky_night', w, horizon + 40);
    const rng = new Rng(`stars:${Math.round(w)}`);
    for (let i = 0; i < Math.round(w * horizon / 9000); i++) {
      const s = this.add.image(rng.range(0, w), rng.range(0, horizon), 'px_sparkle').setScale(rng.range(0.15, 0.45)).setAlpha(rng.range(0.4, 1));
      c.add(s);
      const ph = rng.range(0, 6.28), sp = rng.range(1, 3);
      this.updaters.push((t) => s.setAlpha(0.45 + Math.sin(t * sp + ph) * 0.4));
    }
    const aur = this.add.image(w * 0.5, horizon * 0.42, 'aurora').setAlpha(0.7).setScale(w / 820, 1.15);
    c.add(aur);
    this.updaters.push((t) => { aur.x = w * 0.5 + Math.sin(t * 0.15) * 50; aur.alpha = 0.6 + Math.sin(t * 0.4) * 0.12; });
    this.mountains(c, w, horizon + 6, Math.min(210, h * 0.2), 0.7);
    const ice = this.add.image(0, horizon - 4, 'icefield').setOrigin(0, 0).setDisplaySize(w, h - horizon + 8).setTint(0x8fb2e0);
    c.add(ice);
    this.img(c, 'ice_spike_8b', w * 0.1, h * 0.9, { h: h * 0.24 });
    this.img(c, 'ice_pillar_8b', w * 0.2, h * 0.84, { h: h * 0.2 });
    this.img(c, 'ice_plant', w * 0.86, h * 0.9, { h: h * 0.2 });
    this.img(c, 'ice_boulder_7c', w * 0.76, h * 0.84, { h: h * 0.16 });
    c.add(this.add.rectangle(0, 0, w, h, 0x0b1433, 0.18).setOrigin(0, 0));
    const before = this.drifters.length;
    this.snowfall(c, w, h, 0.4, ['px_sparkle']);
    const tint = { winter: 0xbfe8ff, spring: 0xffc8e0, summer: 0xfff3a0, autumn: 0xffc890 }[this.theme().season];
    for (let i = before; i < this.drifters.length; i++) this.drifters[i]!.obj.setTint(tint);
  }

  private buildRanked(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const horizon = h * 0.52;
    this.sky(c, 'sky_dusk', w, horizon + 40);
    this.mountains(c, w, horizon + 6, Math.min(210, h * 0.2), 0.85);
    this.field(c, 'snowfield', w, h, horizon);
    c.add(this.add.rectangle(0, horizon, w, h - horizon, 0x6a3a6e, 0.12).setOrigin(0, 0));
    for (const [x, flip] of [[w * 0.08, false], [w * 0.92, true]] as Array<[number, boolean]>) {
      this.img(c, 'banner_7b', x, horizon + h * 0.16, { h: h * 0.26, flip });
      this.img(c, 'flag_fish_8a', x + (flip ? -w * 0.08 : w * 0.08), horizon + h * 0.1, { h: h * 0.18, flip });
    }
    this.img(c, 'festival_banner', w * 0.5, horizon + h * 0.02, { w: Math.min(w * 0.5, 520), alpha: 0.95 });
    for (const [x, rot] of [[w * 0.18, 0.35], [w * 0.82, -0.35]] as Array<[number, number]>) {
      const sp = this.add.image(x, -20, 'spotlight').setOrigin(0.5, 0).setRotation(rot).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(w * 0.3, h * 1.1);
      c.add(sp);
      const ph = Math.random() * 6;
      this.updaters.push((t) => { sp.rotation = rot + Math.sin(t * 0.6 + ph) * 0.12; });
    }
    this.seasonFall(c, w, h, 0.5);
  }

  private buildFishing(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const horizon = h * 0.4;
    this.sky(c, this.skyKey(), w, horizon + 40);
    this.mountains(c, w, horizon + 6, Math.min(200, h * 0.2));
    this.field(c, 'snowfield', w, h, horizon);
    const lake = this.add.ellipse(w * 0.5, h * 0.74, w * 1.1, (h - horizon) * 1.05, 0xbfe2f7);
    c.add(lake);
    if (this.textures.exists('tex_ice')) {
      const ts = this.add.tileSprite(w * 0.5, h * 0.74, w * 1.1, (h - horizon) * 1.05, 'tex_ice').setTileScale(0.8, 0.8).setAlpha(0.6);
      c.add(ts);
    }
    const S = Math.min(w * 0.42, h * 0.55);
    this.img(c, 'storage_shed', w * 0.1, horizon + S * 0.32, { h: S * 0.42 });
    this.img(c, 'fish_drying_rack', w * 0.86, horizon + S * 0.42, { h: S * 0.4 });
    this.img(c, 'net_rack', w * 0.74, horizon + S * 0.3, { h: S * 0.32 });
    this.img(c, 'flag_fish_8a', w * 0.24, horizon + S * 0.3, { h: S * 0.36 });
    const holeX = w * 0.56, holeY = h * 0.8;
    this.img(c, 'ice_fishing_hole', holeX, holeY, { w: S * 0.55, oy: 0.5 });
    this.img(c, 'bucket_8a', holeX + S * 0.42, holeY + S * 0.1, { h: S * 0.2 });
    const pf = this.opts.penguinFrame ?? 'penguin_classic';
    const peng = this.img(c, pf, holeX - S * 0.45, holeY + S * 0.12, { h: S * 0.36 });
    // rod + line + bobber (procedural)
    const g = this.add.graphics();
    c.add(g);
    const bob = this.add.image(holeX, holeY - 6, 'bobber').setScale(S / 520);
    c.add(bob);
    this.updaters.push((t) => {
      const by = holeY - 6 + Math.sin(t * 2.2) * 3;
      bob.y = by;
      bob.rotation = Math.sin(t * 1.7) * 0.12;
      g.clear();
      const hx = peng.x + S * 0.12, hy = peng.y - S * 0.2;
      const tipX = holeX - S * 0.06, tipY = hy - S * 0.22;
      g.lineStyle(Math.max(4, S * 0.022), 0x1b2a44, 1);
      g.lineBetween(hx, hy, tipX, tipY);
      g.lineStyle(Math.max(2, S * 0.012), 0x8a5a2b, 1);
      g.lineBetween(hx, hy, tipX, tipY);
      g.lineStyle(1.5, 0x334466, 0.9);
      g.lineBetween(tipX, tipY, holeX, by - 12 * (S / 520) * 2);
    });
    this.lighting(c, w, h, horizon);
    this.seasonFall(c, w, h, 0.5);
  }

  override update(time: number, delta: number): void {
    const t = time / 1000, dt = Math.min(0.1, delta / 1000);
    for (const d of this.drifters) {
      d.obj.x += d.vx * dt;
      if (d.baseY > 0) {
        d.obj.y += d.vy * dt;
        d.obj.x += Math.sin(t * 1.2 + d.phase) * d.sway * dt;
        if (d.obj.y > d.baseY + 20) d.obj.y = -20;
      }
      if (d.obj.x > d.wrapW + 120) d.obj.x = -120;
    }
    for (const u of this.updaters) u(t, dt);
  }
}
