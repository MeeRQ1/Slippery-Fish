import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dayPhaseFor, seasonFor } from '../../src/config/menuTheme';
import { pickRoutine, RoutineScheduler, ROUTINE_POOLS, timeBandFor } from '../../src/pet/routines';
import { TRAINING_LESSONS } from '../../src/levels/training';
import { validateLevel } from '../../src/procedural/validate';
import { isLegalLayout } from '../../src/gameplay/goal';
import { GameSim, NO_INPUT } from '../../src/gameplay/sim';
import { adventureLevel } from '../../src/levels/adventure';

const ROOT = join(__dirname, '../..');

describe('menu seasons and local day/night', () => {
  it('uses the documented Northern Hemisphere calendar', () => {
    const at = (m: number, d: number) => seasonFor(new Date(2026, m - 1, d, 12));
    expect(at(2, 28)).toBe('winter');
    expect(at(3, 1)).toBe('spring');
    expect(at(5, 31)).toBe('spring');
    expect(at(6, 1)).toBe('summer');
    expect(at(8, 31)).toBe('summer');
    expect(at(9, 1)).toBe('autumn');
    expect(at(11, 30)).toBe('autumn');
    expect(at(12, 1)).toBe('winter');
    expect(at(1, 15)).toBe('winter');
  });

  it('3 AM local is night; dawn/day/dusk boundaries are local-clock based', () => {
    const at = (hh: number, mm = 0) => dayPhaseFor(new Date(2026, 6, 4, hh, mm));
    expect(at(3)).toBe('night');
    expect(at(4, 59)).toBe('night');
    expect(at(5)).toBe('dawn');
    expect(at(8)).toBe('day');
    expect(at(16, 59)).toBe('day');
    expect(at(17)).toBe('dusk');
    expect(at(20)).toBe('night');
    expect(at(23, 59)).toBe('night');
  });

  it('the inline startup copy in index.html matches the TypeScript rules for every day and every 10 minutes', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const src = html.slice(html.indexOf('// ---- menu theme (BEGIN sf-theme'), html.indexOf('// ---- (END sf-theme) ----'));
    const fns = new Function(`${src}; return { sfSeason, sfDayPhase };`)() as { sfSeason: (d: Date) => string; sfDayPhase: (d: Date) => string };
    for (let day = 0; day < 366; day++) {
      const d = new Date(2028, 0, 1 + day, 12);
      expect(fns.sfSeason(d)).toBe(seasonFor(d));
    }
    for (let m = 0; m < 24 * 60; m += 10) {
      const d = new Date(2026, 3, 10, 0, m);
      expect(fns.sfDayPhase(d)).toBe(dayPhaseFor(d));
    }
  });

  it('gameplay, generation and level code never read the menu theme (scope rule)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && /menuTheme/.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    for (const d of ['src/gameplay', 'src/procedural', 'src/levels', 'src/physics', 'src/enemies']) walk(join(ROOT, d));
    const gameScene = readFileSync(join(ROOT, 'src/scenes/GameScene.ts'), 'utf8');
    if (/menuTheme/.test(gameScene)) offenders.push('src/scenes/GameScene.ts');
    expect(offenders).toEqual([]);
    // And the same level is generated identically regardless of the date/time it is generated at.
    expect(JSON.stringify(adventureLevel(42))).toBe(JSON.stringify(adventureLevel(42)));
  });
});

describe('pet routines (cosmetic, time-aware)', () => {
  it('maps local hours to time bands with fitting pools', () => {
    const band = (hh: number) => timeBandFor(new Date(2026, 1, 2, hh, 30));
    expect(band(6)).toBe('morning');
    expect(band(12)).toBe('day');
    expect(band(19)).toBe('evening');
    expect(band(23)).toBe('night');
    expect(band(3)).toBe('night');
    expect(ROUTINE_POOLS.morning.map((r) => r.id)).toEqual(expect.arrayContaining(['shower', 'brushTeeth']));
    expect(ROUTINE_POOLS.night.map((r) => r.id)).toEqual(expect.arrayContaining(['fishflex', 'couchDoze', 'sleep']));
  });

  it('varies routines (weighted, no immediate repeats) with sensible durations', () => {
    let seed = 1;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const seen = new Set<string>();
    let prev: ReturnType<typeof pickRoutine>['def']['id'] | null = null;
    for (let i = 0; i < 200; i++) {
      const p = pickRoutine('day', prev, rand);
      expect(p.def.id).not.toBe(prev);
      expect(p.seconds).toBeGreaterThanOrEqual(p.def.dur[0]);
      expect(p.seconds).toBeLessThanOrEqual(p.def.dur[1]);
      seen.add(p.def.id);
      prev = p.def.id;
    }
    expect(seen.size).toBe(ROUTINE_POOLS.day.length);
  });

  it('a time-band change never interrupts the current routine; the next one comes from the new band', () => {
    let now = new Date(2026, 1, 2, 16, 59);
    const sch = new RoutineScheduler(() => now, () => 0.5);
    const first = sch.current.id;
    now = new Date(2026, 1, 2, 23, 0);
    sch.update(1);
    expect(sch.current.id).toBe(first);
    sch.update(1000);
    expect(ROUTINE_POOLS.night.map((r) => r.id)).toContain(sch.current.id);
  });
});

describe('Training Rink lessons', () => {
  it('every lesson arena is valid at real collider sizes with a legal, open goal', () => {
    for (const l of TRAINING_LESSONS) {
      if (!l.level) { expect(l.link).toBeTruthy(); continue; }
      const lv = l.level();
      expect(isLegalLayout(lv.goal)).toBe(true);
      const v = validateLevel(lv);
      expect(v.problems).toEqual([]);
      expect(lv.modifiers).toEqual([]);
    }
  });

  it('the gate lesson scores through its opening; metric lessons complete via their objective', () => {
    const gate = TRAINING_LESSONS.find((l) => l.id === 'gate')!.level!();
    const sim = new GameSim(gate);
    const f = sim.fish[0]!;
    f.body.x = f.body.px = gate.stash.x - 200;
    f.body.y = f.body.py = gate.stash.y;
    f.body.vx = 700;
    let won = false;
    for (let i = 0; i < 120 && !won; i++) { sim.step(NO_INPUT); won = sim.status === 'won'; }
    expect(won).toBe(true);
    const move = TRAINING_LESSONS.find((l) => l.id === 'move')!;
    const sim2 = new GameSim(move.level!());
    expect(move.met!(sim2)).toBe(false);
    sim2.stats.distanceWaddled = 12 * 48;
    expect(move.met!(sim2)).toBe(true);
    sim2.completeObjective();
    sim2.step(NO_INPUT);
    expect(sim2.status).toBe('won');
  });
});
