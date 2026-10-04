# Progression update: what changed and how it works

This is the handoff for the "Brand, living menus, gameplay & progression overhaul". The owner-facing build and deployment guide is still [HANDOFF.md](HANDOFF.md). The economy details are in [ECONOMY.md](ECONOMY.md). Screenshots are in [`docs/screenshots/`](screenshots/).

References actually inspected: both supplied images (the populated landscape main menu and the tester's notes), and frames extracted with ffmpeg from both videos. In the startup video that is the publisher mark, the contextual loading art and the transition into the menu. In the Adventure video that is a horizontally scrolling map with region-specific terrain, a winding path of numbered nodes, a region name banner and a prominent PLAY button. No characters, logos, music, interface assets, annotations or messaging UI from the references were copied.

---

## 1. What changed for the player

| Area | Before | Now |
|---|---|---|
| Startup | Plain spinner page | **Inverse Smiles** publisher mark, then a personalized loading scene with real progress and your profile card |
| Main menu | 12 equal-weight buttons | A **living menu world**: a dominant CONTINUE / PLAY action, live info on each mode, real next-action notes, your penguin (with Hood) beside the igloo, the **pet goldfish's tank** in the scene, quieter utilities |
| Seasons & time of day | Always winter, always day | **Spring / Summer / Autumn / Winter** menu presets chosen by the calendar, and **dawn / day / dusk / night** lighting from your local clock (menus only) |
| Goal | A well-like stash that was easy to hit | An **igloo with penguin chicks** behind **partial snow-capped fences**. Fish must go in through an opening, and **≥ 70% of the fish** must be inside the yard. |
| Levels | Rectangles with props | Arena shapes (coves, bays, L-rooms, islands, hourglass, twin rooms), goal opening patterns, and **level twists** (modifiers) with clear indicators |
| Adventure | A grid of 50 buttons per region | A **roadmap**: a winding trail across 16 region landscapes, milestone and region **chests** on the route, a current-location marker, and Continue |
| Hoods | Epic in minutes | **Economy v2**: Epic takes about a week of regular play (see ECONOMY.md); everything you already own is kept |
| Profile | Name + icon | **18 earned titles** with criteria and progress; equip one or none |
| Tutorial | Hints on levels 1–8 | Plus an optional, replayable **Training Rink** (7 hands-on lessons and 3 short explainers) |
| Feel | — | Enemy **expressions** (alert / eager / imminent), ice **skid trails**, fish streaks, weather that follows the camera, a **themed sprint button**, species voices, and an original **synthesized theme tune** |

## 2. The 70% rule and the igloo goal

Code: `src/gameplay/goal.ts`, `src/gameplay/sim.ts` (`checkScoring`, `commitScore`), `src/gameplay/arena.ts` (`goalColliders`). Settings: `GOAL` in `src/config/gameplay.ts`.

- **Footprint:** the fish's **collider disk** (radius 12 / 15 / 17 / 21 by variant), never sprite padding.
- **Interior:** a disk of radius 64 u centred in the courtyard in front of the igloo door.
- **Contained fraction:** the exact circle–circle intersection area divided by the fish's area. It falls steadily as the fish moves away from the centre, so each radius gets a precomputed threshold centre distance (bisection on the exact formula, rounded to 1e-4 u). A fish scores when its centre distance ≤ the threshold. Approximate thresholds: r12 → 59.8 u, r15 → 58.7 u, r17 → 57.9 u, r21 → 56.2 u. The fraction is configurable: `GOAL.scoreFraction = 0.7`.
- **Broad phase:** only fish inside the 84 u fence ring are tested.
- **Fast fish:** a swept check also tests the segment from the previous position to the current one against the threshold circle, so a fish can't skip through the yard between frames.
- **Fences and closed sides:** fenced segments and the igloo's front wall are real capsule colliders that block fish and penguins. Enemies are additionally kept out of the yard by an enemy-only disk. **Entry validation** records the ring sector where a fish crossed in. A crossing through a solid sector (only possible in a solver edge case) blocks scoring until the fish leaves the ring again.
- **Openings:** the ring has 24 segments. The igloo always closes 8 of them (the back). Openings are at least **5 segments** wide (about 88 u clear, wider than the largest fish plus control room). Intro levels are fully open; later levels use wide, double, single or side gates. Every generated goal is checked for legality.
- **Exactly once:** when a fish scores it leaves gameplay at once (body removed, enemy targets cleared, no longer exposed), one `fishScored` event fires, and victory fires once. The slide-into-the-igloo animation is presentation only.
- **Same-step race:** scoring is resolved **before** enemy eating in each step, so a fish that scores and is caught in the same step counts as scored.
- **Feedback:** a pop and glow, chick cheers and a heart, a "+1" or **"BANK SHOT!"** popup, a gate chime and chick cheeps, and a progress plaque on the igloo.

Tested in `tests/unit/goal.test.ts`: just below, at and above 70%; rim contact; a fenced side bounces; straight and angled entry through an opening; a fast crossing commits exactly once; invalid entry; several fish in one step; score-versus-eat ordering; targeting cleared; bank shots; goal legality across levels 1–800.

## 3. Level identity and twists

- Arena shapes: `src/procedural/shapes.ts`. Carved areas are unions of convex polygons, and the snowbank art draws exactly those polygons with volume and a drop shadow, so the **visible edge is the collision edge**.
- Generator v2 (`src/procedural/generator.ts`) places goal patterns, gates, spawns and enemy distances. `CONTENT_VERSION` and `GENERATOR_VERSION` are now 2, so best times recorded under v1 layouts are never compared with v2.
- Level twists (`src/gameplay/levelModifiers.ts`): Glazed Ice, Featherweight Fish, Short of Breath, Hungry Hunters and Lucky Catch. They have real physics or AI effects and appear as a pre-level card, HUD chips and a pause-screen list (plus a glossy floor sheen for Glazed Ice). Some pairs are excluded from combining. The Icicle bonus is **capped at +25%**. Twists never apply in Ranked or Practice, and the first 30 Adventure levels and each region's first 3 levels have none.

## 4. Startup: Inverse Smiles and the loading scene

All in `index.html` (inline, so it paints before the JS bundle), orchestrated by `src/main.ts`.

- **Brand:** a sad face's mouth flips into a smile (with a little overshoot), a hat drops on with squash and bounce, then the **INVERSE SMILES** wordmark ("turning frowns upside down") appears. It runs about 2.1 s, about 0.9 s on a reload in the same browser session, and as a 0.65 s static composite with reduced motion. **Tap or press a key** to skip. That tap counts as a real user gesture, so a short original chime plays then. The chime never autoplays without a gesture, and the animation is clear without sound.
- **Concurrent loading:** the save, fonts and core art load **while** the brand plays. If everything is ready when the brand ends, the game goes straight to the menu. Otherwise the loading scene shows **real** progress (labels plus a bar that never moves backwards). There are no invented waits.
- **Personal card:** shows username, icon colours, character name and portrait, Adventure level and region, progress across the 800 levels, and equipped title. It reads a tiny versioned **display-only** summary (`localStorage["slipperyfish.profileSummary"]`, `src/profile/summaryCache.ts`) before anything else loads. Missing or stale data shows a guest card ("Welcome, new waddler!"). The card is reconciled from the real save as soon as it loads, and the summary is rewritten whenever identity, progress or title changes. It is **never** used for rewards, ownership, payments or Ranked.
- **Errors:** if art fails to download, an honest message with **TRY AGAIN** (your progress is safe).
- The loading scene uses the current menu season and lighting (night stays readable).

## 5. Living menu, seasons and day/night

- Layout: `src/ui/screens/MainMenuScreen.ts`, `src/ui/living.css`. Badges appear only for real actionable states: claimable quests, chests in the inventory, a route chest ready. There are no startup promotions. Phones get a regrouped layout.
- **Season rule** (`src/config/menuTheme.ts`, configurable `SEASON_CALENDAR`): Northern Hemisphere meteorological seasons by browser-local date. **Spring from Mar 1, Summer from Jun 1, Autumn from Sep 1, Winter from Dec 1.** The hemisphere is never inferred from the timezone. Settings → **Menu theme** lets you pin a season. The dev build (or `?themePreview` on any build) shows a preview bar for all 4 × 4 combinations.
- **Lighting rule:** browser-local clock. **Night 20:00–05:00, dawn 05:00–08:00, day 08:00–17:00, dusk 17:00–20:00** (so 3 AM is night). Settings can pin it. It is re-evaluated when the page resumes and every 5 minutes, with a crossfade that never closes an open submenu. It is visual only: never used for rewards, quest periods, the pet's economic day or Ranked.
- **What a preset changes:** sky, fields, thawed slopes, trees and props, the foreground bank, ambient particles (snow, petals, fireflies or sparkles, leaves), aurora and stars, the warm igloo doorway glow at night, and UI material accents. The same rules are mirrored in `index.html` for the loading scene, and a unit test checks they match.
- **Scope:** levels, the Adventure map and seeded generation never read the menu theme. A unit test scans gameplay, generation and level code for any reference. The sprint button's theme comes from the **level's** region, not the season.

## 6. Adventure roadmap

`src/ui/screens/AdventureScreen.ts`, `src/progression/roadmap.ts`.

- A horizontally scrolling world, with one panel per 50-level region: its own sky, hills, floor texture, landmarks from that region's own decoration art (kept clear of the trail and nodes), a region gate signpost and weather. The sky, ground and hills blend into the next region over the last 520 px. Only the regions near the viewport are mounted.
- Node states: done (stars), current (pulsing, with your penguin and "YOU ARE HERE"), open, locked. **The first tap selects** a node and shows its stars, best time and level twists. **PLAY** (or a second tap on a node you selected) starts it, so there are no accidental launches. Keyboard: ←/→ moves the selection, PageUp/PageDown jumps 10, Home goes to your level, Enter plays. Mouse drag and wheel scroll the map; touch pans natively. "↩ Back to my level" appears when your level is off-screen. The scroll position and selection are restored when you return.
- Chests: a **Milestone Chest** after every 10th level and a **Region Treasure** after every 50th. Tap one to see exactly what it holds. Each is locked until its level is cleared in normal mode, then opens **exactly once**: one wallet transaction plus a persisted claimed list, so replays, reopening the map, double taps and reloads never pay twice.

## 7. Earned titles

Config: `src/config/titles.ts`. Logic: `src/progression/titles.ts`. Shown in Profile, on the identity plaque and on the loading card. "No title" is always available. Titles grant no stats or currency.

| Title | Criterion |
|---|---|
| Fresh Flippers | Clear your first Adventure level |
| Fish Courier | Clear 25 different Adventure levels |
| Igloo Regular | Clear 100 different Adventure levels |
| Tundra Trailblazer | Clear 300 different Adventure levels |
| Warden of Classic Winter | Complete the first region (Adventure level 50) |
| Four-Region Rover | Complete 4 regions |
| Halfway to the Horizon | Complete 8 regions |
| Grand Tour Penguin | Complete all 16 regions |
| Star Collector | 150 Excellence Stars in Adventure |
| Five-Star Fusspot | 5 stars on 25 different Adventure levels |
| Bank Shot Artist | 25 bank shots |
| The Untouchable | Clear 20 levels with predators without losing a fish |
| Hood Hoarder | Own 20 Hoods |
| Goldfish Best Friend | Feed the goldfish on 7 different days |
| Popsicle Devotee | Open all 8 Daily Popsicles in one day |
| Chick Feeder Supreme | Stash 1,000 fish |
| Speed Skater | Clear Adventure level ≥ 30 in under 20 s with **default rules** |
| Blizzard Blitz | Clear a Hard Mode Adventure level with 4+ fish in under 45 s with **default rules** |

- **Default rules** means no gameplay-stat Hood (economy-only Hoods are fine), no continue, never paused and no level twist.
- Titles are evaluated only from committed results and claims.
- Existing saves are **backfilled** from reliable counters (stars, regions, owned Hoods). Timed titles are **never backfilled**, because old best times didn't record those conditions. Counters added in this update (bank shots, clean predator clears, full Popsicle days) start at 0.
- Missing or unknown title ids are dropped, and the first unlock time is kept.

## 8. Pet goldfish

Config: `src/config/pet.ts`. Rules: `src/pet/petService.ts`. Art and routines: `src/pet/habitat.ts`, `routines.ts`, `icons.ts`. UI: the menu tank and the **GOLDFISH** sign.

- **Feeding** costs **FishCurrency** (never DribbleFish): **1 Fish at the base tier**, once per **economic day**. The economic day is the **UTC date**, the same identifier as the Daily Challenge and daily quests.
- **States:**

  | State | Meaning |
  |---|---|
  | not fed | Nothing fed yet this economic day |
  | feeding committed | The Fish is paid; UI-only while the eating animation plays |
  | fed — benefit available | The day's Shards are ready to collect |
  | benefit granted | The Shards were collected |

  Payment and reward never wait on the animation. A paid but uncollected day stays collectable later. A day you didn't feed pays nothing.
- **Idempotent:** the fed day, cost and benefit are recorded inside the same transaction (and the transaction id includes the day). Repeat clicks, reloads and day rollover can't pay or charge twice. A **second tab** is blocked by the one-tab guard (§10).
- **Upgrade order:** the tier at the moment you **feed** locks that day's cost and Shards. Upgrading after feeding applies from the next day, with no surprise charge. Upgrading before feeding means the Feed button shows the new cost.
- **No pressure:** there is no debt, no automatic spending, and the fish can never be harmed or removed. Missing a day simply earns nothing for that day. The tank shows a friendly "snack time?" bubble.
- **Tiers:** 1 / 2 / 3 / 4 / 5 Fish per day → 4 / 9 / 14 / 19 / 24 Shards, with upgrades costing 4k / 10k / 20k / 40k Icicles. Payback and the "is it worth it" analysis are in [ECONOMY.md §4](ECONOMY.md#4-pet-goldfish-economics).
- **Presets:**

  | Category | Free | Paid (Icicles) |
  |---|---|---|
  | Fish looks | Classic Orange, Sunrise Calico, Lemon Drop | Koi Splash, Midnight Comet (900); Bubblegum Shubunkin, Tiger Tail (1,200); Aurora Shimmer (2,400) |
  | Tanks | Classic Fishbowl, Igloo Aquarium | Coral Reef Tank (1,500), Sweet Shop Jar (2,000), Moonlit Lagoon (2,500) |
  | Decorations (show 2) | Kelp Garden, Tiny Snow Castle | Pearl Shell, Sunken Sled, Snowfish Statue, Ice Arch, Treasure Chest (600–1,200) |
  | Foods | Classic Flakes, Krill Pellets | Sweetheart Bites, Starlight Sprinkles (400–600) |

  Every food has the **same** feeding effect and cost; only the look changes. Unowned presets can be previewed in the tank before buying.
- **Routines** follow the **real local clock**, even if the menu lighting is pinned:

  | Band | Hours | Pool |
  |---|---|---|
  | morning | 05–11 | shower, brushing teeth, stretches, laps |
  | day | 11–17 | laps, ball, exploring, chasing bubbles |
  | evening | 17–21 | relaxing, a tiny book, *Fishflex* on a tiny TV, lamp-gazing |
  | night | 21–05 | Fishflex, dozing on a mini couch, sleeping |

  Picks are weighted, never repeat back-to-back, and last 10–60 s. A band change never interrupts the current routine; the page re-evaluates the band on resume. Feeding temporarily overrides the routine.
- **Night:** dark water plus a warm lamp above the tank.
- **Performance:** a single 2D canvas loop that runs only while the tank is on screen and the tab is visible. It drops to about 30 fps on Low quality and slows under reduced motion. There is no second physics world, and nothing runs behind gameplay. Cosmetic randomness never touches rewards or seeds.

## 9. Quests and the Training Rink

- **Periods** (`src/quests/quests.ts`): **daily resets at 00:00 UTC, weekly on Monday 00:00 UTC (ISO week), monthly on the 1st at 00:00 UTC.** These are shown with countdowns on the Quests sign. Progress is keyed by period id, so it resets correctly and claims persist. Unknown or retired quest ids in older saves are ignored, and new tutorial quests appear automatically. As stated in the game, a local browser game can't guarantee protection against clock tampering.
- **New objectives:** bank shots (daily, weekly and tutorial), feeding the goldfish, opening a route chest, plus the existing natural-play objectives. Events count only from committed game results: bank shots count only on a won level, so you can't farm them by quitting. Rewards were rebalanced (ECONOMY.md).
- **Training Rink** (`src/levels/training.ts`, Settings → Training Rink, Quests sign, or the "New here?" note on the menu): optional, replayable and skippable.
  - Lessons on real handcrafted arenas: Waddle, Sprint & stamina, Dribbling, The igloo yard & the 70% rule, Momentum, Bank shots, Predators.
  - Explainers that link to the real screen: Excellence Stars, Hoods, Route rewards.
  - Lessons pay no currency. Hints sit at the bottom of the screen (or the top on touch) so they don't cover the joystick, sprint button, fish or goal.

## 10. One active tab

`src/core/tabGuard.ts`. Only one tab owns the save: it uses a Web Locks lock, or a BroadcastChannel handshake as a fallback. A second tab shows **"Slippery Fish is open in another tab — PLAY HERE INSTEAD"**. Taking over makes the first tab save, go **read-only** and show "Continued in another tab". The new tab then re-reads the save. This prevents two tabs from both feeding the pet or both claiming a chest from stale copies. If a browser has neither API there is no guard (a known limitation); per-transaction idempotency still applies inside each tab.

## 11. Feel, audio and visuals

- **Enemy expressions** (`updateExpression` in `src/scenes/GameScene.ts`, bands in `ENEMY_EXPRESSION`): measured from the enemy to **the fish it is targeting**, or else the nearest exposed fish.

  | State | Distance |
  |---|---|
  | alert | ≤ 520 u |
  | eager | ≤ 260 u |
  | imminent | ≤ 110 u |

  Escalation is immediate. Calming down needs the distance to exceed the band by 50 u and the current state to have been held for 0.35 s, so faces don't flicker. The bubble emote stays upright while the body rotates. When an enemy turns eager it voices its species (bear growl, wolf yip, seal bark), with a cooldown. Expressions are display only; the AI never reads them.
- **Trails:** ice skid marks on hard turns or braking (with a skid sound), streaks behind fast fish, and sprint puffs. All pooled and capped, and off under reduced motion.
- **Weather** stays in world space but wraps around the **current camera view**, so it keeps filling the screen while the camera follows you.
- **Sprint button:** the material (ring, garnish) follows the level's theme. The ⚡ icon, the label, the 112 px size and the hit area are identical everywhere.
- **Hood previews** are framed from the penguin **and** Hood bounds (the same anchor as in-game, plus room for the wiggle animation), so tall Hoods are never clipped.
- **Environment:** carved snowbanks have a lit top, a front face and a drop shadow. The floor uses a second, offset tile layer to break up visible repetition. The goal art (posts, rails, courtyard, chicks) is procedural, drawn in the established outline style.
- **Theme tune** (`src/audio/themeTune.ts`): an **original** 8-bar loop in C major (I–vi–IV–V, 108 BPM) whose melody "slips" between distant notes, synthesized live with Web Audio (no recordings). Arrangements: *theme* (menus and signs), *map* (Adventure), *calm* (Daily, Infinite, Fishing, Ranked). Levels stay quiet until recorded tracks are added. It respects music on/off, volume and tab suspension. No professional recording exists; recorded tracks can still be dropped into `src/config/audio.ts`.
- **Cover / key art:** `public/cover.png` (1200×630) is composed from the game's own art by `scripts/make-cover.mjs` and used for `og:image` / `twitter:image`. The supplied logo is kept as the canonical title art at native size, with no upscaling.

## 12. Tests and checks run

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **99 unit tests in 8 files**: goal/70% rule (17), economy simulation targets (8), progression rules (17: migration, roadmap claims, pet states/races/rollover/upgrade order, trade limits, titles), presentation (9: seasons/day-night incl. inline copy, scope rule, routines, Training Rink), generator (15 incl. all 800 Adventure levels validated), sim, physics, economy |
| `npm run validate:content` | passes. New checks: chest odds sum to 100%, every exchange is limited, base pet feed costs exactly 1, pet returns stay below the shop price, title ids are unique. |
| `BASE_PATH=/Slippery-Fish/ npm run build` | passes |
| `npm run test:e2e` | **28 passed, 2 skipped** (desktop and Pixel 7 emulation, against the production build on the sub-path). New tests: brand first paint and cached card, roadmap select-before-launch and locked chest preview, one-tab takeover, Training Rink, the goldfish sign, and "no menu layer above an open sign". The two skips are profile-specific (touch-only and desktop-only). |
| Manual browser checks (screenshots in `docs/screenshots/`) | brand frames, loading card, all four seasons × lighting, night menu and pet, phone menu, roadmap region boundary, goal fences, level twist, profile titles, chest odds, Training Rink |

**Not verified:** real devices (iOS Safari, Android Chrome), Firefox and Safari desktop, audio by ear, and long soak sessions. The CI machines have no GPU (software rendering at about 5 fps), so real frame pacing is unmeasured.

## 13. Configuration paths

| What | Where |
|---|---|
| Goal / 70% | `GOAL` in `src/config/gameplay.ts` |
| Enemy expression bands | `ENEMY_EXPRESSION` in `src/config/gameplay.ts` |
| Level twists | `src/gameplay/levelModifiers.ts` |
| Economy | `src/config/economy.ts` (prices, curves, chest odds, exchanges, roadmap chests) |
| Popsicles | `dailyMilestoneRewards` in `src/progression/drivers.ts` |
| Quests | `src/quests/quests.ts` |
| Pet | `src/config/pet.ts` |
| Titles | `src/config/titles.ts` |
| Menu seasons / lighting | `src/config/menuTheme.ts` (mirrored in `index.html`) |
| Training Rink | `src/levels/training.ts` |
| Theme tune | `src/audio/themeTune.ts` |
| Music / SFX manifest | `src/config/audio.ts` |
| Save schema & migrations | `src/save/schema.ts` (`SAVE_VERSION` 2) |

## 14. Limitations and missing external assets

- Online services remain **not connected**: ads, accounts and cloud save, online Ranked, payments. The game still says so wherever they appear.
- No recorded music or voice: SFX and the theme are synthesized. Some art is procedural, clearly so: Hoods, goal posts, chicks, pet habitat, emotes, polar bear, trophy.
- "Clear local data" erases this device only; there is no server account. The loading summary is a display cache that is cleared with local data.
- Clock changes can affect local quest periods and the pet's day (a browser game can't prevent this). The game makes no anti-cheat claims.
- A fresh 5-minute Epic could not be reproduced exactly in the model under v1. The v1 curve was nonetheless far too fast (Epic in about 22 minutes for the model's skilled player, about 60 for its regular player), and the v2 targets are enforced by tests.
