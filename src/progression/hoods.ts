/**
 * Hoods — exactly 200 (10 rarities × 20), bought with Icicle Shards.
 *
 * Each rarity contains one Hood from each of the 20 power families, so every
 * rarity is a complete, themed set. Higher rarity = stronger. Economy
 * families follow the 110% → 1000% curve; movement/control families use
 * deliberately small, capped curves (spec §57). Ranked ignores all stat
 * bonuses (cosmetic only).
 *
 * Art: every Hood has its own procedural vector recipe (src/art/hoodArt.ts):
 * a distinct object shape per Hood within a rarity (no recoloured clones).
 * These are clearly documented as procedural placeholder art.
 */
import { ECONOMY_HOOD_CURVE, HOOD_PRICE_BY_RARITY, MAX_SHARD_MULTIPLIER, SHARD_HOOD_CURVE } from '../config/economy';
import { NORMALIZED_MODIFIERS, type GameplayModifiers } from '../gameplay/modifiers';

export const RARITIES = [
  { id: 'pollution', name: 'Pollution', color: '#7d7a64', glow: '#a8a58a' },
  { id: 'trash', name: 'Human Trash', color: '#8a9a5b', glow: '#b9c98a' },
  { id: 'lostfound', name: 'Human Lost & Found', color: '#5aa0d6', glow: '#9fd0f5' },
  { id: 'shiny', name: 'Oooh Shiny', color: '#b9c2cf', glow: '#e9eef5' },
  { id: 'sparkling', name: 'SPARKLING', color: '#5fd4ff', glow: '#c4f2ff' },
  { id: 'epic', name: 'Epic', color: '#9b5de5', glow: '#cfb0f7' },
  { id: 'legendary', name: 'Legendary', color: '#f7a531', glow: '#ffd98a' },
  { id: 'glorious', name: 'Glorious', color: '#f7c531', glow: '#fff1a8' },
  { id: 'supreme', name: 'Supreme', color: '#ef4f9a', glow: '#ffb0d6' },
  { id: 'food', name: 'Food', color: '#ff7a3d', glow: '#ffc49e' },
] as const;

export type RarityId = (typeof RARITIES)[number]['id'];

export type FamilyId =
  | 'maxStamina' | 'staminaRegen' | 'sprintEfficiency' | 'moveSpeed' | 'accelControl' | 'fishImpact' | 'fishControl'
  | 'icicleEarnings' | 'shardEarnings' | 'hardModeRewards' | 'questRewards' | 'warningDistance' | 'recoveryUtility'
  | 'startingStamina' | 'collisionRecovery' | 'excellenceBonus' | 'dailyUtility' | 'infiniteUtility' | 'adventureUtility' | 'generalUtility';

export interface FamilyDef {
  id: FamilyId;
  label: string;
  kind: 'gameplay' | 'economy';
  /** Strength by rarity index 0..9 (multiplier, fraction, or bonus). */
  strength: readonly number[];
  describe: (v: number, rarityIndex: number) => string;
}

const lin = (a: number, b: number): number[] => Array.from({ length: 10 }, (_, i) => Math.round((a + ((b - a) * i) / 9) * 1000) / 1000);
const pct = (v: number) => `${Math.round((v - 1) * 100)}%`;

