/**
 * Exactly 30 selectable profile icons (spec §36), each a different Slippery
 * Fish subject composed from supplied art (or the clearly-marked procedural
 * placeholders for the Polar Bear and Trophy) inside a thick-outlined
 * circular frame. Not recolours of one icon.
 */
import { drawPolarBear, drawTrophy } from '../art/procedural';
import { h, sprite } from '../ui/dom';

export interface ProfileIconDef {
  id: string;
  name: string;
  /** Manifest frame id, or a procedural canvas source. */
  frame?: string;
  canvas?: 'polarBear' | 'trophy';
  bg: [string, string];
  /** Size of the subject relative to the frame (1 = fits). */
  zoom: number;
  /** Vertical offset as a fraction of the frame (positive = down). */
  dy: number;
}

const P = (id: string, name: string, bg: [string, string]): ProfileIconDef => ({ id: `icon_penguin_${id}`, name, frame: `penguin_${id}`, bg, zoom: 1.35, dy: 0.18 });

export const PROFILE_ICONS: ProfileIconDef[] = [
  P('classic', 'Classic Penguin', ['#bfe3fb', '#7cc4f0']),
  P('slate', 'Slate Penguin', ['#dfe6ee', '#a9b8c8']),
  P('bluebell', 'Bluebell Penguin', ['#fff1c4', '#f7c531']),
  P('bubblegum', 'Bubblegum Penguin', ['#d8f5e6', '#7fd6a8']),
  P('goldbelly', 'Goldbelly Penguin', ['#e0d6ff', '#a98bf0']),
  P('crested', 'Crested Penguin', ['#ffe0cc', '#f2a46a']),
  P('skyfin', 'Skyfin Penguin', ['#ffe3ef', '#f59cc0']),
  P('macaroni', 'Macaroni Penguin', ['#d6f3ff', '#5fc4ee']),
  P('lilac', 'Lilac Penguin', ['#fff6d6', '#ffd56a']),
  P('ember', 'Ember Penguin', ['#d9f0ff', '#8ec8ef']),
  { id: 'icon_arctic_wolf', name: 'Arctic Wolf', frame: 'enemy_arctic_wolf', bg: ['#e8eef6', '#9fb3c9'], zoom: 1.15, dy: 0.06 },
  { id: 'icon_seal', name: 'Seal', frame: 'enemy_seal', bg: ['#d6efff', '#6fb6e6'], zoom: 1.1, dy: 0.05 },
  { id: 'icon_polar_bear', name: 'Polar Bear', canvas: 'polarBear', bg: ['#cfe8ff', '#5f9ed6'], zoom: 1.08, dy: 0.04 },
  { id: 'icon_fish', name: 'Slippery Fish', frame: 'fish_standard', bg: ['#d6f6ff', '#68c8ec'], zoom: 0.95, dy: 0 },
  { id: 'icon_rare_fish', name: 'Golden Fish', frame: 'fish_rare', bg: ['#fff3c4', '#f2b52e'], zoom: 0.95, dy: 0 },
  { id: 'icon_popsicle', name: 'Popsicle', frame: 'btnicon_daily_normal', bg: ['#ffe3ec', '#ff9fbf'], zoom: 0.92, dy: 0 },
  { id: 'icon_igloo', name: 'Igloo', frame: 'igloo_8a', bg: ['#cfe9ff', '#7ab8e8'], zoom: 1.0, dy: 0.04 },
  { id: 'icon_chest', name: 'Treasure Chest', frame: 'btnicon_treasure_normal', bg: ['#d9f2e3', '#5fbf8a'], zoom: 0.95, dy: 0 },
  { id: 'icon_trophy', name: 'Trophy', canvas: 'trophy', bg: ['#e2dcff', '#8f7ae8'], zoom: 0.9, dy: 0.02 },
  { id: 'icon_icicle', name: 'Icicle', frame: 'icon_icicle', bg: ['#e2f4ff', '#8fd2f8'], zoom: 0.85, dy: 0 },
  { id: 'icon_shard', name: 'Icicle Shard', frame: 'icon_icicle_shard', bg: ['#e8e2ff', '#a99af6'], zoom: 0.92, dy: 0 },
  { id: 'icon_rod', name: 'Fishing Rod', frame: 'btnicon_watch_ads_normal', bg: ['#fff0d6', '#f2b968'], zoom: 0.95, dy: 0 },
  { id: 'icon_beanie', name: 'Beanie Hood', frame: 'btnicon_hoods_normal', bg: ['#ffe6d6', '#f29a68'], zoom: 0.92, dy: 0 },
  { id: 'icon_snowman', name: 'Snowman', frame: 'menu_snowman', bg: ['#d6ecff', '#6aa8e0'], zoom: 1.0, dy: 0.02 },
  { id: 'icon_snowflake', name: 'Snowflake', frame: 'menu_snowflake_a', bg: ['#2f6fb5', '#173e70'], zoom: 0.85, dy: 0 },
  { id: 'icon_buoy', name: 'Buoy', frame: 'buoy', bg: ['#d6f2ff', '#58b4e6'], zoom: 0.95, dy: 0 },
  { id: 'icon_pine', name: 'Snowy Pine', frame: 'pine_tree_7c', bg: ['#e6f7ff', '#9fd8f4'], zoom: 1.0, dy: 0.03 },
  { id: 'icon_blue_fish', name: 'Fish Token', frame: 'icon_fish_currency', bg: ['#fff6d6', '#ffcf5a'], zoom: 0.9, dy: 0 },
  { id: 'icon_lifering', name: 'Life Ring', frame: 'lifering', bg: ['#d6eeff', '#4f9ad8'], zoom: 0.9, dy: 0 },
  { id: 'icon_ice_crystal', name: 'Ice Crystal', frame: 'ice_plant', bg: ['#1f4f86', '#0f2c52'], zoom: 0.95, dy: 0 },
];

export const PROFILE_ICON_COUNT = PROFILE_ICONS.length; // 30

const BY_ID = Object.fromEntries(PROFILE_ICONS.map((i) => [i.id, i]));
const canvasCache = new Map<string, string>();

export function profileIconDef(id: string): ProfileIconDef {
  return BY_ID[id] ?? PROFILE_ICONS[0]!;
}

/** A circular, outlined icon element at `size` px. */
export function profileIconEl(id: string, size: number): HTMLElement {
  const def = profileIconDef(id);
  const frame = h('span', { class: 'pfp', attrs: { role: 'img', 'aria-label': def.name }, style: { width: `${size}px`, height: `${size}px`, background: `radial-gradient(circle at 35% 30%, ${def.bg[0]}, ${def.bg[1]})` } });
  const inner = size * def.zoom;
  let subject: HTMLElement;
  if (def.canvas) {
    let url = canvasCache.get(def.canvas);
    if (!url) {
      url = (def.canvas === 'polarBear' ? drawPolarBear() : drawTrophy(200)).toDataURL('image/png');
      canvasCache.set(def.canvas, url);
    }
    subject = h('img', { attrs: { src: url, alt: '', draggable: 'false' }, style: { width: `${inner * 0.86}px`, height: 'auto' } });
  } else {
    subject = sprite(def.frame!, { width: inner * 0.86 });
  }
  subject.classList.add('pfp-subject');
  subject.style.transform = `translate(-50%, calc(-50% + ${def.dy * size}px))`;
  frame.append(subject);
  return frame;
}
