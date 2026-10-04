# Slippery Fish — implementation checkpoint

_Short working notes for contributors. The owner-facing guide is [HANDOFF.md](HANDOFF.md)._

## State
- Everything is implemented: all four modes, all screens and signs, economy, quests, chests, Hoods, Waddles, profile icons, settings, Privacy & Legal, honest service adapters, GitHub Pages workflow, legal drafts, docs.
- Progression update (see UPDATE.md): igloo goal + 70% rule, generator v2, economy v2, roadmap, Inverse Smiles startup, living menu, seasons/day-night, pet goldfish, titles, Training Rink, one-tab guard, polish.
- Tests: `npm test` (99 unit tests) · `npm run test:e2e` (15 smoke tests × desktop/phone on the sub-path production build) · `npm run validate:content` (runs before every build).
- CI: `.github/workflows/pages.yml`. The site is live; pushes to `main` deploy.

## Open items (owner / external)
- Publisher legal info and legal review of the drafts.
- Real-device testing (iOS Safari, Android Chrome, Firefox, Safari desktop).
- Optional: final art for the placeholders (polar bear, trophy, Hoods, two chests), licensed music, online services (see SERVICES.md).

## Gotchas
- Phaser looping tweens on destroyed objects re-complete instantly → infinite loop. Always kill child tweens when retiring a container (see `BackdropScene.stopLayerTweens`).
- Headless test browsers render through SwiftShader (≈5 fps). Springs still settle (the ticker clamps dt to 0.1 s), but tests should emulate reduced motion or wait for `.input-blocker` to disappear before clicking.
- `.gitignore` contains `*.seed`, so avoid that file extension.
- `scripts/validate-content.mjs` loads the real TS modules through Vite's SSR loader, so it checks the same data the game uses.
- `makePhysical` (spring buttons) writes inline `transform`; position such elements with `left/top` + the CSS `translate` property, never with `transform`, or they jump on hover.
- Full screens that use z-indexed pieces need `isolation: isolate`, or those pieces paint over hanging signs.
- Menu season/day-night rules exist twice (`src/config/menuTheme.ts` and the inline script in `index.html`); a unit test keeps them identical.
