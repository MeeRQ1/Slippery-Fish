# Slippery Fish

A cute, comedic top-down 2D physics browser game. You're a round little penguin **dribbling slippery fish** to the penguin chicks' igloo: bump them, bank them off snowbanks, sprint into them, and line up your shot through the gaps in the snowy fences. A fish counts only when at least 70% of it is inside the yard. Polar bears, arctic wolves and seals are trying to eat them first.

Published by **Inverse Smiles**. Play it at **https://meerq1.github.io/Slippery-Fish/**.

- **Four modes:** Adventure (800 levels across 16 regions), Daily Challenge (40 shared levels a day, eight Popsicle rewards), Infinite (seeded, endless), Ranked (best of three on the same seed; needs a server, so offline Practice for now)
- An Adventure roadmap with route chests, level twists, Excellence Stars, Hard Mode, quests and an optional Training Rink
- 200 Hoods (economy v2), 20 Waddles, 30 profile icons, 18 earned titles, treasure chests, and a pet goldfish to feed and decorate
- A living main menu with Spring/Summer/Autumn/Winter presets and local dawn/day/dusk/night lighting
- Desktop: **WASD** + hold **Left Shift** to sprint. Touch: joystick + hold **SPRINT**.
- Static site built with TypeScript, Vite and Phaser 4, deployable to GitHub Pages. Saves stay in your browser.

## Quick start

```bash
npm ci
npm run dev            # http://localhost:5173/
```

| Command | |
|---|---|
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Unit tests (includes validating all 800 Adventure levels) |
| `npm run build` | Content validation + production build → `dist/` |
| `npm run preview:subpath` | Serve `dist/` like GitHub Pages at `/Slippery-Fish/` (build with `BASE_PATH=/Slippery-Fish/`) |
| `npm run test:e2e` | Browser smoke tests on the production build |

Requires Node.js 22.12+.

## Documentation

- **[docs/HANDOFF.md](docs/HANDOFF.md)**: build, GitHub Pages deployment, compatibility, services, privacy/terms, feature matrix and release blockers. **Start here.**
- **[docs/UPDATE.md](docs/UPDATE.md)**: the progression update (goal & 70% rule, roadmap, startup, titles, pet, seasons, Training Rink, tests).
- [docs/ECONOMY.md](docs/ECONOMY.md): the Hood economy rebalance, its targets and simulation results.
- [docs/ASSETS.md](docs/ASSETS.md): supplied art, the extraction pipeline, substitutions and placeholders, audio.
- [docs/SERVICES.md](docs/SERVICES.md): optional ads, accounts, cloud save, Ranked server, payments (none are connected yet).

## Status

The offline single-player game is complete, tested and deployed to GitHub Pages. Online services are adapters only and the legal pages are drafts with placeholders. See the release blockers in the handoff guide.
