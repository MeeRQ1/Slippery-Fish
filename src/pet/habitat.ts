/**
 * PetHabitat — the goldfish tank, drawn on a small 2D canvas (no second
 * physics world, no Phaser scene). One lightweight rAF loop that:
 *  - runs only while the canvas is on screen and the page is visible
 *    (IntersectionObserver + visibilitychange) and stops when destroyed;
 *  - lowers detail on low quality and freezes motion under reduced motion
 *    (the fish still changes routine, shown as a calm pose);
 *  - persists nothing per frame (durable pet state lives in the save).
 *
 * Coordinates are a fixed 300×220 logical space scaled to the canvas.
 */
import type { DecorPreset, FishLook, FoodPreset, TankStyle } from '../config/pet';
import { RoutineScheduler, type RoutineId } from './routines';

export interface HabitatState {
  look: FishLook;
  tank: TankStyle;
  decor: readonly DecorPreset[];
  food: FoodPreset;
  tier: number;
  /** Displayed lighting is night (menu theme) → dark water + warm lamp. */
  night: boolean;
  /** Not yet fed today: occasional friendly "hungry" bubble (no penalty). */
  hungry: boolean;
}

export interface HabitatOptions {
  reducedMotion: () => boolean;
  quality: () => string;
  /** Optional hook for presentation sounds (bubble, munch, sprinkle). */
  sound?: (id: 'petBubble' | 'petMunch' | 'feedSprinkle') => void;
}

const W = 300, H = 220;
const NAVY = '#1b2a44';

interface Food { x: number; y: number; vy: number; sway: number; ph: number; eaten: boolean }
interface Bubble { x: number; y: number; r: number; vy: number; life: number }
interface Heart { x: number; y: number; t: number }

export class PetHabitat {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private time = 0;
  private visible = true;
  private onScreen = true;
  private destroyed = false;
  private io: IntersectionObserver | null = null;
  private routine = new RoutineScheduler();
  private fish = { x: 150, y: 120, vx: 0, vy: 0, face: 1, tail: 0, eat: 0, tx: 150, ty: 120 };
  private foods: Food[] = [];
  private bubbles: Bubble[] = [];
  private hearts: Heart[] = [];
  private feedResolve: (() => void) | null = null;
  private feeding = false;
  private ball = { x: 120, y: 150, vx: 30, vy: 0 };
  private hungryBubbleT = 6;
  private cssW = 0;
  private cssH = 0;

