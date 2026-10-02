import type { LevelDef } from '../../src/levels/types';

export function makeTestLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test-1',
    mode: 'practice',
    index: 1,
    seed: 'test',
    contentVersion: 1,
    generatorVersion: 1,
    region: 'classic_winter',
    arena: { width: 1200, height: 760, walls: [] },
    player: { x: 200, y: 380 },
    stash: { x: 1000, y: 380 },
    fish: [{ x: 300, y: 380, variant: 'standard' }],
    fishRequired: 1,
    enemies: [],
    obstacles: [],
    surfaces: [],
    enemySpeed: 1,
    parSeconds: 6,
    difficulty: 0,
    hard: false,
    ...overrides,
  };
}