export const FAMILIES: FamilyDef[] = [
  { id: 'maxStamina', label: 'Maximum Stamina', kind: 'gameplay', strength: lin(1.04, 1.4), describe: (v) => `+${pct(v)} maximum stamina` },
  { id: 'staminaRegen', label: 'Stamina Regeneration', kind: 'gameplay', strength: lin(1.05, 1.5), describe: (v) => `+${pct(v)} stamina regeneration` },
  { id: 'sprintEfficiency', label: 'Sprint Efficiency', kind: 'gameplay', strength: lin(0.97, 0.7), describe: (v) => `Sprint drains ${Math.round((1 - v) * 100)}% slower` },
  { id: 'moveSpeed', label: 'Movement Speed', kind: 'gameplay', strength: lin(1.01, 1.08), describe: (v) => `+${pct(v)} waddle speed` },
  { id: 'accelControl', label: 'Acceleration & Control', kind: 'gameplay', strength: lin(1.02, 1.2), describe: (v) => `+${pct(v)} acceleration` },
  { id: 'fishImpact', label: 'Fish Impact Strength', kind: 'gameplay', strength: lin(1.03, 1.3), describe: (v) => `+${pct(v)} fish kick` },
  { id: 'fishControl', label: 'Fish Control', kind: 'gameplay', strength: lin(1.03, 1.3), describe: (v) => `${pct(v)} softer, steadier dribbles` },
  { id: 'icicleEarnings', label: 'Icicle Earnings', kind: 'economy', strength: ECONOMY_HOOD_CURVE, describe: (v) => `${Math.round(v * 100)}% Icicles from levels` },
  { id: 'shardEarnings', label: 'Shard Earnings', kind: 'economy', strength: SHARD_HOOD_CURVE, describe: (v) => `${Math.round(v * 100)}% Icicle Shards from Adventure roadmap chests` },
  { id: 'hardModeRewards', label: 'Hard Mode Rewards', kind: 'economy', strength: ECONOMY_HOOD_CURVE, describe: (v) => `${Math.round(v * 100)}% Hard Mode bonus` },
  { id: 'questRewards', label: 'Quest Rewards', kind: 'economy', strength: ECONOMY_HOOD_CURVE, describe: (v, ri) => `${Math.round(v * 100)}% quest Icicles · ${Math.round(SHARD_HOOD_CURVE[ri]! * 100)}% quest Shards` },
  { id: 'warningDistance', label: 'Enemy Warning Distance', kind: 'gameplay', strength: lin(1.08, 1.8), describe: (v) => `Danger warning ${pct(v)} earlier` },
  { id: 'recoveryUtility', label: 'Recovery Utility', kind: 'economy', strength: lin(0.97, 0.6), describe: (v) => `Continues cost ${Math.round((1 - v) * 100)}% fewer Icicles` },
  { id: 'startingStamina', label: 'Starting Stamina', kind: 'gameplay', strength: lin(1.05, 1.5), describe: (v) => `Start levels with ${pct(v)} bonus stamina` },
  { id: 'collisionRecovery', label: 'Collision Recovery', kind: 'gameplay', strength: lin(1.1, 2.0), describe: (v) => `Recover from bumps ${pct(v)} faster` },
  { id: 'excellenceBonus', label: 'Excellence Reward Bonus', kind: 'economy', strength: ECONOMY_HOOD_CURVE, describe: (v) => `${Math.round(v * 100)}% star bonus Icicles` },
  { id: 'dailyUtility', label: 'Daily Reward Utility', kind: 'economy', strength: lin(1.1, 4.0), describe: (v) => `${Math.round(v * 100)}% Daily level Icicles` },
  { id: 'infiniteUtility', label: 'Infinite Reward Utility', kind: 'economy', strength: ECONOMY_HOOD_CURVE, describe: (v) => `${Math.round(v * 100)}% Infinite Icicles` },
  { id: 'adventureUtility', label: 'Adventure Reward Utility', kind: 'economy', strength: ECONOMY_HOOD_CURVE, describe: (v) => `${Math.round(v * 100)}% Adventure Icicles` },
  { id: 'generalUtility', label: 'General Utility', kind: 'economy', strength: lin(1.03, 1.5), describe: (v) => `+${pct(v)} level Icicles and roadmap-chest Shards` },
];

export type HoodArtKind =
  | 'beanie' | 'cap' | 'bucket' | 'tophat' | 'crown' | 'tiara' | 'helmet' | 'horns' | 'horn' | 'halo' | 'band' | 'bow'
  | 'goggles' | 'shades' | 'bowl' | 'can' | 'box' | 'cup' | 'wrapper' | 'sock' | 'mitten' | 'backpack' | 'earmuffs'
  | 'headphones' | 'plume' | 'wreath' | 'wizard' | 'tricorn' | 'bicorne' | 'toque' | 'cowboy' | 'jester' | 'nightcap'
  | 'party' | 'stack' | 'strawberry' | 'pineapple' | 'watermelon' | 'donut' | 'cupcake' | 'icecream' | 'spaghetti'
  | 'sushi' | 'taco' | 'burger' | 'pizza' | 'croissant' | 'cheese' | 'broccoli' | 'pudding' | 'dumpling' | 'corn'
  | 'bento' | 'pancakes' | 'waffle' | 'planet' | 'antlers' | 'star' | 'snowflake' | 'globe' | 'disco' | 'mohawk'
  | 'flame' | 'gem' | 'trophy' | 'orb' | 'duck' | 'bell' | 'spoon' | 'key' | 'coins' | 'medals' | 'feather' | 'fin'
  | 'tusks' | 'moon' | 'sun' | 'cone' | 'bubble' | 'veil' | 'kabuto' | 'pith' | 'fire' | 'diver' | 'aviator' | 'keeper';

export type HoodDeco = 'none' | 'stripes' | 'dots' | 'drips' | 'sparkles' | 'stars' | 'patch' | 'gem' | 'grime';

export interface HoodArt {
  kind: HoodArtKind;
  colors: [string, string, string];
  deco: HoodDeco;
}

