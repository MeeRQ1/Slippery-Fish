/**
 * BootScene — loads the core atlases needed for menus and the first levels,
 * builds procedural textures, then hands control to the app. Region-specific
 * decoration atlases are loaded lazily later.
 */
import Phaser from 'phaser';
import { atlasPages, standaloneImages } from '../core/assets';
import { ensureProceduralTextures } from './textures';

export const CORE_ATLAS_GROUPS = ['gameplay', 'obstacles', 'menu', 'ui', 'waddles', 'decor-winter'];
export const CORE_IMAGES = ['tex_snow', 'menu_mountains_band', 'tex_ice'];

export interface BootData {
  onProgress: (p: number) => void;
  onReady: () => void;
}

export class BootScene extends Phaser.Scene {
  private boot!: BootData;

  constructor() {
    super({ key: 'boot' });
  }

  init(data: BootData): void {
    this.boot = data;
  }

  preload(): void {
    for (const p of atlasPages(CORE_ATLAS_GROUPS)) this.load.atlas(p.key, p.image, p.json);
    for (const img of standaloneImages()) if (CORE_IMAGES.includes(img.id)) this.load.image(img.id, img.url);
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => this.boot.onProgress(v));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => console.warn('[boot] failed to load', file.key, file.src));
  }

  create(): void {
    ensureProceduralTextures(this);
    this.boot.onReady();
  }
}
