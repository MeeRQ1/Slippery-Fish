# Slippery Fish

A cute, comedic top-down 2D physics browser game. You're a round little penguin **dribbling slippery fish** into the stash: bump them, bank them off snowbanks, sprint into them. Polar bears, arctic wolves and seals are trying to eat them first.

- **Four modes:** Adventure (800 levels across 16 regions), Daily Challenge (40 shared levels a day, eight Popsicle rewards), Infinite (seeded, endless), Ranked (best of three on the same seed; needs a server, so offline Practice for now)
- Excellence Stars, Hard Mode, quests, 200 Hoods, 20 Waddles, 30 profile icons, treasure chests
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
- [docs/ASSETS.md](docs/ASSETS.md): supplied art, the extraction pipeline, substitutions and placeholders, audio.
- [docs/SERVICES.md](docs/SERVICES.md): optional ads, accounts, cloud save, Ranked server, payments (none are connected yet).

## Status

The offline single-player game is complete and tested. Online services are adapters only, the legal pages are drafts with placeholders, and the site isn't deployed until Pages is enabled. See the release blockers in the handoff guide.
