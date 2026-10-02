/**
 * Seeded pseudo-random numbers.
 *
 * Gameplay layout ALWAYS uses an explicit `Rng` built from a seed string that
 * includes the content + generator versions. Cosmetic randomness (particles,
 * wobble phases, decoration jitter) uses a *separate* Rng so visual effects can
 * never shift a gameplay seed.
 *
 * Algorithm: sfc32 (small, fast, good statistical quality) seeded from a
 * 128-bit cyrb128 string hash. Pure integer math → identical across browsers.
 */

/** cyrb128 string hash → four 32-bit words. */
export function hash128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** 32-bit hash of a string (first word of hash128). */
export function hash32(str: string): number {
  return hash128(str)[0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number) {
    const words = hash128(typeof seed === 'number' ? `n:${seed}` : seed);
    this.a = words[0];
    this.b = words[1];
    this.c = words[2];
    this.d = words[3];
    // Warm up so similar seeds diverge quickly.
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Weighted pick; weights must be >= 0 and not all zero. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1] as T;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** Derives an independent child stream (e.g. per-level from a run seed). */
  fork(label: string): Rng {
    return new Rng(`${this.nextU32()}:${label}`);
  }
}

/** Non-gameplay randomness (particles, wobble phases). Never feeds layouts. */
export const cosmeticRng = new Rng(`cosmetic:${Date.now()}`);
