/**
 * Infinite — reproducible seeded levels with unbounded, roughly linear
 * difficulty.
 *
 * Seed codes look like "FR0ST-8K2M": 9 Crockford-base32 characters encoding
 * 45 bits = 13-bit level number + 32-bit layout seed (levels ≥ 8192 append two
 * extra characters). Entering a code reproduces that exact level (same
 * difficulty) for the same CONTENT/GENERATOR versions; the run then continues
 * from there.
 */
import { REGIONS } from '../config/regions';
import { hash32, Rng } from '../core/rng';
import { infiniteDifficulty } from '../procedural/difficulty';
import { generateLevel } from '../procedural/generator';
import type { LevelDef } from './types';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TWO32 = 4294967296;

export interface InfiniteSeed {
  level: number;
  layout: number;
}

function toBase32(value: number, digits: number): string {
  let s = '';
  let v = value;
  for (let i = 0; i < digits; i++) {
    s = ALPHABET[v % 32] + s;
    v = Math.floor(v / 32);
  }
  return s;
}

export function encodeSeed(seed: InfiniteSeed): string {
  const lvl = Math.max(1, Math.floor(seed.level));
  const low = lvl % 8192;
  const value = low * TWO32 + (seed.layout >>> 0);
  const main = toBase32(value, 9);
  const code = `${main.slice(0, 5)}-${main.slice(5)}`;
  const high = Math.floor(lvl / 8192);
  return high > 0 ? `${code}-${toBase32(high, 2)}` : code;
}

/** Accepts sloppy input: lowercase, spaces, O for 0, I/L for 1, missing dash. */
export function normalizeSeedInput(raw: string): string {
  return raw.toUpperCase().replace(/[\s_]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}

export function decodeSeed(raw: string): InfiniteSeed | null {
  const s = normalizeSeedInput(raw).replace(/-/g, '');
  if (s.length !== 9 && s.length !== 11) return null;
  let value = 0;
  for (let i = 0; i < 9; i++) {
    const d = ALPHABET.indexOf(s[i]!);
    if (d < 0) return null;
    value = value * 32 + d;
  }
  let high = 0;
  if (s.length === 11) {
    for (let i = 9; i < 11; i++) {
      const d = ALPHABET.indexOf(s[i]!);
      if (d < 0) return null;
      high = high * 32 + d;
    }
  }
  const low = Math.floor(value / TWO32);
  const layout = value - low * TWO32;
  const level = high * 8192 + low;
  if (level < 1) return null;
  return { level, layout };
}

export function randomSeed(level = 1): InfiniteSeed {
  const r = new Rng(`run:${Date.now()}:${Math.random()}`);
  return { level, layout: r.nextU32() };
}

/** Next level in a run derives deterministically from the current seed. */
export function nextSeed(cur: InfiniteSeed): InfiniteSeed {
  return { level: cur.level + 1, layout: hash32(`next:${cur.layout}:${cur.level}`) };
}

export function infiniteLevel(seed: InfiniteSeed, hard = false): LevelDef {
  const code = encodeSeed(seed);
  // Regions cycle every 10 levels so long runs travel the whole world.
  const region = REGIONS[(Math.floor((seed.level - 1) / 10) + (seed.layout % 4)) % REGIONS.length]!;
  return generateLevel({
    seed: `infinite:${seed.layout}:${seed.level}`,
    id: `inf-${code}`,
    mode: 'infinite',
    index: seed.level,
    region: region.id,
    difficulty: infiniteDifficulty(seed.level),
    hard,
    seedCode: code,
  });
}