  constructor(private canvas: HTMLCanvasElement, private state: () => HabitatState, private opts: HabitatOptions) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    document.addEventListener('visibilitychange', this.onVisibility);
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
        this.onScreen = entries.some((e) => e.isIntersecting);
        this.kick();
      });
      this.io.observe(canvas);
    }
  }

  /** What the fish is doing right now (for accessible status text). */
  get activity(): string {
    return this.feeding ? 'Eating' : this.routine.current.label;
  }

  start(): void {
    this.kick();
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.io?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.feedResolve?.();
  }

  /** Plays the feeding presentation. Payment/reward already happened (never waits on this). */
  feed(): Promise<void> {
    const rm = this.opts.reducedMotion();
    const n = this.opts.quality() === 'low' ? 6 : 10;
    this.foods = [];
    for (let i = 0; i < n; i++) this.foods.push({ x: 110 + Math.random() * 90, y: 40 - Math.random() * 30, vy: 14 + Math.random() * 16, sway: 4 + Math.random() * 6, ph: Math.random() * 6, eaten: false });
    this.feeding = true;
    this.opts.sound?.('feedSprinkle');
    this.kick();
    return new Promise((resolve) => {
      this.feedResolve = resolve;
      if (rm) {
        // Calm version: food appears, fish eats in a few gentle steps.
        setTimeout(() => this.finishFeeding(), 1200);
      }
    });
  }

  private finishFeeding(): void {
    if (!this.feeding) return;
    this.feeding = false;
    this.foods = [];
    for (let i = 0; i < 3; i++) this.hearts.push({ x: this.fish.x + (i - 1) * 12, y: this.fish.y - 16, t: -i * 0.2 });
    this.feedResolve?.();
    this.feedResolve = null;
  }

  private onVisibility = (): void => {
    this.visible = document.visibilityState === 'visible';
    if (this.visible) this.routine.resume();
    this.kick();
  };

  private kick(): void {
    if (this.destroyed) return;
    const run = this.visible && this.onScreen;
    if (run && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    } else if (!run) this.stop();
  }

  private loop = (now: number): void => {
    this.raf = 0;
    if (this.destroyed || !this.visible || !this.onScreen) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.update(this.opts.reducedMotion() ? dt * 0.35 : dt);
    this.draw();
    // Low quality: ~30 fps is plenty for a menu companion.
    if (this.opts.quality() === 'low') setTimeout(() => this.kick(), 33);
    else this.raf = requestAnimationFrame(this.loop);
  };

  // ------------------------------------------------------------------ simulation (cosmetic)

  private anchor(id: RoutineId): [number, number] {
    const t = this.time;
    switch (id) {
      case 'shower': return [78, 78 + Math.sin(t * 3) * 3];
      case 'brushTeeth': return [120, 110];
      case 'stretch': return [150, 115 + Math.sin(t * 1.4) * 8];
      case 'swimLaps': return [150 + Math.sin(t * 0.55) * 95, 105 + Math.sin(t * 1.1) * 14];
      case 'playBall': return [this.ball.x - 16 * Math.sign(this.ball.vx || 1), this.ball.y - 6];
      case 'explore': {
        const pts: Array<[number, number]> = [[70, 150], [150, 140], [230, 150], [200, 90], [100, 90]];
        return pts[Math.floor(t / 4) % pts.length]!;
      }
      case 'chaseBubbles': return [150 + Math.sin(t * 0.9) * 60, 120 - ((t * 18) % 70)];
      case 'floatRelax': return [150 + Math.sin(t * 0.25) * 30, 70 + Math.sin(t * 0.8) * 4];
      case 'readBook': return [212, 150];
      case 'stargaze': return [150, 62];
      case 'fishflex': return [150, 150];
      case 'couchDoze': return [86, 156];
      case 'sleep': return [190, 168 + Math.sin(t * 0.9) * 2];
    }
  }

  private update(dt: number): void {
    this.time += dt;
    const s = this.state();
    if (!this.feeding) this.routine.update(dt);
    const f = this.fish;
    let [tx, ty] = this.anchor(this.routine.current.id);
    if (this.feeding) {
      let best: Food | null = null, bd = Infinity;
      for (const fd of this.foods) {
        if (fd.eaten) continue;
        fd.y += fd.vy * dt;
        fd.x += Math.sin(this.time * 2 + fd.ph) * fd.sway * dt;
        if (fd.y > 172) { fd.y = 172; fd.vy = 0; }
        const d = (fd.x - f.x) ** 2 + (fd.y - f.y) ** 2;
        if (d < bd) { bd = d; best = fd; }
      }
      if (best) {
        tx = best.x; ty = best.y;
        if (bd < 14 * 14) { best.eaten = true; f.eat = 0.35; this.opts.sound?.('petMunch'); }
      } else this.finishFeeding();
    }
    // Smooth steering toward the target (critically damped-ish).
    const k = this.feeding ? 7 : 2.6;
    f.vx += ((tx - f.x) * k - f.vx * 2.2) * dt;
    f.vy += ((ty - f.y) * k - f.vy * 2.2) * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.x = Math.max(40, Math.min(260, f.x));
    f.y = Math.max(46, Math.min(176, f.y));
    if (Math.abs(f.vx) > 4) f.face = f.vx > 0 ? 1 : -1;
    else if (this.routine.current.id === 'fishflex') f.face = 1;
    const sleepy = this.isSleepy();
    f.tail += dt * (sleepy ? 3 : 8 + Math.min(10, Math.hypot(f.vx, f.vy) * 0.2));
    f.eat = Math.max(0, f.eat - dt);
    // Ball physics (cosmetic).
    if (this.routine.current.id === 'playBall') {
      const b = this.ball;
      b.vy += 60 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > 165) { b.y = 165; b.vy = -Math.abs(b.vy) * 0.8 - 20; }
      if (b.x < 60 || b.x > 240) b.vx = -b.vx;
      if ((b.x - f.x) ** 2 + (b.y - f.y) ** 2 < 22 * 22) { b.vx = (b.x - f.x) * 3; b.vy = -40; }
    }
    // Bubbles: bubble stone (tier ≥ 2), routines, sleeping Zzz handled in draw.
    const q = this.opts.quality();
    const rate = (s.tier >= 2 ? 1.6 : 0.5) * (q === 'low' ? 0.5 : 1) + (this.routine.current.id === 'chaseBubbles' ? 2 : 0) + (this.routine.current.id === 'shower' ? 1.5 : 0);
    if (Math.random() < rate * dt) this.bubbles.push({ x: s.tier >= 2 ? 236 + Math.random() * 6 : 60 + Math.random() * 180, y: 176, r: 1.5 + Math.random() * 3, vy: 18 + Math.random() * 18, life: 6 });
    for (const b of this.bubbles) { b.y -= b.vy * dt; b.x += Math.sin(this.time * 3 + b.r) * 6 * dt; b.life -= dt; }
    this.bubbles = this.bubbles.filter((b) => b.y > 40 && b.life > 0).slice(-40);
    for (const h of this.hearts) h.t += dt;
    this.hearts = this.hearts.filter((h) => h.t < 1.6);
    if (s.hungry && !this.feeding) {
      this.hungryBubbleT -= dt;
      if (this.hungryBubbleT < -2.5) this.hungryBubbleT = 9 + Math.random() * 6;
    }
  }

  private isSleepy(): boolean {
    const id = this.routine.current.id;
    return !this.feeding && (id === 'sleep' || id === 'couchDoze');
  }

  // ------------------------------------------------------------------ drawing

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1) * (this.opts.quality() === 'low' ? 0.75 : 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (w !== this.cssW || h !== this.cssH) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.cssW = w;
      this.cssH = h;
    }
  }

  draw(): void {
    this.resize();
    const ctx = this.ctx;
    const s = this.state();
    const sc = Math.min(this.cssW / W, this.cssH / H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.setTransform(sc, 0, 0, sc, (this.cssW - W * sc) / 2, (this.cssH - H * sc) / 2);
    const tank = s.tank;
    this.drawStand(ctx, tank);
    ctx.save();
    this.tankPath(ctx, tank.shape);
    ctx.clip();
    // water
    const g = ctx.createLinearGradient(0, 30, 0, 190);
    g.addColorStop(0, tank.waterTop);
    g.addColorStop(1, tank.waterBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // light rays
    if (this.opts.quality() !== 'low' && !s.night) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        const x = 70 + i * 70 + Math.sin(this.time * 0.4 + i) * 10;
        ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x + 26, 30); ctx.lineTo(x + 60, 190); ctx.lineTo(x + 20, 190); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this.drawGravel(ctx, tank, s.tier);
    for (const d of s.decor) this.drawDecor(ctx, d);
    this.drawRoutineProps(ctx, 'back');
    if (s.tier >= 4) this.drawCushion(ctx);
    // food
    for (const fd of this.foods) if (!fd.eaten) this.drawFood(ctx, s.food, fd.x, fd.y);
    this.drawFish(ctx, s.look, s.tier);
    this.drawRoutineProps(ctx, 'front');
    if (this.routine.current.id === 'playBall') this.drawBall(ctx);
    // bubbles
    ctx.lineWidth = 1.2;
    for (const b of this.bubbles) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const h of this.hearts) if (h.t > 0) this.drawHeart(ctx, h.x + Math.sin(h.t * 6) * 3, h.y - h.t * 26, 1 - h.t / 1.6);
    if (this.isSleepy()) this.drawZzz(ctx);
    // night: darker water + warm lamp pool
    if (s.night) {
      ctx.fillStyle = 'rgba(8,18,52,0.48)';
      ctx.fillRect(0, 0, W, H);
      const lg = ctx.createRadialGradient(150, 30, 6, 150, 70, 120);
      lg.addColorStop(0, 'rgba(255,214,140,0.55)');
      lg.addColorStop(0.6, 'rgba(255,190,110,0.16)');
      lg.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    this.drawGlass(ctx, tank);
    if (s.night) this.drawLamp(ctx);
    if (s.hungry && this.hungryBubbleT < 0 && !this.feeding) this.drawSpeech(ctx, 'Snack time?');
  }

  private tankPath(ctx: CanvasRenderingContext2D, shape: TankStyle['shape']): void {
    ctx.beginPath();
    if (shape === 'bowl') {
      ctx.moveTo(92, 34);
      ctx.bezierCurveTo(20, 60, 22, 196, 150, 196);
      ctx.bezierCurveTo(278, 196, 280, 60, 208, 34);
      ctx.closePath();
    } else if (shape === 'igloo') {
      ctx.moveTo(30, 194);
      ctx.lineTo(30, 120);
      ctx.bezierCurveTo(30, 30, 270, 30, 270, 120);
      ctx.lineTo(270, 194);
      ctx.closePath();
    } else {
      const r = 14;
      ctx.moveTo(28 + r, 34); ctx.lineTo(272 - r, 34); ctx.quadraticCurveTo(272, 34, 272, 34 + r);
      ctx.lineTo(272, 194); ctx.lineTo(28, 194); ctx.lineTo(28, 34 + r); ctx.quadraticCurveTo(28, 34, 28 + r, 34);
      ctx.closePath();
    }
  }

  private drawStand(ctx: CanvasRenderingContext2D, tank: TankStyle): void {
    ctx.fillStyle = 'rgba(27,42,68,0.18)';
    ctx.beginPath(); ctx.ellipse(150, 208, 128, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (tank.shape === 'tank') {
      ctx.fillStyle = tank.frame;
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.rect(22, 192, 256, 12); ctx.fill(); ctx.stroke();
    }
  }

  private drawGlass(ctx: CanvasRenderingContext2D, tank: TankStyle): void {
    ctx.save();
    this.tankPath(ctx, tank.shape);
    ctx.lineWidth = 5;
    ctx.strokeStyle = NAVY;
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    if (tank.shape === 'bowl') { ctx.arc(150, 118, 92, Math.PI * 1.08, Math.PI * 1.32); }
    else if (tank.shape === 'igloo') { ctx.arc(150, 120, 104, Math.PI * 1.1, Math.PI * 1.3); }
    else { ctx.moveTo(40, 52); ctx.lineTo(40, 110); }
    ctx.stroke();
    if (tank.shape === 'bowl') {
      ctx.fillStyle = tank.frame;
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(150, 34, 60, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (tank.shape === 'tank') {
      ctx.fillStyle = tank.frame;
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.rect(22, 26, 256, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tank.frameHi;
      ctx.fillRect(26, 28, 248, 3);
    } else {
      // igloo blocks on the frame
      ctx.strokeStyle = 'rgba(27,42,68,0.25)';
      ctx.lineWidth = 1.5;
      for (const y of [80, 120, 160]) { ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(266, y); ctx.stroke(); }
    }
    ctx.restore();
  }

  private drawGravel(ctx: CanvasRenderingContext2D, tank: TankStyle, tier: number): void {
    ctx.fillStyle = tank.gravel[1];
    ctx.beginPath(); ctx.moveTo(0, 178); ctx.quadraticCurveTo(150, 166, 300, 180); ctx.lineTo(300, 220); ctx.lineTo(0, 220); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 46; i++) {
      const x = (i * 53) % 280 + 10, y = 180 + ((i * 29) % 16);
      ctx.fillStyle = tank.gravel[i % 3]!;
      ctx.beginPath(); ctx.ellipse(x, y, 4 + (i % 3), 3, 0, 0, Math.PI * 2); ctx.fill();
      if (tier >= 3 && i % 5 === 0) {
        ctx.fillStyle = `rgba(160,255,230,${0.45 + Math.sin(this.time * 2 + i) * 0.25})`;
        ctx.beginPath(); ctx.arc(x, y - 1, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (tier >= 2) {
      // bubble stone
      ctx.fillStyle = '#8a95a8'; ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(239, 178, 10, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  private drawDecor(ctx: CanvasRenderingContext2D, d: DecorPreset): void {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = NAVY;
    const t = this.time;
    switch (d.kind) {
      case 'kelp':
        for (const [x, hgt, c] of [[52, 70, '#3fae6a'], [64, 52, '#5cc47f'], [262, 60, '#3fae6a']] as Array<[number, number, string]>) {
          ctx.strokeStyle = c; ctx.lineWidth = 7; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, 186);
          ctx.quadraticCurveTo(x + Math.sin(t * 1.3 + x) * 10, 186 - hgt / 2, x + Math.sin(t * 1.1 + x) * 6, 186 - hgt);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        break;
      case 'castle':
        ctx.fillStyle = '#eaf4fb';
        ctx.beginPath(); ctx.rect(196, 140, 40, 42); ctx.rect(190, 128, 14, 54); ctx.rect(228, 128, 14, 54); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3d8fd6'; ctx.beginPath(); ctx.arc(216, 182, 8, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(197, 128, 9, 4, 0, 0, Math.PI * 2); ctx.ellipse(235, 128, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'sled':
        ctx.fillStyle = '#c84a3a';
        ctx.beginPath(); ctx.rect(90, 168, 46, 10); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#6f3f1d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(84, 182); ctx.lineTo(140, 182); ctx.quadraticCurveTo(148, 182, 146, 174); ctx.stroke();
        break;
      case 'snowman':
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(250, 170, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(250, 150, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f39a2c'; ctx.beginPath(); ctx.moveTo(250, 150); ctx.lineTo(260, 152); ctx.lineTo(250, 154); ctx.fill();
        break;
      case 'chest':
        ctx.fillStyle = '#b8742a';
        ctx.beginPath(); ctx.rect(110, 166, 34, 18); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d4955a'; ctx.beginPath(); ctx.ellipse(127, 166, 17, 7, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f7c531'; ctx.beginPath(); ctx.rect(124, 168, 6, 7); ctx.fill();
        break;
      case 'arch':
        ctx.strokeStyle = '#bfe6ff'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(160, 184, 26, Math.PI, 0); ctx.stroke();
        ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(160, 184, 31, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(160, 184, 21, Math.PI, 0); ctx.stroke();
        break;
      case 'shell':
        ctx.fillStyle = '#ffd6e0';
        ctx.beginPath(); ctx.moveTo(76, 184); ctx.arc(86, 184, 12, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(86, 178, 3.2, 0, Math.PI * 2); ctx.fill();
        break;
    }
  }

  private drawRoutineProps(ctx: CanvasRenderingContext2D, layer: 'back' | 'front'): void {
    if (this.feeding) return;
    const id = this.routine.current.id;
    const fade = Math.min(1, this.routine.elapsed / 1.2, this.routine.remaining / 1.2);
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = NAVY;
    const t = this.time;
    if (layer === 'back') {
      if (id === 'fishflex') {
        // Tiny TV on a stand (original "Fishflex" parody — no third-party branding).
        ctx.fillStyle = '#2a2f4a';
        ctx.beginPath(); ctx.rect(196, 132, 64, 42); ctx.fill(); ctx.stroke();
        const hue = (t * 40) % 360;
        ctx.fillStyle = `hsl(${hue},70%,60%)`; ctx.fillRect(200, 136, 56, 30);
        ctx.fillStyle = `hsl(${(hue + 120) % 360},80%,70%)`; ctx.beginPath(); ctx.arc(214 + Math.sin(t * 2) * 8, 152, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 7px sans-serif'; ctx.fillText('FISHFLEX', 206, 164);
        ctx.fillStyle = '#6f3f1d'; ctx.fillRect(222, 174, 12, 8);
      }
      if (id === 'couchDoze' || (id === 'fishflex' && this.routine.timeBand === 'night')) {
        ctx.fillStyle = '#c84a6a';
        ctx.beginPath(); ctx.rect(56, 160, 64, 18); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(50, 150, 12, 28); ctx.rect(114, 150, 12, 28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e86a8a'; ctx.beginPath(); ctx.rect(62, 146, 52, 16); ctx.fill(); ctx.stroke();
      }
      if (id === 'shower') {
        ctx.strokeStyle = '#8a95a8'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(50, 36); ctx.lineTo(50, 52); ctx.lineTo(70, 52); ctx.stroke();
        ctx.fillStyle = '#b9c2cf'; ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(76, 54, 10, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 7; i++) { const yy = 60 + ((t * 60 + i * 9) % 30); ctx.beginPath(); ctx.ellipse(70 + i * 2, yy, 1.2, 2.4, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      if (id === 'readBook') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(214, 160); ctx.lineTo(232, 156); ctx.lineTo(232, 170); ctx.lineTo(214, 174); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(214, 160); ctx.lineTo(196, 156); ctx.lineTo(196, 170); ctx.lineTo(214, 174); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else {
      if (id === 'brushTeeth') {
        const f = this.fish;
        const bx = f.x + f.face * 24, by = f.y + 2 + Math.sin(t * 16) * 2;
        ctx.strokeStyle = '#3d8fd6'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + f.face * 18, by + 6); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(bx - f.face * 2 + Math.sin(t * 5 + i) * 4, by - 4 - i * 3, 2 + (i % 2), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      }
    }
    ctx.restore();
  }

  private drawCushion(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#9b5de5'; ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(178, 182, 22, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7c531'; ctx.beginPath(); ctx.arc(158, 182, 2.5, 0, Math.PI * 2); ctx.arc(198, 182, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  private drawBall(ctx: CanvasRenderingContext2D): void {
    const b = this.ball;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.x / 10);
    ctx.lineWidth = 2; ctx.strokeStyle = NAVY;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = ['#ef4f6a', '#ffffff', '#3d8fd6', '#f7c531'][i]!;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 9, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  private drawFood(ctx: CanvasRenderingContext2D, food: FoodPreset, x: number, y: number): void {
    const c = food.colors[Math.abs(Math.round(x * 7)) % food.colors.length]!;
    ctx.fillStyle = c;
    ctx.strokeStyle = 'rgba(27,42,68,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (food.shape === 'pellet') ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    else if (food.shape === 'heart') { ctx.moveTo(x, y + 2.6); ctx.bezierCurveTo(x - 5, y - 1, x - 2, y - 4, x, y - 1.4); ctx.bezierCurveTo(x + 2, y - 4, x + 5, y - 1, x, y + 2.6); }
    else if (food.shape === 'star') { for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 1.5 : 3.6; if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
    else ctx.ellipse(x, y, 3.4, 1.8, (x * 0.3) % Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawFish(ctx: CanvasRenderingContext2D, look: FishLook, tier: number): void {
    const f = this.fish;
    paintFish(ctx, look, {
      x: f.x, y: f.y, face: f.face, tail: f.tail, eat: f.eat, tier, time: this.time,
      sleepy: this.isSleepy(), excited: this.feeding,
      stretch: this.routine.current.id === 'stretch' && !this.feeding ? 1 + Math.sin(this.time * 2.4) * 0.08 : 1,
    });
  }

  private drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, a: number): void {
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#ff5c7a'; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.bezierCurveTo(x - 8, y - 1, x - 4, y - 7, x, y - 2.4); ctx.bezierCurveTo(x + 4, y - 7, x + 8, y - 1, x, y + 4); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawZzz(ctx: CanvasRenderingContext2D): void {
    const f = this.fish;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 2;
    ctx.font = 'bold 11px sans-serif';
    for (let i = 0; i < 3; i++) {
      const p = (this.time * 0.5 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(p * Math.PI);
      const x = f.x + 14 + p * 16, y = f.y - 18 - p * 26;
      ctx.strokeText('z', x, y);
      ctx.fillText('z', x, y);
    }
    ctx.restore();
  }

  private drawLamp(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(150, 0); ctx.lineTo(150, 12); ctx.stroke();
    ctx.fillStyle = '#f2b53a';
    ctx.beginPath(); ctx.moveTo(136, 24); ctx.lineTo(164, 24); ctx.lineTo(158, 12); ctx.lineTo(142, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    const glow = ctx.createRadialGradient(150, 26, 1, 150, 26, 18);
    glow.addColorStop(0, 'rgba(255,240,190,1)');
    glow.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(150, 26, 18, 0, Math.PI * 2); ctx.fill();
  }

  private drawSpeech(ctx: CanvasRenderingContext2D, text: string): void {
    const f = this.fish;
    const x = Math.min(220, Math.max(70, f.x)), y = Math.max(30, f.y - 34);
    ctx.save();
    ctx.font = 'bold 11px Fredoka, sans-serif';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 12, w, 20, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = NAVY; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 2);
    ctx.restore();
  }
}

export interface FishPose { x: number; y: number; face: number; tail: number; eat: number; tier: number; time: number; sleepy: boolean; excited: boolean; stretch: number }

/** Paints the goldfish (shared by the live habitat and the static preview icons). */
export function paintFish(ctx: CanvasRenderingContext2D, look: FishLook, f: FishPose): void {
  const { sleepy, stretch, tier } = f;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.face * stretch, 1 / stretch);
  if (sleepy) ctx.rotate(0.08);
  const wag = Math.sin(f.tail) * 0.35;
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = NAVY;
  // tail
  ctx.save();
  ctx.translate(-20, 0);
  ctx.rotate(wag);
  ctx.fillStyle = look.fin;
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.quadraticCurveTo(-14, -18, -20, -14); ctx.quadraticCurveTo(-12, 0, -20, 14); ctx.quadraticCurveTo(-14, 18, 2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // dorsal fin
  ctx.fillStyle = look.fin;
  ctx.beginPath(); ctx.moveTo(-8, -13); ctx.quadraticCurveTo(0, -24 - Math.sin(f.tail) * 2, 8, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
  // body
  ctx.fillStyle = look.body;
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 15, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = look.belly; ctx.beginPath(); ctx.ellipse(2, 8, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.patternColor;
  if (look.pattern === 'spots') for (const [x, y, r] of [[-8, -6, 3], [2, -9, 2.4], [-14, 2, 2], [6, -2, 2]] as const) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  else if (look.pattern === 'patches') { ctx.beginPath(); ctx.ellipse(-6, -6, 9, 6, 0.4, 0, Math.PI * 2); ctx.ellipse(10, 4, 6, 5, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (look.pattern === 'stripes') { ctx.lineWidth = 3; ctx.strokeStyle = look.patternColor; for (const x of [-10, -2, 6]) { ctx.beginPath(); ctx.moveTo(x, -16); ctx.lineTo(x - 3, 16); ctx.stroke(); } }
  else if (look.pattern === 'shimmer') { const gr = ctx.createLinearGradient(-22, -15, 22, 15); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5 + Math.sin(f.time) * 0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(-22, -15, 44, 30); }
  ctx.restore();
  ctx.strokeStyle = NAVY; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 15, 0, 0, Math.PI * 2); ctx.stroke();
  // side fin
  ctx.fillStyle = look.fin;
  ctx.beginPath(); ctx.ellipse(-2, 5, 6, 3.5, 0.6 + Math.sin(f.tail * 1.3) * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // eye
  if (sleepy) {
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(11, -3, 3.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  } else {
    const big = f.excited ? 1.25 : 1;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(11, -3, 5 * big, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(12, -3, 2.6 * big, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(13, -4.4, 1, 0, Math.PI * 2); ctx.fill();
  }
  // mouth
  ctx.strokeStyle = NAVY; ctx.lineWidth = 1.8;
  ctx.beginPath();
  if (f.eat > 0) { ctx.fillStyle = '#7a2a3a'; ctx.ellipse(20, 3, 2.6, 3.2 * (f.eat / 0.35 + 0.3), 0, 0, Math.PI * 2); ctx.fill(); }
  else ctx.arc(18, 3, 3, 0.1 * Math.PI, 0.7 * Math.PI);
  ctx.stroke();
  // cheek
  ctx.fillStyle = 'rgba(255,120,140,0.5)'; ctx.beginPath(); ctx.ellipse(8, 5, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  if (tier >= 5) {
    ctx.fillStyle = '#f7c531'; ctx.strokeStyle = NAVY; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-6, -15); ctx.lineTo(-6, -24); ctx.lineTo(-1, -19); ctx.lineTo(3, -26); ctx.lineTo(7, -19); ctx.lineTo(12, -24); ctx.lineTo(12, -15); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
