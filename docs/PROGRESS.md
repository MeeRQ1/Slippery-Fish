# Slippery Fish — implementation checkpoint

_Short working notes for contributors. The owner-facing guide is [HANDOFF.md](HANDOFF.md)._

## State
- Everything is implemented: all four modes, all screens and signs, economy, quests, chests, Hoods, Waddles, profile icons, settings, Privacy & Legal, honest service adapters, GitHub Pages workflow, legal drafts, docs.
- Tests: `npm test` (44 unit tests) · `npm run test:e2e` (11 smoke tests × desktop/phone on the sub-path production build) · `npm run validate:content` (runs before every build).
- CI: `.github/workflows/pages.yml`. The build job is green on the PR; deployment waits on the owner (merge + Settings → Pages → GitHub Actions).

## Open items (owner / external)
- Publisher legal info and legal review of the drafts.
- Real-device testing (iOS Safari, Android Chrome, Firefox, Safari desktop).
- Optional: final art for the placeholders (polar bear, trophy, Hoods, two chests), licensed music, online services (see SERVICES.md).

## Gotchas
- Phaser looping tweens on destroyed objects re-complete instantly → infinite loop. Always kill child tweens when retiring a container (see `BackdropScene.stopLayerTweens`).
- Headless test browsers render through SwiftShader (≈5 fps). Springs still settle (the ticker clamps dt to 0.1 s), but tests should emulate reduced motion or wait for `.input-blocker` to disappear before clicking.
- `.gitignore` contains `*.seed`, so avoid that file extension.
- `scripts/validate-content.mjs` loads the real TS modules through Vite's SSR loader, so it checks the same data the game uses.
