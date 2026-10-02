/**
 * Texture loading helpers: lazy atlas groups and procedural canvas textures.
 */
import Phaser from 'phaser';
import { atlasPages, standaloneImages } from '../core/assets';
import { drawParticle, drawPolarBear, drawProceduralFloor, drawShadow, drawTrophy } from '../art/procedural';

/** Loads any atlas pages of `groups` that are not loaded yet. */
export function loadAtlasGroups(scene: Phaser.Scene, groups: string[]): Promise<void> {
  const pages = atlasPages(groups).filter((p) => !scene.textures.exists(p.key));
  if (pages.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    for (const p of pages) scene.load.atlas(p.key, p.image, p.json);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.start();
  });
}

export function loadStandaloneImages(scene: Phaser.Scene, ids?: string[]): Promise<void> {
  const imgs = standaloneImages().filter((i) => (!ids || ids.includes(i.id)) && !scene.textures.exists(i.id));
  if (imgs.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    for (const i of imgs) scene.load.image(i.id, i.url);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.start();
  });
}

export function addCanvasTexture(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): void {
  if (scene.textures.exists(key)) return;
  scene.textures.addCanvas(key, make());
}

/** Shared procedural textures used by gameplay and menus. */
export function ensureProceduralTextures(scene: Phaser.Scene): void {
  addCanvasTexture(scene, 'proc_shadow', drawShadow);
  addCanvasTexture(scene, 'enemy_polar_bear', drawPolarBear);
  addCanvasTexture(scene, 'proc_trophy', () => drawTrophy(220));
  for (const k of ['snow', 'dot', 'sparkle', 'puff', 'leaf', 'petal', 'sprinkle', 'ring'] as const) {
    addCanvasTexture(scene, `px_${k}`, () => drawParticle(k));
  }
  for (const k of ['proc_meadow', 'proc_fallgrass', 'proc_icecream', 'proc_candy']) {
    addCanvasTexture(scene, k, () => drawProceduralFloor(k));
  }
}

/** Resolves a manifest id or procedural key into a Phaser texture/frame pair. */
export function tex(scene: Phaser.Scene, id: string): { key: string; frame?: string } {
  if (scene.textures.exists(id)) return { key: id };
  for (const p of atlasPages()) {
    if (scene.textures.exists(p.key) && scene.textures.get(p.key).has(id)) return { key: p.key, frame: id };
  }
  console.warn(`[tex] missing texture ${id}`);
  return { key: '__MISSING' };
}