export interface HoodDef {
  id: string;
  name: string;
  rarity: RarityId;
  rarityIndex: number;
  family: FamilyId;
  strength: number;
  price: number;
  art: HoodArt;
}

type Row = [string, HoodArtKind, string, string, string, HoodDeco];

// Names + art per rarity (20 each). Shapes never repeat within a rarity.
const SETS: Record<RarityId, Row[]> = {
  pollution: [
    ['Smog Beanie', 'beanie', '#6f6c5a', '#4a4838', '#9a967c', 'grime'], ['Oil Slick Cap', 'cap', '#2d2a35', '#6b4f8a', '#3a7a6a', 'drips'],
    ['Sludge Bucket', 'bucket', '#5a6040', '#3f4430', '#7d8a4a', 'drips'], ['Exhaust Top Hat', 'tophat', '#3d3b38', '#6a6762', '#9a968e', 'grime'],
    ['Tar Bowl', 'bowl', '#2a2622', '#4d453c', '#77695a', 'drips'], ['Soot Helmet', 'helmet', '#4d4b47', '#2f2d2a', '#86827a', 'grime'],
    ['Grimy Goggles', 'goggles', '#5a5040', '#8a7a52', '#a8c0b0', 'grime'], ['Gunk Crown', 'crown', '#7a7044', '#5a5230', '#a39a5e', 'drips'],
    ['Murky Band', 'band', '#55604a', '#3b4433', '#8aa070', 'grime'], ['Fume Plume', 'plume', '#8a8878', '#5e5c50', '#b5b2a0', 'none'],
    ['Rusty Can Lid', 'can', '#9a5a32', '#6e3d1d', '#c0804a', 'grime'], ['Dingy Earmuffs', 'earmuffs', '#6a6460', '#4a4440', '#908a84', 'grime'],
    ['Puddle Party Hat', 'party', '#6d7a60', '#4c5844', '#9fae8a', 'stripes'], ['Drain Pipe Horn', 'horn', '#77746a', '#55524a', '#a09c90', 'grime'],
    ['Smoggy Nightcap', 'nightcap', '#5a5a66', '#3c3c48', '#8a8a9a', 'grime'], ['Oily Bow', 'bow', '#3a3044', '#6a5a7a', '#2f6a5a', 'drips'],
    ['Litter Toque', 'toque', '#8a8676', '#6a6656', '#b0ac98', 'grime'], ['Gloomy Halo', 'halo', '#7a7766', '#5a5848', '#a8a590', 'none'],
    ['Slime Mohawk', 'mohawk', '#6a8a3a', '#4a6a2a', '#9ab85a', 'drips'], ['Sooty Wreath', 'wreath', '#4f5242', '#373a2e', '#7c806a', 'grime'],
  ],
  trash: [
    ['Crushed Can Crown', 'can', '#d84a3a', '#c0c6cf', '#ffffff', 'stripes'], ['Candy Wrapper Bonnet', 'wrapper', '#ff6fa8', '#ffd23f', '#5fd4ff', 'stripes'],
    ['Bottle Cap Beret', 'cap', '#e8504a', '#c9ced6', '#ffffff', 'dots'], ['Broken Cup Helmet', 'cup', '#f4f1e8', '#d8504a', '#c9b48a', 'patch'],
    ['Takeout Box', 'box', '#f4efe0', '#d84a3a', '#8a6a3a', 'none'], ['Newspaper Tricorn', 'tricorn', '#ece9df', '#9a968e', '#3a3a3a', 'stripes'],
    ['Paper Bag Hood', 'bowl', '#c9a066', '#a37c45', '#7a5a2e', 'patch'], ['Soda Straw Antenna', 'antlers', '#ff6f6f', '#ffffff', '#5fd4ff', 'stripes'],
    ['Chip Bag Cap', 'wrapper', '#ffd23f', '#e8504a', '#ffffff', 'none'], ['Egg Carton Crown', 'crown', '#d9cfb8', '#b5a98a', '#f4ecd8', 'dots'],
    ['Coffee Lid Band', 'band', '#f4efe0', '#6e3d1d', '#ffffff', 'none'], ['Juice Box', 'box', '#7fd36a', '#ffd23f', '#ff6f6f', 'dots'],
    ['Yogurt Cup Bucket', 'bucket', '#ffffff', '#ff8ab0', '#ffd6e5', 'stripes'], ['Tissue Box Top Hat', 'tophat', '#7fc4f0', '#ffffff', '#3d8fd6', 'dots'],
    ['Plastic Fork Mohawk', 'mohawk', '#ffffff', '#d9dee6', '#b0b8c4', 'none'], ['Cereal Box Visor', 'cap', '#ffb84a', '#e8504a', '#ffffff', 'stars'],
    ['Pizza Box Lid', 'box', '#d6a56a', '#b07d42', '#e8504a', 'grime'], ['Tin Foil Bow', 'bow', '#c9ced6', '#9aa3b0', '#ffffff', 'sparkles'],
    ['Banana Peel', 'horns', '#ffe066', '#c9a52e', '#6e5a1d', 'dots'], ['Shoebox Helmet', 'helmet', '#e86a3a', '#ffffff', '#3a3a3a', 'stripes'],
  ],
  lostfound: [
    ['Single Mitten', 'mitten', '#e8504a', '#ffffff', '#3d8fd6', 'stripes'], ['Odd Sock', 'sock', '#5fd4ff', '#ffffff', '#ff6fa8', 'stripes'],
    ['Lost Sunglasses', 'shades', '#2a2a3a', '#ff6f6f', '#ffffff', 'none'], ['Tiny Backpack', 'backpack', '#e8a03a', '#7a4a1d', '#ffd23f', 'patch'],
    ['Fuzzy Earmuffs', 'earmuffs', '#ff9ad0', '#ffffff', '#c84a8a', 'none'], ['Rubber Duck', 'duck', '#ffd23f', '#ff8a3a', '#ffffff', 'none'],
    ['Snow Goggles', 'goggles', '#3d8fd6', '#ffd23f', '#9fe3ff', 'none'], ['Baseball Cap', 'cap', '#3d6fd6', '#ffffff', '#e8504a', 'none'],
    ['Fisher Bucket Hat', 'bucket', '#d8c49a', '#a08a5a', '#3d8fd6', 'patch'], ['Sweatband', 'band', '#ff5a5a', '#ffffff', '#ffd23f', 'stripes'],
    ['Hair Scrunchie', 'bow', '#ff7aa0', '#ffffff', '#d84a7a', 'dots'], ['Bike Helmet', 'helmet', '#47c28b', '#ffffff', '#2a2a3a', 'stripes'],
    ['Birthday Party Hat', 'party', '#9b5de5', '#ffd23f', '#ff6fa8', 'dots'], ['Reading Glasses', 'goggles', '#8a5a2e', '#e6d6b8', '#ffffff', 'none'],
    ['Bandage Patch', 'band', '#f0c08a', '#e8a070', '#ffffff', 'patch'], ['Gamer Headphones', 'headphones', '#2a3a6a', '#3d8fd6', '#9fe3ff', 'none'],
    ['Starry Nightcap', 'nightcap', '#3d5fc4', '#ffffff', '#ffd23f', 'stars'], ['Swim Cap', 'helmet', '#ff6fa8', '#ffffff', '#ffd23f', 'dots'],
    ['Bobble Beanie', 'beanie', '#2f8f6a', '#ffffff', '#ffd23f', 'stripes'], ['Lost Key Ring', 'key', '#e8c84a', '#a0882e', '#c9ced6', 'none'],
  ],
  shiny: [
    ['Foil Hat', 'cone', '#d9dee6', '#9aa3b0', '#ffffff', 'sparkles'], ['Spoon Tiara', 'spoon', '#d9dee6', '#9aa3b0', '#ffffff', 'sparkles'],
    ['Bottle-Top Crown', 'crown', '#c9ced6', '#e8504a', '#ffffff', 'dots'], ['Disco Ball', 'disco', '#c9d6e6', '#7a8aa0', '#ffffff', 'sparkles'],
    ['Tinsel Wig', 'mohawk', '#e6edf5', '#b0bccc', '#ffd23f', 'sparkles'], ['Jingle Bell Cap', 'bell', '#ffd23f', '#c9a52e', '#e8504a', 'sparkles'],
    ['Coin Stack', 'coins', '#f2c94a', '#c9a52e', '#fff3b0', 'sparkles'], ['Marble Circlet', 'tiara', '#9fd0f5', '#5a8ab0', '#ffffff', 'gem'],
    ['Mirror Visor', 'goggles', '#c9ced6', '#7a8aa0', '#e6f6ff', 'sparkles'], ['Glitter Bow', 'bow', '#d9dee6', '#ff9ad0', '#ffffff', 'sparkles'],
    ['Silver Thimble', 'cup', '#c9ced6', '#9aa3b0', '#ffffff', 'dots'], ['Button Top Hat', 'tophat', '#b0bccc', '#7a8aa0', '#ffd23f', 'dots'],
    ['Paperclip Antlers', 'antlers', '#c9ced6', '#8a94a3', '#ffffff', 'none'], ['Chrome Hubcap Helmet', 'helmet', '#d9dee6', '#7a8aa0', '#ffffff', 'sparkles'],
    ['Sequin Beret', 'cap', '#c9ced6', '#ff6fa8', '#ffffff', 'sparkles'], ['Brass Doorknob Orb', 'orb', '#e0b84a', '#a0782e', '#fff3b0', 'sparkles'],
    ['Wind Chime Halo', 'halo', '#c9ced6', '#9aa3b0', '#ffffff', 'sparkles'], ['Shiny Spoon Plume', 'plume', '#d9dee6', '#9aa3b0', '#ffffff', 'sparkles'],
    ['Trinket Band', 'band', '#c9ced6', '#ffd23f', '#5fd4ff', 'gem'], ['Tin Star', 'star', '#d9dee6', '#9aa3b0', '#ffffff', 'sparkles'],
  ],
  sparkling: [
    ['Sapphire Snowflake', 'snowflake', '#5fd4ff', '#2a7ac4', '#ffffff', 'sparkles'], ['Crystal Tiara', 'tiara', '#c4f2ff', '#5fb4e8', '#ffffff', 'gem'],
    ['Glitter Beanie', 'beanie', '#5fd4ff', '#ffffff', '#ff9ad0', 'sparkles'], ['Diamond Pom Helmet', 'helmet', '#c4f2ff', '#7fc4f0', '#ffffff', 'gem'],
    ['Ice Gem Circlet', 'band', '#9fe3ff', '#3d8fd6', '#ffffff', 'gem'], ['Aurora Bow', 'bow', '#5fe3b4', '#5fd4ff', '#c4a0ff', 'sparkles'],
    ['Star Sparkler', 'star', '#fff1a8', '#f7c531', '#ffffff', 'sparkles'], ['Prism Visor', 'goggles', '#c4f2ff', '#9b5de5', '#5fe3b4', 'sparkles'],
    ['Opal Bonnet', 'bowl', '#e6f6ff', '#c4a0ff', '#5fe3b4', 'sparkles'], ['Glimmer Crown', 'crown', '#9fe3ff', '#3d8fd6', '#ffffff', 'gem'],
    ['Twinkle Halo', 'halo', '#fff1a8', '#c4f2ff', '#ffffff', 'sparkles'], ['Frost Jewel', 'gem', '#5fd4ff', '#2a7ac4', '#ffffff', 'sparkles'],
    ['Rainbow Gem Cap', 'cap', '#ff9ad0', '#5fd4ff', '#ffd23f', 'gem'], ['Starlit Top Hat', 'tophat', '#2a3a7a', '#5fd4ff', '#ffffff', 'stars'],
    ['Sugar Crystal Horn', 'horn', '#ffd6e5', '#ff9ad0', '#ffffff', 'sparkles'], ['Moonstone Orb', 'orb', '#e6edf5', '#9fb0d0', '#ffffff', 'sparkles'],
    ['Snow Globe', 'globe', '#c4f2ff', '#7a4a1d', '#ffffff', 'sparkles'], ['Shooting Star Plume', 'plume', '#fff1a8', '#5fd4ff', '#ffffff', 'stars'],
    ['Comet Mohawk', 'mohawk', '#5fd4ff', '#ffffff', '#fff1a8', 'sparkles'], ['Glitter Earmuffs', 'earmuffs', '#9fe3ff', '#ffffff', '#ff9ad0', 'sparkles'],
  ],
  epic: [
    ['Viking Horns', 'horns', '#f4ecd8', '#8a8a96', '#c9a052', 'none'], ['Knight Helm', 'helmet', '#a8b0bc', '#6a7280', '#e8504a', 'none'],
    ['Pirate Tricorn', 'tricorn', '#2a2a3a', '#f7c531', '#ffffff', 'patch'], ['Wizard Hat', 'wizard', '#4a3aa0', '#f7c531', '#ffffff', 'stars'],
    ['Samurai Kabuto', 'kabuto', '#c43a3a', '#f7c531', '#2a2a3a', 'none'], ['Astronaut Bubble', 'bubble', '#e6f6ff', '#ffffff', '#3d8fd6', 'none'],
    ['Ninja Band', 'band', '#2a2a3a', '#c43a3a', '#ffffff', 'none'], ['Explorer Pith', 'pith', '#e6d6a8', '#a08a5a', '#6e3d1d', 'none'],
    ['Captain Cap', 'cap', '#2a3a6a', '#ffffff', '#f7c531', 'none'], ['Musketeer Plume', 'feather', '#9b5de5', '#2a2a3a', '#f7c531', 'none'],
    ['Cowboy Hat', 'cowboy', '#a8703a', '#6e3d1d', '#f7c531', 'none'], ['Jester Cap', 'jester', '#e8504a', '#3d8fd6', '#f7c531', 'none'],
    ['Top Hat & Monocle', 'tophat', '#2a2a3a', '#c43a3a', '#f7c531', 'none'], ['Chef Toque', 'toque', '#ffffff', '#e6edf5', '#e8504a', 'none'],
    ['Firefighter Helmet', 'fire', '#e8504a', '#f7c531', '#2a2a3a', 'none'], ['Deep Sea Helmet', 'diver', '#c9a052', '#7a5a2e', '#9fe3ff', 'none'],
    ['Aviator Cap', 'aviator', '#8a5a2e', '#e6d6b8', '#5fd4ff', 'none'], ['Beekeeper Veil', 'keeper', '#f4ecd8', '#ffd23f', '#2a2a3a', 'none'],
    ['Roman Laurel', 'wreath', '#7fbf5a', '#4a8a2e', '#f7c531', 'none'], ['Bicorne of Command', 'bicorne', '#2a2a3a', '#f7c531', '#e8504a', 'none'],
  ],
  legendary: [
    ['Ice King Crown', 'crown', '#9fe3ff', '#f7c531', '#ffffff', 'gem'], ['Narwhal Horn', 'horn', '#f4ecd8', '#c9b48a', '#ffffff', 'stripes'],
    ['Phoenix Feather', 'feather', '#ff7a3d', '#f7c531', '#e8504a', 'sparkles'], ['Yeti Hood', 'bowl', '#ffffff', '#c9d6e6', '#5fd4ff', 'none'],
    ['Kraken Crown', 'tiara', '#9b5de5', '#47c28b', '#f7c531', 'dots'], ['Dragon Horns', 'horns', '#47c28b', '#2a6a4a', '#f7c531', 'stripes'],
    ['Unicorn Horn', 'cone', '#ffd6e5', '#c4a0ff', '#fff1a8', 'stripes'], ['Thunderbird Crest', 'mohawk', '#3d8fd6', '#f7c531', '#ffffff', 'stripes'],
    ['Frost Giant Helm', 'helmet', '#9fe3ff', '#5a8ab0', '#ffffff', 'gem'], ['Polar Star Circlet', 'star', '#fff1a8', '#9fe3ff', '#ffffff', 'sparkles'],
    ['Mermaid Tiara', 'spoon', '#5fe3b4', '#ff9ad0', '#ffffff', 'gem'], ['Golden Fleece Cap', 'beanie', '#f7c531', '#fff1a8', '#c98f10', 'dots'],
    ['Sun Disc', 'sun', '#f7c531', '#ff7a3d', '#fff1a8', 'none'], ['Moon Crescent', 'moon', '#e6edf5', '#9fb0d0', '#fff1a8', 'stars'],
    ['Mammoth Tusks', 'tusks', '#f4ecd8', '#8a5a2e', '#c9b48a', 'none'], ['Griffin Plume', 'plume', '#c9a052', '#ffffff', '#6e3d1d', 'none'],
    ['Orca Fin', 'fin', '#2a2a3a', '#ffffff', '#5fd4ff', 'none'], ['Whale Spout Halo', 'halo', '#5fd4ff', '#ffffff', '#3d8fd6', 'drips'],
    ['Leviathan Crest', 'antlers', '#2a6a8a', '#5fe3b4', '#f7c531', 'stripes'], ['Aurora Wreath', 'wreath', '#5fe3b4', '#c4a0ff', '#5fd4ff', 'sparkles'],
  ],
  glorious: [
    ['Halo of Ice', 'halo', '#c4f2ff', '#fff1a8', '#ffffff', 'sparkles'], ['Radiant Crown', 'crown', '#f7c531', '#fff1a8', '#e8504a', 'gem'],
    ['Celestial Laurel', 'wreath', '#f7c531', '#fff1a8', '#ffffff', 'sparkles'], ['Glory Plume', 'plume', '#ffffff', '#f7c531', '#e8504a', 'sparkles'],
    ['Champion Helm', 'helmet', '#f7c531', '#c98f10', '#ffffff', 'stars'], ['Sunburst Diadem', 'sun', '#fff1a8', '#f7c531', '#ffffff', 'sparkles'],
    ['Starfall Tiara', 'tiara', '#fff1a8', '#f7c531', '#ffffff', 'stars'], ['Victory Torch', 'flame', '#ff7a3d', '#f7c531', '#c98f10', 'sparkles'],
    ['Grand Marshal Bicorne', 'bicorne', '#2a3a7a', '#f7c531', '#ffffff', 'stars'], ['Royal Orb', 'orb', '#9b5de5', '#f7c531', '#ffffff', 'gem'],
    ['Golden Trophy Hat', 'trophy', '#f7c531', '#c98f10', '#fff1a8', 'sparkles'], ['Banner Top Hat', 'tophat', '#e8504a', '#f7c531', '#ffffff', 'stripes'],
    ['Fanfare Horns', 'horns', '#f7c531', '#c98f10', '#fff1a8', 'sparkles'], ['Majestic Mitre', 'wizard', '#ffffff', '#f7c531', '#e8504a', 'gem'],
    ['Glacier Throne Cap', 'cap', '#9fe3ff', '#f7c531', '#ffffff', 'gem'], ['Emperor Beanie', 'beanie', '#2a2a3a', '#f7c531', '#ffffff', 'stars'],
    ['Hall of Fame Band', 'band', '#f7c531', '#e8504a', '#ffffff', 'stars'], ['Medal Stack', 'medals', '#f7c531', '#e8504a', '#3d8fd6', 'none'],
    ['Comet Crown', 'star', '#fff1a8', '#ff7a3d', '#ffffff', 'sparkles'], ['Golden Goggles', 'goggles', '#f7c531', '#c98f10', '#9fe3ff', 'sparkles'],
  ],
  supreme: [
    ['Cosmic Crown', 'crown', '#2a1a5a', '#ef4f9a', '#5fd4ff', 'stars'], ['Galaxy Beanie', 'beanie', '#1a1a4a', '#9b5de5', '#ffffff', 'stars'],
    ['Black Hole Halo', 'halo', '#1a1030', '#9b5de5', '#ff7a3d', 'sparkles'], ['Nebula Hood', 'bowl', '#3a1a6a', '#ef4f9a', '#5fd4ff', 'stars'],
    ['Supernova Spikes', 'mohawk', '#ff7a3d', '#ef4f9a', '#fff1a8', 'sparkles'], ['Eclipse Visor', 'goggles', '#1a1a2a', '#f7c531', '#ffffff', 'none'],
    ['Quantum Cap', 'cap', '#2a1a5a', '#5fe3b4', '#ef4f9a', 'stars'], ['Infinity Band', 'band', '#1a1a4a', '#5fd4ff', '#ef4f9a', 'sparkles'],
    ['Time Warp Helm', 'helmet', '#3a2a7a', '#5fe3b4', '#f7c531', 'stars'], ['Planet Ring', 'planet', '#ef9a4f', '#c4a0ff', '#ffffff', 'none'],
    ['Aurora Veil', 'veil', '#5fe3b4', '#9b5de5', '#5fd4ff', 'sparkles'], ['Meteor Horns', 'horns', '#5a4a6a', '#ff7a3d', '#fff1a8', 'sparkles'],
    ['Constellation Top Hat', 'tophat', '#1a1a4a', '#5fd4ff', '#ffffff', 'stars'], ['Stardust Plume', 'plume', '#9b5de5', '#ef4f9a', '#ffffff', 'stars'],
    ['Event Horizon Orb', 'orb', '#1a1030', '#ff7a3d', '#9b5de5', 'sparkles'], ['Solar Flare', 'flame', '#ff7a3d', '#ef4f9a', '#fff1a8', 'sparkles'],
    ['Gravity Crown', 'tiara', '#3a2a7a', '#5fd4ff', '#ffffff', 'gem'], ['Pulsar Pom Party Hat', 'party', '#2a1a5a', '#5fe3b4', '#ef4f9a', 'stars'],
    ['Big Bang Antlers', 'antlers', '#ef4f9a', '#f7c531', '#5fd4ff', 'sparkles'], ['Multiverse Moon', 'moon', '#c4a0ff', '#5fd4ff', '#ffffff', 'stars'],
  ],
  food: [
    ['Pancake Stack', 'pancakes', '#e8b46a', '#c47a2e', '#ffe066', 'drips'], ['Waffle Cap', 'waffle', '#e8b46a', '#a8702e', '#ffffff', 'none'],
    ['Sushi Roll', 'sushi', '#2a3a2a', '#ffffff', '#ff8a6a', 'none'], ['Strawberry', 'strawberry', '#e8384a', '#47c28b', '#ffe066', 'dots'],
    ['Spaghetti Bowl', 'spaghetti', '#ffe08a', '#e8504a', '#ffffff', 'none'], ['Frosted Donut', 'donut', '#e8b46a', '#ff8ab0', '#5fd4ff', 'dots'],
    ['Taco', 'taco', '#f2c94a', '#47c28b', '#e8504a', 'none'], ['Ice Cream Cone', 'icecream', '#ffd6e5', '#d6a56a', '#8a5a2e', 'dots'],
    ['Pineapple', 'pineapple', '#f7c531', '#47c28b', '#c98f10', 'none'], ['Watermelon Slice', 'watermelon', '#ff6f7f', '#47c28b', '#2a2a2a', 'dots'],
    ['Cupcake', 'cupcake', '#ff9ad0', '#d6a56a', '#e8384a', 'dots'], ['Burger', 'burger', '#e8a04a', '#7a3a1d', '#47c28b', 'dots'],
    ['Pizza Slice', 'pizza', '#f7d06a', '#e8504a', '#c98f10', 'dots'], ['Croissant', 'croissant', '#e8a04a', '#c47a2e', '#ffe0a8', 'none'],
    ['Cheese Wedge', 'cheese', '#ffd23f', '#e8a92e', '#fff3b0', 'dots'], ['Broccoli Crown', 'broccoli', '#47c28b', '#2a7a4a', '#a8e08a', 'none'],
    ['Wobbly Pudding', 'pudding', '#f2c94a', '#8a4a1d', '#ffffff', 'none'], ['Dumpling Steamer', 'dumpling', '#c9a066', '#f4ecd8', '#ffffff', 'none'],
    ['Corn on the Cob', 'corn', '#ffd23f', '#7fbf5a', '#fff3b0', 'dots'], ['Bento Box', 'bento', '#c43a3a', '#2a2a2a', '#ffffff', 'none'],
  ],
};

