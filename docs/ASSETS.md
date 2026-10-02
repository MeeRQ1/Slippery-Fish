# Slippery Fish — Assets

Everything the game draws comes from one of three places:

1. **Supplied reference sheets** (preserved untouched in `art/source-sheets/`), cut into individual sprites by a repeatable extraction pipeline.
2. **Procedural art drawn at runtime** where no suitable art was supplied. Each one is labelled `PLACEHOLDER` in code and listed below.
3. **Web fonts** bundled from npm (`@fontsource/fredoka`, `@fontsource/luckiest-guy`).

There are **no** audio files. Music slots are empty, and sound effects are synthesized at runtime (see [Audio](#audio)).

## Supplied sheets

| File in `art/source-sheets/` | Batch | Used for |
|---|---|---|
| `Core_CharactersEnemiesBordersFontsStars.png` | Core | 10 penguin species, Arctic Wolf, Seal, snow map borders. Its fish/obstacles were replaced by Batch 3/4, which are the assigned sources for those. Its font alphabets and gold stars were *not* extracted (see substitutions). |
| `Batch03_FishStashEffects.png` + `Batch03_FishStashEffects_AltCrop.webp` | 3 | DribbleFish variants and states, stash states (empty → complete), stash arrow, fish/stash effects. The alt crop (supplied inline in the chat) is a cleaner version of the same batch. |
| `Batch04_IceObstacles.png` | 4 | All 28 gameplay obstacles (colliders hand-authored in `src/config/obstacles.ts`) and the single canonical game logo (`ui_logo`), which appears on this sheet. |
| `Batch05_MainMenuEnvironment.png` | 5 | Main-menu scene: mountain band, clouds, igloo, snow mounds, frozen pond, wooden sign, rocks, ice chunks, bushes, snowman, foreground snowbank, snowflakes. Also the Icicle Shard currency icon. |
| `Batch06_MainMenuButtons.png` | 6 | The 12 main-menu object buttons plus 48 icon states (normal / hover / pressed / disabled for each button). |
| `Batch07A_EnvironmentTilesProps.png` | 7A | Dirt and stone ground textures, trees, bushes, rocks, pond props, and the Tuna Trunk chest. |
| `Batch07B_DecorationsInteractiveProps.png` | 7B | Docks, boats, crates, signposts, fences, lamps, market props. Decorative only — no mechanics were invented from "interactive-looking" props. |
| `Batch07C_GroundEnvironmentTiles.png` | 7C | Floor textures (snow, ice, snowy dirt, cracked ice, water, deep water, sand), paths, fences, lamps, pines. |
| `Batch08A_BuildingsStructures.png` | 8A | Houses, igloos, tents, sheds, racks, piers and bridges (fishing scene and arena outskirts), plus the Fish currency icon. |
| `Batch08B_ExtraEnvironmentProps.png` | 8B | Extra snow/ice props and the Mackerel Chest. |
| `Batch10_EnvironmentDetails.png` | 10 | Small environment details (trees, bushes, rocks, mushrooms …), the Minnow Crate and the Icicle currency icon. This sheet was supplied twice; the two files were byte-identical, so one copy is kept. |
| `Batch11_TownDecorations.png` | 11 | Town/festival decorations (only placed in the Festival region), plus the buoy and life ring. |
| `Reference_PenguinCosmeticOutfits.webp` | (inline image) | The 10 "Signature Waddle" penguins in Choose Your Waddle. |
| `Reference_ProfileIcons_LowRes.png` | (inline image) | Layout reference only. The low-resolution sheet was too small to extract cleanly, so the 30 profile icons are composed from the extracted sprites above inside circular frames (`src/profile/icons.ts`). |

**Missing: Batch 9 was never supplied.** Nothing in the game claims to use it, and no substitute was invented for it.

## Extraction pipeline

```
art/source-sheets/*.png|webp
        │  art/extraction-specs/<Sheet>.json   (one spec per sheet: crop boxes, background
        │                                        removal mode, ids, category, collision role, themes)
        ▼
scripts/extract_assets.py                       (Python 3 + numpy, scipy, opencv-python-headless, Pillow)
        │  • removes backgrounds and sheet labels (flood fill / colour key / sheet alpha)
        │  • un-blends edges, trims, pads, packs into atlases
        ▼
public/assets/atlases/<group>-0.webp + .json    (8 WebP atlases, Phaser JSON-hash format)
public/assets/images/*.webp                     (logo, mountain band, tileable ground textures)
content/manifests/assets.generated.json         (full manifest: every frame with metadata)
content/manifests/assets.runtime.json           (slim manifest bundled into the game)
```

- Re-run with `npm run extract:assets` after changing a spec. You need Python 3 with `pip install numpy scipy opencv-python-headless pillow`.
- `scripts/contact_sheet.py` renders a contact sheet of the extracted frames for visual checks.
- The output is 432 frames, sorted into 15 categories (BackgroundDecoration, TownProp, UIOnly, MainMenuOnly, GameplayObstacle, GameplayCharacter, FishingProp, Building, Floor, GameplayFish, FishEffect, GameplayStash, CurrencyIcon, GameplayEnemy, Boundary). Each frame also carries a collision role (`gameplay-collider`, `limited-collider`, `visual`, `background`, `foreground-frame`, `ui`) and region themes. Decoration is picked by theme and role, so town props only show up in the Festival region and purely decorative props never get colliders.
- `npm run build` runs `scripts/validate-content.mjs`, which fails the build if any frame referenced by the content or code is missing, or if an atlas or texture file is missing.
- CSS sprites in the DOM UI reuse the same atlas pages (`src/ui/dom.ts`), so no image is duplicated.

## Substitutions and placeholders

Each of these is deliberate, visible in code, and should be replaced if final art is commissioned.

| What | Why | Where | Replacement path |
|---|---|---|---|
| **Polar Bear** (enemy + profile icon) | No polar bear art was supplied. The Core sheet has only the wolf and seal. | `drawPolarBear()` in `src/art/procedural.ts` (labelled PLACEHOLDER) | Add a sprite to an extraction spec and point the renderer and `icon_polar_bear` at its frame id. |
| **Victory trophy** | No trophy art was supplied. | `drawTrophy()` in `src/art/procedural.ts` (PLACEHOLDER) | Same as above. |
| **All 200 Hoods** | No hood/hat sheet was supplied. The supplied cosmetic outfits are whole penguins, not separable hats. | `src/art/hoodArt.ts` draws vector hats per rarity/style (PLACEHOLDER-quality) | Add hood sprites, set `art` in `src/progression/hoods.ts` to frame ids, and render them in `preview.ts` and `GameScene`. |
| **Excellence Stars** | The spec asks for kindergarten construction-paper stars. The Core sheet's stars are glossy gold, so paper stars are drawn procedurally (wobbly cut edges, paper grain, crayon outline). | `drawPaperStar()` in `src/art/procedural.ts` | Swap in paper-star art if commissioned. |
| **UI fonts** | The Core sheet's "bubbly" and "wooden sign" alphabets are uppercase A–Z images only (no digits, punctuation or lowercase), so they can't render times, counts or names. | Fredoka (bubbly UI text) and Luckiest Guy (wooden titles), styled in CSS to match | A full bitmap/web font made from the reference letters. |
| **Batch 5 pine cluster** | Couldn't be cleanly separated from the Batch 5 background. | Pines from Batch 7C/10 are used in the menu scene instead | Re-cut with a better mask if needed. |
| **Emperor & Leviathan chests** | Only three chest designs were supplied (Minnow Crate in Batch 10, Mackerel Chest in 8B, Tuna Trunk in 7A). | The Batch 6 treasure-button chest art with CSS hue/glow filters | Add two chest sprites and set `art` in `CHEST_TIERS` (`src/config/economy.ts`). |
| **Procedural floors** (meadow, fall grass, ice cream, candy) | Some regions (spring, fall, ice cream, candy snow) had no matching ground tile. | `drawProceduralFloor()` in `src/art/procedural.ts` | Add tileable textures and set `floorTexture` in `src/config/regions.ts`. |

## Audio

`src/config/audio.ts` is the only place audio is assigned.

- **Music: 30 slots, all `null`.** No licensed music was supplied. Covered: main menu, Adventure plus one slot per region (16), Daily, Infinite, Ranked, Fishing, Choose Your Waddle, Hoods, Quests, Shop, Chests, victory, defeat and OUTMATCHED. Empty slots play silence; nothing breaks. To add a track, put the file in `public/assets/audio/music/` and set the slot to `{ src: ['assets/audio/music/x.mp3'], volume, loop, license }`. The build validator checks that the file exists.
- **Sound effects:** every effect is synthesized at runtime with Web Audio (`src/audio/synth.ts`): hover, clicks, CHA-CHING, chests, chains/wood creaks, fish bounce/score, danger, munch, sprint, stamina warnings, victory, trophy, crying, OUTMATCHED and more. To use recorded audio for any effect, add `src` to its entry (`src` takes precedence over `synth`).
- Audio unlocks on the first intentional pointer or key press, as browser autoplay policies require.
