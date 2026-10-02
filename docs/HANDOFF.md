# Slippery Fish — Browser Build, GitHub Deployment & Optional Services Handoff

This guide is for the repository owner. You don't need web-deployment experience; every step names the exact file, command or settings page.

> **Deployment status: NOT YET PERFORMED.** The deploy workflow is ready and its build/test job passes on GitHub. To actually publish, two owner actions are needed: (1) merge the pull request into `main`, and (2) set **Settings → Pages → Source: GitHub Actions**. After that, every push to `main` deploys automatically. The expected URL is **https://meerq1.github.io/Slippery-Fish/** (not live until those steps are done).
>
> **Release scope:** this is a complete **offline single-player** browser game. Ads, accounts, cloud save, online Ranked and real-money payments are **not connected**. The game says so honestly wherever they appear. Legal pages are **drafts with placeholders**. See [Release blockers](#11-release-blockers).

Contents
1. [What's in the box](#1-whats-in-the-box)
2. [Run it locally](#2-run-it-locally)
3. [Production build and preview](#3-production-build-and-preview)
4. [Commit, pull request, merge](#4-commit-pull-request-merge)
5. [GitHub Pages deployment](#5-github-pages-deployment)
6. [Updating, rollback, custom domain, save compatibility](#6-updating-rollback-custom-domain-save-compatibility)
7. [Browser compatibility & what was tested](#7-browser-compatibility--what-was-tested)
8. [Optional services](#8-optional-services)
9. [Privacy, Terms and the data audit](#9-privacy-terms-and-the-data-audit)
10. [Third-party inventory](#10-third-party-inventory)
11. [Release blockers](#11-release-blockers)
12. [Feature matrix](#12-feature-matrix)
13. [Optional next work](#13-optional-next-work)

---

## 1. What's in the box

| Path | What it is |
|---|---|
| `index.html`, `src/` | The game: TypeScript (strict) + Phaser 4 (canvas/WebGL rendering) + a DOM UI layer for menus/HUD. |
| `src/main.ts`, `src/app.ts` | Boot, the long-lived systems (save, settings, audio, input, wallet, quests, services) and the screen router. |
| `src/gameplay/`, `src/physics/`, `src/enemies/` | Pure-TypeScript simulation: penguin, held sprint + stamina, physical fish, stash, enemies, custom fixed-step physics. No DOM inside. |
| `src/levels/`, `src/procedural/` | Adventure (800), Daily (40/day), Infinite (seeded) level generation and validation. |
| `src/ui/` | Screens (`src/ui/screens/`), hanging signs, physical buttons, HUD, CSS. |
| `src/config/` | Tunable data: gameplay, regions, obstacles, economy, audio manifest, UI motion, services and legal links. |
| `src/services/` | Adapters for ads, accounts/cloud save, payments, Ranked, promotions, privacy. |
| `public/assets/` | Extracted art (WebP atlases + textures). `public/legal/`: draft legal/support pages. |
| `art/` | The original supplied sheets (`source-sheets/`) and extraction specs. See [ASSETS.md](ASSETS.md). |
| `scripts/` | `validate-content.mjs` (runs before every build), `serve-subpath.mjs` (Pages-like preview), `gen-notices.mjs`, `extract_assets.py`. |
| `tests/unit/` (Vitest), `tests/e2e/` (Playwright) | Automated tests. |
| `.github/workflows/pages.yml` | CI + GitHub Pages deployment. |
| `docs/` | This guide, [ASSETS.md](ASSETS.md), [SERVICES.md](SERVICES.md). |

## 2. Run it locally

1. Install **Node.js 22.12 or newer** (the LTS from https://nodejs.org). npm comes with it.
2. In a terminal, from the repository folder:
   ```bash
   npm ci            # installs the exact versions from package-lock.json
   npm run dev       # starts the dev server
   ```
3. Open the printed address (usually http://localhost:5173/).

Controls: **W A S D** or arrow keys to waddle, **hold Left Shift** to sprint, **Esc** or **P** to pause. On touch screens, use the floating joystick (left) and hold **SPRINT** (right); both work at the same time. Settings can swap the sides.

Other commands:

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript strict check of everything (game, tests, configs). |
| `npm test` | Unit tests (Vitest), including generating and validating all 800 Adventure levels. |
| `npm run validate:content` | Content checks only (catalog counts, art frames, levels, legal pages, secret scan). |
| `npm run build` | Content validation, then a production build into `dist/`. |
| `npm run preview` | Serves `dist/` at http://localhost:4173/ (root path). |
| `npm run preview:subpath` | Serves `dist/` at http://localhost:4174/Slippery-Fish/ exactly like GitHub Pages (build with `BASE_PATH=/Slippery-Fish/` first). |
| `npm run test:e2e` | Browser smoke tests against the production build on the sub-path (needs `npx playwright install chromium` once). |
| `npm run check` | typecheck + unit tests + build. |
| `npm run extract:assets` | Re-cuts sprites from `art/source-sheets/` (needs Python 3 + numpy, scipy, opencv-python-headless, Pillow). |

## 3. Production build and preview

```bash
BASE_PATH=/Slippery-Fish/ npm run build     # same base path GitHub Pages will use
npm run preview:subpath                     # → http://localhost:4174/Slippery-Fish/
npm run test:e2e                            # optional: automated smoke tests on that build
```

- Output folder: **`dist/`** (about 4.1 MB). It contains `index.html`, hashed JS/CSS/fonts in `dist/assets/`, atlases, and `dist/legal/`.
- **Base path.** `BASE_PATH` controls where the site expects to live. The workflow sets it automatically:
  - project site `https://<user>.github.io/<repo>/` → `/<repo>/` (here `/Slippery-Fish/`)
  - user/organization site or custom domain root → `/`
  - unset (local) → `./` (relative; works from any folder)

  Every runtime URL (atlases, textures, fonts, legal pages) goes through Vite's `import.meta.env.BASE_URL`, so all three work. Screens use **hash routing** (`#/daily`, `#/infinite`, …), so refreshes and deep links never need server routes. Gameplay itself is never deep-linked; a refresh mid-level returns you to that mode's screen.
- Don't open `dist/index.html` directly from disk (`file://`): browsers block module scripts there. Always use a preview server.

## 4. Commit, pull request, merge

The work so far is on the branch `claude/new-session-1tih6x`, with draft pull request **[MeeRQ1/Slippery-Fish#1](https://github.com/MeeRQ1/Slippery-Fish/pull/1)**.

1. Open the PR on GitHub. The **Checks** tab shows the `build` job (typecheck → unit tests → content validation → production build → Playwright smoke tests). The `deploy` job is skipped on pull requests.
2. When you're happy, click **Ready for review**, then **Merge**.
3. Day-to-day after that:
   ```bash
   git checkout -b my-change
   # …edit…
   npm run check
   git add -A && git commit -m "Describe the change"
   git push -u origin my-change     # then open a PR on GitHub and merge it when green
   ```

## 5. GitHub Pages deployment

Checked against current docs: GitHub "Using custom workflows with GitHub Pages" and "GitHub Pages limits", and Vite's "Deploying a Static Site" guide. The action versions are the latest major tags in the upstream repositories: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`, `actions/upload-artifact@v7`. Vite's current GitHub Pages example uses the same majors.

**One-time setup (owner):**

1. Merge the PR into `main` (section 4).
2. Go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to **Actions → Pages → Run workflow** (or push any commit to `main`).
4. When the run is green, open the URL shown on the `deploy` job (also under Settings → Pages). For this repository: **https://meerq1.github.io/Slippery-Fish/**.

How the workflow (`.github/workflows/pages.yml`) behaves:

- **Pull requests:** install with `npm ci`, typecheck, unit tests, build with `BASE_PATH=/Slippery-Fish/`, Playwright smoke tests. No deployment.
- **Push to `main` / manual run:** the same checks, plus `configure-pages` (which reports the real base path) and upload of `dist/` as the Pages artifact. Then the `deploy` job publishes it using the `github-pages` environment with `pages: write` and `id-token: write` permissions.
- If Pages isn't enabled yet, the run still tests everything, skips deployment, and leaves a warning: "GitHub Pages is not configured — deployment skipped".
- **Where to look when something fails:** the **Actions** tab, then the run, then the failing step. A failed Playwright run uploads a `playwright-report` artifact; download it and open `index.html` inside. Deployments are listed under **Settings → Environments → github-pages** and on the repo home page under **Deployments**.

**Verify the live site** (after the first deploy):

1. Open the URL in a normal window. The boot loader shows, then the main menu.
2. Open `…/Slippery-Fish/#/daily` directly, then **refresh**. It should stay on Daily Challenge.
3. Open the URL in a **private/incognito window** (fresh profile). It starts with a new local save, and you can play level 1.
4. Open it on a **phone** in portrait and landscape. All 12 menu buttons should be visible, and joystick + SPRINT should work together.
5. Open **Settings → Privacy & Legal → READ** for each document. They load from `…/Slippery-Fish/legal/`.

**GitHub Pages limits that matter here** (from GitHub's docs): published site up to 1 GB (this build is about 4 MB), soft bandwidth limit of 100 GB/month, 10-minute deployment timeout. GitHub also says Pages must not be used primarily for an online business, e-commerce or commercial transactions. The current free, ad-free, purchase-free build is fine; review those terms before enabling ads or payments (see section 8).

## 6. Updating, rollback, custom domain, save compatibility

- **Update:** merge to `main`; the site redeploys in a few minutes.
- **Rollback:** on GitHub, open the last good commit and **Revert** the bad one through a PR (or `git revert <bad-sha>` and push). The workflow redeploys the reverted code. You can also re-run an older successful `Pages` workflow run from the Actions tab to republish that build.
- **Custom domain:** Settings → Pages → Custom domain, then add the DNS records GitHub shows. With a custom domain at the root, `configure-pages` reports an empty base path and the workflow builds with `/` automatically, so no code changes are needed. Turn on **Enforce HTTPS**.
- **Save compatibility:** saves are versioned (`SAVE_VERSION` in `src/config/versions.ts`). Every load passes through `sanitizeSave` + `migrate` (`src/save/schema.ts`), so old or corrupted saves are repaired rather than crashing. If you change the save shape, bump `SAVE_VERSION` and add a migration. If you change level generation, bump `GENERATOR_VERSION`: best times and Infinite seed history are keyed by it, so old records are never compared with different layouts (older seeds show an "old version" tag). Saves live per **origin**, so moving to a custom domain starts players with an empty save unless they use **Settings → Export Save** and then **Import Save**.

## 7. Browser compatibility & what was tested

| Target | Status |
|---|---|
| Chromium (Chrome / Edge engine), desktop 1280×800 | **Tested** automatically: headless Chromium 141 locally and Playwright Chromium on GitHub's ubuntu runner. |
| Chromium on an emulated Pixel 7 (portrait, touch) | **Tested** (emulation: viewport, DPR, touch events). |
| Short landscape phones (667×375, 844×390, 863×360) | **Tested** for layout: menu fits, HUD and touch controls reachable. |
| Firefox desktop | **Not tested.** Uses only standard APIs (WebGL/Canvas, Pointer Events, IndexedDB, Web Audio, Web Animations). |
| Safari desktop / iOS Safari | **Not tested.** Watch for audio unlock, `visualViewport` sizing and IndexedDB in private mode (falls back to localStorage, then memory with a warning). |
| Real Android / iOS devices | **Not tested.** Please check on at least one of each before release. |
| Microsoft Edge | Not tested separately (same engine as Chrome). |

**Automated checks that pass** (local and in CI):

- `npm run typecheck`: clean.
- `npm test`: 44 unit tests. Physics, simulation (sprint/stamina, fish, stash, enemies), generation (**all 800 Adventure levels generated and validated at real collider sizes**, Daily 40, Infinite seeds), economy (idempotent grants, atomic chest purchases, duplicate-Hood conversion), quests, save sanitize/export/import/erase, usernames, Ranked helpers.
- `npm run validate:content`: catalog counts, all referenced art present, spot-checked levels, legal pages, notices and secret scan.
- `npm run test:e2e`: 11 smoke tests × 2 device profiles (desktop, phone) against the **production build on the `/Slippery-Fish/` sub-path**: zero console errors and zero failed requests on boot; all 12 menu buttons in view (including short landscape); Adventure level 1 played with the HUD (BEST/TIME, LEVEL, stamina), pause and leave; every hanging sign opens/closes; deep link + refresh; invalid seed message; honest unavailable ads/Ranked; username persists across reload; legal pages served; full-motion sign drop; tab switch auto-pauses; **two-thumb touch** (joystick + held sprint simultaneously drains stamina).

**Checklist status:**

- Keyboard + mouse and joystick + simultaneous sprint: tested.
- Scaling, safe areas, portrait/landscape: tested in emulation.
- Audio gesture unlock: implemented, not verified by ear.
- Tab switching: auto-pauses, clears held keys and flushes the save; tested.
- Refresh: tested.
- Storage failure: falls back IndexedDB → localStorage → memory, with an on-screen warning when progress can't be saved; the memory fallback is unit-tested.
- Blocked ads / offline services: unavailable states tested.
- Long runs: not soak-tested.

**Size and performance** (production build):

- First load is about 2.9 MB over 32 requests. JavaScript is 1.7 MB uncompressed, about 445 KB gzipped (Pages serves gzip): Phaser 343 KB + game 102 KB. The six core atlases are about 1.1 MB WebP. The nature and town atlases load only when a region needs them. Boot to menu took about 4 s on a software-rendered headless browser.
- Main-thread JavaScript is about **1 ms per frame** on the menu and in gameplay (Chrome DevTools Protocol metrics). The test machines have **no GPU**, so they render through SwiftShader at only about 5–6 fps; that number reflects software rendering, not the game. **Real-device frame pacing is unverified**: check on a mid-range phone. If it struggles, **Settings → Graphics → Quality: Low** caps the canvas resolution.

## 8. Optional services

**None are connected; only adapters exist.** Full details, contracts and step-by-step integration: **[SERVICES.md](SERVICES.md)**.

| Service | State in this build | Owner setup still needed |
|---|---|---|
| Rewarded ads (Failure Continue, Free Chest, Fishing) | Adapter only. Buttons are disabled with "Rewarded ads are not connected in this version of Slippery Fish yet." No reward is ever granted without a verified reward event. | Choose a provider/portal, publisher account, domain approval, 3 rewarded placements, consent (CMP) if required, `ads.txt` at a domain root if required (not possible on a `github.io` project path), server-side reward verification. |
| Accounts / sign-in | Local guest only. | Identity provider (OAuth/OIDC with PKCE), allowed origins/redirects, server-side account deletion. |
| Cloud save | Off. Export/Import Save is offered. | Backend API + validation + conflict rules. |
| Online Ranked | Unavailable. Offline Practice (no opponent, no rewards) is available. | A WebSocket game server that re-simulates input logs; hosting outside GitHub Pages. |
| Real-money purchases | Disabled. Catalog shown as Unavailable. | Payment provider + server checkout + webhook-verified entitlements + restore; a host whose terms allow commerce; updated Terms. |
| Promotions | None. | Optional HTTPS JSON file (`VITE_REMOTE_CONFIG_URL`). |

Configuration lives in `src/config/services.ts`, filled from `VITE_*` build variables (template: `.env.example`). Everything there is **public**. Secrets belong on a server, never in the repo or in `VITE_*` variables. To set variables for the deployed build, add them as **repository variables** (Settings → Secrets and variables → Actions → Variables) and pass them in the workflow's build step `env:`.

## 9. Privacy, Terms and the data audit

### Web data audit

| Data / behavior | Where | Basis |
|---|---|---|
| Game progress, settings, username, profile icon | Player's own browser only (IndexedDB → localStorage → memory) | **Verified from project:** no network calls send it anywhere. |
| Network requests made by the game | Only same-origin files (JS, CSS, fonts, atlases, legal pages). Optional `VITE_REMOTE_CONFIG_URL` fetch only when configured (it isn't). | **Verified:** e2e test records every request; fonts are bundled (no Google Fonts calls). |
| Analytics, ads, crash reporting, trackers, cookies | None | **Verified from project:** no such SDKs in `package.json` or source; the game sets no cookies. |
| Hosting logs (IP address, user agent, time) | GitHub Pages servers | **Must be confirmed in GitHub's documentation/privacy statement.** The draft policy points to the host's statement. |

### Privacy Policy & Terms drafts

- Drafts: `public/legal/privacy-policy.html`, `terms-of-use.html`, `data-deletion.html`, `support.html`; generated `third-party-notices.html` (rebuild with `node scripts/gen-notices.mjs` after dependency changes; the build fails if it's stale).
- They describe **only what this build actually does**. They show a "DRAFT — NOT FOR RELEASE" banner, and the in-game **Settings → Privacy & Legal** screen shows a draft banner until real URLs are configured.
- When published, the pages live at `https://meerq1.github.io/Slippery-Fish/legal/privacy-policy.html` (and so on): stable HTTPS URLs on the same site. To use pages hosted elsewhere, set `VITE_PRIVACY_POLICY_URL`, `VITE_TERMS_URL`, `VITE_SUPPORT_URL`, `VITE_ACCOUNT_DELETION_URL` (and optionally `VITE_PUBLISHER_WEBSITE_URL`). The in-game links switch automatically and the draft banner disappears.
- **Have both reviewed by a qualified professional** for every country where you offer the game. They are not legal advice.

### INFORMATION I STILL NEED FROM YOU

These are the placeholders in the drafts; nothing was invented:

1. `[PUBLISHER LEGAL NAME]`
2. `[MAILING ADDRESS]`
3. `[CONTACT EMAIL]` (privacy) and `[SUPPORT EMAIL]`
4. Publisher website (optional)
5. `[GOVERNING LAW AND JURISDICTION]`, plus region-specific rights / supervisory-authority wording if required
6. Target audience and minimum age: `[CHILDREN'S PRIVACY STATEMENT]`, `[AGE / PARENTAL CONSENT REQUIREMENTS]` (decide whether the game is directed at children and which rules apply, e.g. COPPA, GDPR-K / UK AADC)
7. `[HOSTING PROVIDER]` and `[HOST PRIVACY STATEMENT URL]` (GitHub Pages unless you move)
8. `[EFFECTIVE DATE]`, `[RESPONSE TIME]` for requests
9. Limitation of liability and consumer-rights clauses for your jurisdiction
10. Anything about services you later enable (ads provider, sign-in, cloud save, Ranked server, payments). Each changes both documents.

## 10. Third-party inventory

| Component | Purpose | Runs where | License / notice | Data collection | Config path | Status |
|---|---|---|---|---|---|---|
| Phaser 4.2.1 | Rendering, scenes, textures | Client (bundled) | MIT; notice in `public/legal/third-party-notices.html` | None | `package.json` | Active |
| @fontsource/fredoka 5.3.0 | UI font (self-hosted) | Client (bundled) | SIL OFL 1.1; notice included | None (no Google Fonts requests) | `src/main.ts` | Active |
| @fontsource/luckiest-guy 5.3.0 | Title font (self-hosted) | Client (bundled) | Apache-2.0; notice included | None | `src/main.ts` | Active |
| GitHub Pages | Static hosting | Server (GitHub) | GitHub Terms | Server logs (see GitHub's privacy statement) | `.github/workflows/pages.yml` | Ready; not yet enabled |
| GitHub Actions + official actions | CI/CD | GitHub | — | — | `.github/workflows/pages.yml` | Active on PRs |
| Vite, TypeScript, Vitest, Playwright | Build and test tools | Developer machine / CI only (not shipped) | MIT / Apache-2.0 | — | `package.json` devDependencies | Active (dev only) |
| Python + numpy/scipy/OpenCV/Pillow | Asset extraction | Developer machine only | BSD / Apache-2.0 / HPND | — | `scripts/extract_assets.py` | Dev only |
| Rewarded ads, sign-in, cloud save, Ranked server, payments, remote config | Optional | — | — | — | `src/config/services.ts`, `src/services/*` | **Planned adapters only; not integrated, no SDKs included** |

## 11. Release blockers

### For public play of this free, offline build

| Blocker | Why it blocks | What to do |
|---|---|---|
| **Deployment not performed** | No public URL yet. | Merge the PR, then Settings → Pages → Source: GitHub Actions (section 5), then run the live checks. |
| **Legal/publisher information missing** | The Privacy Policy and Terms contain placeholders and are unreviewed. | Provide the [information above](#information-i-still-need-from-you), have the drafts reviewed, then publish. |
| **Real-device testing not done** | Only Chromium (desktop + emulated phone) was tested; frame pacing was measured only under software rendering. | Test on at least one iPhone (Safari) and one Android (Chrome), plus Firefox and Safari desktop. Check smoothness, audio and touch. |

Not blockers, but worth knowing:

- No music is bundled (30 empty slots; the game is quiet apart from synthesized SFX).
- Polar Bear, trophy and all 200 Hood images are procedural placeholders. See [ASSETS.md](ASSETS.md#substitutions-and-placeholders). They're functional and in-style, but replace them if final art is wanted.

### Before enabling online or monetized features

None of these features can be switched on safely yet:

- No backend exists for Ranked, accounts, cloud save, reward verification or payment fulfillment.
- No ad or payment provider is selected, configured or approved.
- No consent management (required only once a data-collecting provider is added).
- No server-side account deletion (needed as soon as accounts exist).
- GitHub Pages' terms restrict commercial use, so you may need a different host for ads or payments.
- Ranked needs cross-engine determinism verification for server re-simulation.

## 12. Feature matrix

| Requirement | Implemented behavior | Verification | Remaining |
|---|---|---|---|
| Physical fish dribbling (never pickups) | Fish are physics bodies: bumped, kicked, bank shots, friction spin; scored by entering the stash | Unit tests (sim/physics); e2e plays level 1; bot wins level 1 | — |
| Controls: WASD + held Left Shift; joystick + held sprint | Keyboard and Pointer-Events touch controls; both thumbs at once; side swap option | e2e (keyboard; two-thumb touch) | Real-device touch check |
| Stamina (NORMAL / SPRINTING / LOW / EMPTY) | Drain, delayed regen, exhausted lockout; meter states and sounds | Unit tests; e2e checks drain while sprinting | — |
| Enemies: polar bear, arctic wolf, seal + red proximity vignette | Distinct AIs (heavy chaser, fast interceptor, dashing seal), flow-field navigation, munch | Unit tests | Polar bear art is a placeholder |
| HUD: BEST / TIME / SEED top-left, LEVEL top-right | As specified, plus fish tracker and pause | e2e | — |
| **Adventure: 800 levels, 16 regions × 50** | Deterministic shared levels; tutorial levels 1–8; difficulty ramps; Hard Mode | **All 800 generated and validated** in unit tests (0 fallbacks) | — |
| **Daily: 40 levels/day, 8 Popsicles, rewards shown in advance, UTC reset** | Same set for everyone; milestone rewards every 5 levels (incl. chest, Hood, strongest at #8); live countdown; Hard Mode | Unit tests (40 valid, deterministic); validator; e2e deep link | — |
| Infinite: seeded, reproducible, rising difficulty | Seed codes (e.g. `FR0ST-8K2M`) incl. level; ENTER SEED / PREVIOUS SEEDS / PLAY / HARD MODE / BACK | Unit tests (round-trip, validity far past ceiling); e2e invalid seed | — |
| Ranked: best of 3, same seed, normalized stats, "OUTMATCHED" | Rules, normalization and screens implemented; honest "unavailable"; offline Practice | e2e (unavailable state); unit tests (helpers, normalization) | **Server required** for real matches |
| Failure screen: exactly 4 options | Ad continue (disabled with reason), 800-Icicle continue (shows your balance), Restart, Leave | Screenshot check with a forced loss on level 6 | — |
| Victory: falling trophy, paper Excellence Stars 1–5 | Implemented with confetti/new-best | Manual screenshots | Trophy art is a placeholder |
| Currencies: Icicles / Icicle Shards / Fish (≠ DribbleFish) | Idempotent wallet; animated counters | Unit tests | — |
| **Username + exactly 30 profile icons** | Validation, local-only notice; 30 distinct icons | Validator (count = 30); e2e (persistence) | — |
| Choose Your Waddle | 10 species + 10 Signature Waddles; buy with Icicles, equip | Manual screenshots | — |
| **200 Hoods, 10 rarities × 20, 20 power families** | Data-driven scaling; cosmetic-only in Ranked; buy with Shards | Validator + unit tests | Hood art is procedural |
| Quests: tutorial / daily / weekly / monthly | 8 tutorial + rotating 3/3/3 by UTC period; claim stamps | Unit tests | — |
| Chests: 5 tiers (25/100/225/400/625 Fish) + ad chest (30-min cooldown) | Seeded atomic rolls, duplicate → Shards, dramatic opening scaled by tier | Unit tests; validator | Ad chest needs a provider; 2 chest arts substituted |
| Fishing (Watch Ads) screen | Never auto-plays an ad; honest availability; reward only on verified event | e2e | Provider |
| Store with CHA-CHING | Crumpled-dollar animation + sound; earned-currency trading post; real money disabled | Manual screenshots | Payments (optional) |
| Hanging signs (Quests/Hoods/Profile/Settings/Purchases/Chests) | Chains, drop, overshoot, swing, settle, then content | e2e (all open/close; full-motion) | — |
| Object buttons: hover expands, press squash, contextual sounds | Spring physics per button personality; keyboard/touch equivalents | Manual | — |
| Main menu (Batch 5 scene + igloo), single logo | As specified; responsive incl. short landscape | e2e (all 12 buttons in view) | — |
| **Asset extraction** | 432 frames from 13 supplied sheets; documented substitutions; Batch 9 missing | Validator; [ASSETS.md](ASSETS.md) | Optional final art |
| **Music slots** | 30 slots in one manifest, all empty (`null`), honest | Validator note | Add licensed tracks |
| **Saves** | Versioned, sanitized, migrated; IndexedDB → localStorage → memory; export/import/erase; idempotent transactions | Unit tests; e2e persistence | Cloud save (optional) |
| Settings incl. Privacy & Legal | Audio, controls, accessibility, graphics, save & account, legal hub with document viewer | e2e (open/close; legal pages) | — |
| Legal drafts | Privacy, Terms, data deletion, support, third-party notices | e2e; validator | Publisher info + review |
| GitHub Actions / Pages | Workflow verified green on PR | CI | Owner enables Pages; first deploy |

## 13. Optional next work

1. Commission or add final art for the Polar Bear, trophy, Hoods and the two extra chests (paths in [ASSETS.md](ASSETS.md)).
2. Add licensed music to the 30 slots in `src/config/audio.ts`.
3. Test on real devices and in Firefox and Safari, and tune `CAMERA`/HUD sizes if needed.
4. If you want online features: follow [SERVICES.md](SERVICES.md) one service at a time, starting with the backend, then update the Privacy Policy and Terms before enabling anything.
5. An offline/PWA mode was deliberately **not** added; it would need a versioned service worker and update testing.