function slug(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export const HOODS: HoodDef[] = RARITIES.flatMap((r, ri) =>
  SETS[r.id].map((row, i) => {
    // Rotate family assignment per rarity so every rarity has all 20 families exactly once.
    const family = FAMILIES[(i + ri * 7) % FAMILIES.length]!;
    const [name, kind, c1, c2, c3, deco] = row;
    const variation = 1 + (((i * 37 + ri * 11) % 21) - 10) / 100;
    return {
      id: `hood_${r.id}_${slug(name)}`,
      name,
      rarity: r.id,
      rarityIndex: ri,
      family: family.id,
      strength: family.strength[ri]!,
      price: Math.max(5, Math.round((HOOD_PRICE_BY_RARITY[ri]! * variation) / 5) * 5),
      art: { kind, colors: [c1, c2, c3], deco },
    };
  }),
);

export const HOOD_BY_ID: Record<string, HoodDef> = Object.fromEntries(HOODS.map((h) => [h.id, h]));
export const FAMILY_BY_ID: Record<FamilyId, FamilyDef> = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<FamilyId, FamilyDef>;

export function describeHood(h: HoodDef): string {
  return FAMILY_BY_ID[h.family].describe(h.strength, h.rarityIndex);
}

/** Gameplay modifiers for the equipped Hood. Ranked passes normalized=true (cosmetic only). */
export function gameplayModifiers(hoodId: string | null, normalized: boolean): GameplayModifiers {
  const m: GameplayModifiers = { ...NORMALIZED_MODIFIERS };
  if (normalized || !hoodId) return m;
  const h = HOOD_BY_ID[hoodId];
  if (!h) return m;
  switch (h.family) {
    case 'maxStamina': m.maxStamina = h.strength; break;
    case 'staminaRegen': m.staminaRegen = h.strength; break;
    case 'sprintEfficiency': m.sprintDrain = h.strength; break;
    case 'moveSpeed': m.moveSpeed = h.strength; break;
    case 'accelControl': m.accel = h.strength; break;
    case 'fishImpact': m.fishKick = h.strength; break;
    case 'fishControl': m.fishControl = h.strength; break;
    case 'warningDistance': m.warningDistance = h.strength; break;
    case 'startingStamina': m.startStamina = h.strength; break;
    case 'collisionRecovery': m.collisionRecovery = h.strength; break;
    default: break;
  }
  return m;
}

/**
 * Combined Shard multiplier for roadmap chests (Shard Earnings × General
 * Utility — only one Hood is equipped, so at most one applies), capped.
 */
export function shardMultiplier(hoodId: string | null): number {
  return Math.min(MAX_SHARD_MULTIPLIER, economyBonus(hoodId, 'shardEarnings') * economyBonus(hoodId, 'generalUtility'));
}

/** Quest reward multipliers: full curve for Icicles, the flat Shard curve for Shards. */
export function questMultipliers(hoodId: string | null): { icicles: number; shards: number } {
  const h = hoodId ? HOOD_BY_ID[hoodId] : undefined;
  if (!h || h.family !== 'questRewards') return { icicles: 1, shards: 1 };
  return { icicles: h.strength, shards: Math.min(MAX_SHARD_MULTIPLIER, SHARD_HOOD_CURVE[h.rarityIndex]!) };
}

/** Economy multiplier for a family (1 if the equipped Hood is a different family). */
export function economyBonus(hoodId: string | null, family: FamilyId): number {
  if (!hoodId) return 1;
  const h = HOOD_BY_ID[hoodId];
  return h && h.family === family ? h.strength : 1;
}
