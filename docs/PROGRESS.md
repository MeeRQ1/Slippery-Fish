# Slippery Fish — implementation checkpoint

_Last updated during the initial build session. Keep this file short and current._

## Done (verified)
- Project: Vite 8 + TypeScript 7 strict + Phaser 4.2.1 + Vitest 5 + Playwright 1.56 (Chromium 141 preinstalled).
- Assets: 13 supplied sheets preserved in `art/source-sheets/` (Batch 9 NOT supplied; Batch 10 sheet was supplied twice — identical file).
  `scripts/extract_assets.py` + `art/extraction-specs/*.json` → 432 frames in 8 WebP atlases + standalone textures,
  manifest `content/manifests/assets.generated.json` (full) and `assets.runtime.json` (bundled, slim).
- Physics `src/physics/world.ts` (custom fixed-step circle vs rounded convex polygon/circle, substeps, limited colliders).
- Sim `src/gameplay/sim.ts` (+ session.ts driver): movement, held sprint, stamina (4 visual states), fish, stash, 3 enemy AIs with flow-field nav.
- Generator `src/procedural/*` (deterministic, no trig/pow in generation), validation at collider sizes; Adventure 800 (0 fallbacks), Daily 40/day (UTC), Infinite seed codes.
- UI: router + transitions + snow curtain, sign base class, spring buttons, main menu (Batch 5/6), Adventure map, Play screen (HUD, touch, vignette, pause, victory w/ falling trophy + paper stars, 4-option failure, OUTMATCHED).
- Economy/progression: wallet (idempotent tx), quests, hoods (200), waddles (20), profile icons (30), drivers for adventure/daily/infinite.
- Tests: `npm test` → physics, sim, generator (27 tests). Browser bot (scripts/dev/bot-play.mjs) wins level 1 in Chromium.

## In progress / next
1. Screens: Daily, Infinite, Ranked, Fishing, Choose Your Waddle, Hoods (sign), Quests (sign), Chests (sign), Store (sign), Settings (sign) + Privacy & Legal, Profile (sign). Currently `PendingSign` placeholders in `src/ui/screens/registry.ts`.
2. Service adapters: auth, cloud save, payments, ranked, remote config/promotions, consent (honest unavailable states).
3. Docs: README, HANDOFF guide, privacy/terms drafts, assets/services/third-party inventories, feature matrix.
4. `.github/workflows/pages.yml`, `scripts/validate-content.mjs`, `scripts/serve-subpath.mjs`, Playwright e2e on production build.
5. Polish + perf measurements.

## Gotchas learned
- Phaser looping tweens on destroyed objects re-complete instantly → infinite loop. Always kill child tweens when retiring a container (see BackdropScene.stopLayerTweens).
- Under headless SwiftShader the game renders slowly; browser scripts must wait for selectors and write logs to files.
- `.gitignore` contains `*.seed` — avoid that extension.

## Commands
`npm run dev` · `npm run typecheck` · `npm test` · `npm run build` · `npm run preview` · `npm run extract:assets` (needs Python + numpy/scipy/opencv/Pillow)
