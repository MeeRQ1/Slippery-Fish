/**
 * Choose Your Waddle — playable penguins. All are round, single-sided,
 * purely 2D sprites from the supplied character art:
 *  - 10 penguin SPECIES (core character sheet)
 *  - 10 SIGNATURE WADDLES (supplied penguin outfit reference art)
 * Penguins are cosmetic; they never change stats (Hoods do that).
 */
import { WADDLE_PRICES } from '../config/economy';

export interface WaddleDef {
  id: string;
  name: string;
  frame: string;
  kind: 'species' | 'outfit';
  price: number;
  blurb: string;
}

const species = (id: string, name: string, blurb: string, price: number = WADDLE_PRICES.species): WaddleDef => ({ id, name, frame: `penguin_${id}`, kind: 'species', price, blurb });
const outfit = (id: string, name: string, blurb: string): WaddleDef => ({ id, name, frame: `waddle_${id}`, kind: 'outfit', price: WADDLE_PRICES.outfit, blurb });

export const WADDLES: WaddleDef[] = [
  species('classic', 'Classic', 'The original round boi. Free forever.', 0),
  species('slate', 'Slate', 'Grey, calm, deeply unbothered.'),
  species('bluebell', 'Bluebell', 'Bright blue and suspiciously cheerful.'),
  species('bubblegum', 'Bubblegum', 'Pink fluff with an attitude.'),
  species('goldbelly', 'Goldbelly', 'Royal colours, zero royal manners.'),
  species('crested', 'Crested', 'Fancy feathers. Fancier wobble.'),
  species('skyfin', 'Skyfin', 'Light as a snowflake, twice as slippery.'),
  species('macaroni', 'Macaroni', 'Eyebrows of pure determination.'),
  species('lilac', 'Lilac', 'Soft purple, sharp dribbling.'),
  species('ember', 'Ember', 'A warm penguin for cold arenas.'),
  outfit('aviator', 'Aviator', 'Goggles on. Fish incoming.'),
  outfit('tycoon', 'Tycoon', 'Wears a suit to the ice. Means business.'),
  outfit('lovebug', 'Lovebug', 'Heart boxers. Full confidence.'),
  outfit('scrunchie', 'Scrunchie', 'A wink, a scrunchie, a stash.'),
  outfit('zappy', 'Zappy', 'Lightning-fast vibes (same speed as everyone).'),
  outfit('cozy', 'Cozy', 'Scarf wrapped, happiness maxed.'),
  outfit('angler', 'Angler', 'Bucket hat with a tiny fish on it. Respect.'),
  outfit('gamer', 'Gamer', 'Headphones on, controller in flipper.'),
  outfit('scrappy', 'Scrappy', 'Bandaged and undefeated.'),
  outfit('sleepy', 'Sleepy', 'Dreams about fish. Also plays for fish.'),
];

export const WADDLE_BY_ID: Record<string, WaddleDef> = Object.fromEntries(WADDLES.map((w) => [w.id, w]));

export function waddleFrame(id: string): string {
  return WADDLE_BY_ID[id]?.frame ?? 'penguin_classic';
}
