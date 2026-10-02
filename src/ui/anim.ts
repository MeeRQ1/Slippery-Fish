/**
 * Spring physics for UI motion. One shared rAF ticker drives every active
 * spring and stops itself when everything has settled (no idle CPU use).
 *
 * Motion language (spec §71): wood = heavy swing (low stiffness), paper =
 * flutter, ice = slippery snap (high stiffness, low damping), penguin =
 * squash/wobble, metal = clunk (high damping), dollar = crumple/snap.
 */
export interface SpringParams {
  stiffness: number;
  damping: number;
  mass?: number;
}

export const SPRING = {
  snappy: { stiffness: 520, damping: 24 },
  bouncy: { stiffness: 380, damping: 14 },
  wobbly: { stiffness: 260, damping: 9 },
  wood: { stiffness: 140, damping: 9, mass: 1.6 },
  ice: { stiffness: 700, damping: 18 },
  metal: { stiffness: 600, damping: 34 },
  paper: { stiffness: 200, damping: 7 },
} satisfies Record<string, SpringParams>;

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  constructor(value: number, public params: SpringParams = SPRING.snappy) {
    this.value = value;
    this.target = value;
  }
  step(dt: number): void {
    const m = this.params.mass ?? 1;
    const f = -this.params.stiffness * (this.value - this.target) - this.params.damping * this.velocity;
    this.velocity += (f / m) * dt;
    this.value += this.velocity * dt;
  }
  get settled(): boolean {
    return Math.abs(this.velocity) < 0.002 && Math.abs(this.value - this.target) < 0.0015;
  }
  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
}

type Tickable = { tick(dt: number): boolean };

class Ticker {
  private items = new Set<Tickable>();
  private raf = 0;
  private last = 0;
  reducedMotion = false;

  add(item: Tickable): void {
    this.items.add(item);
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  }
  remove(item: Tickable): void {
    this.items.delete(item);
  }
  private loop = (now: number): void => {
    // Sub-step for stability with stiff springs at low frame rates.
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    dt /= sub;
    for (const it of [...this.items]) {
      let alive = false;
      for (let i = 0; i < sub; i++) alive = it.tick(dt);
      if (!alive) this.items.delete(it);
    }
    this.raf = this.items.size > 0 ? requestAnimationFrame(this.loop) : 0;
  };
}

export const ticker = new Ticker();

/**
 * Drives an element's transform from springs: translate, scale (x/y), rotate.
 * Only `transform` is written (compositor-friendly).
 */
export class SpringTransform implements Tickable {
  readonly x: Spring;
  readonly y: Spring;
  readonly sx: Spring;
  readonly sy: Spring;
  readonly rot: Spring;
  private active = false;

  constructor(readonly el: HTMLElement, params: SpringParams = SPRING.snappy) {
    this.x = new Spring(0, params);
    this.y = new Spring(0, params);
    this.sx = new Spring(1, params);
    this.sy = new Spring(1, params);
    this.rot = new Spring(0, params);
  }

  set(p: Partial<{ x: number; y: number; sx: number; sy: number; s: number; rot: number }>, params?: SpringParams): void {
    if (params) for (const s of [this.x, this.y, this.sx, this.sy, this.rot]) s.params = params;
    if (p.x !== undefined) this.x.target = p.x;
    if (p.y !== undefined) this.y.target = p.y;
    if (p.s !== undefined) { this.sx.target = p.s; this.sy.target = p.s; }
    if (p.sx !== undefined) this.sx.target = p.sx;
    if (p.sy !== undefined) this.sy.target = p.sy;
    if (p.rot !== undefined) this.rot.target = p.rot;
    this.wake();
  }

  kick(p: Partial<{ x: number; y: number; sx: number; sy: number; rot: number }>): void {
    if (p.x) this.x.velocity += p.x;
    if (p.y) this.y.velocity += p.y;
    if (p.sx) this.sx.velocity += p.sx;
    if (p.sy) this.sy.velocity += p.sy;
    if (p.rot) this.rot.velocity += p.rot;
    this.wake();
  }

  snap(p: Partial<{ x: number; y: number; s: number; rot: number }>): void {
    if (p.x !== undefined) this.x.snap(p.x);
    if (p.y !== undefined) this.y.snap(p.y);
    if (p.s !== undefined) { this.sx.snap(p.s); this.sy.snap(p.s); }
    if (p.rot !== undefined) this.rot.snap(p.rot);
    this.apply();
  }

  private wake(): void {
    if (ticker.reducedMotion) {
      // Reduced motion: jump straight to targets (no bounce), keep state changes.
      for (const s of [this.x, this.y, this.sx, this.sy, this.rot]) s.snap(s.target);
      this.apply();
      return;
    }
    if (!this.active) {
      this.active = true;
      ticker.add(this);
    }
  }

  tick(dt: number): boolean {
    const springs = [this.x, this.y, this.sx, this.sy, this.rot];
    let settled = true;
    for (const s of springs) {
      s.step(dt);
      if (!s.settled) settled = false;
    }
    if (settled) for (const s of springs) s.snap(s.target);
    this.apply();
    if (settled) this.active = false;
    return !settled;
  }

  apply(): void {
    this.el.style.transform = `translate(${this.x.value.toFixed(2)}px, ${this.y.value.toFixed(2)}px) rotate(${this.rot.value.toFixed(3)}deg) scale(${this.sx.value.toFixed(4)}, ${this.sy.value.toFixed(4)})`;
  }
}

/** Smoothly animated number (counters overshoot slightly, spec §111). */
export class CountUp implements Tickable {
  private spring: Spring;
  private active = false;
  constructor(private el: HTMLElement, value: number, private format: (n: number) => string = (n) => Math.round(n).toLocaleString('en-US')) {
    this.spring = new Spring(value, { stiffness: 90, damping: 15 });
    el.textContent = format(value);
  }
  set(v: number, instant = false): void {
    this.spring.target = v;
    if (instant || ticker.reducedMotion) {
      this.spring.snap(v);
      this.el.textContent = this.format(v);
      return;
    }
    if (!this.active) {
      this.active = true;
      ticker.add(this);
    }
  }
  tick(dt: number): boolean {
    this.spring.step(dt);
    const done = this.spring.settled;
    if (done) this.spring.snap(this.spring.target);
    this.el.textContent = this.format(Math.max(0, this.spring.value));
    if (done) this.active = false;
    return !done;
  }
}

/** Promise-based keyframe helper using the Web Animations API (respects reduced motion). */
export function animate(el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Promise<void> {
  if (ticker.reducedMotion) {
    const last = keyframes[keyframes.length - 1];
    if (last && el instanceof HTMLElement) {
      for (const [k, v] of Object.entries(last)) if (k !== 'offset' && k !== 'easing' && typeof v === 'string') el.style.setProperty(k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), v);
    }
    return Promise.resolve();
  }
  try {
    const a = el.animate(keyframes, { fill: 'forwards', ...opts });
    return a.finished.then(() => undefined, () => undefined);
  } catch {
    return Promise.resolve();
  }
}
