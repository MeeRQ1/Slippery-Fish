# Economy v2 — Hood progression rebalance

Why: a tester reported getting an **Epic Hood in about five minutes**. This document records the audit, the new settings, the acquisition targets, and the simulation results that check them. All figures are **estimates** from a deterministic model of player behaviour, not measurements of real players.

- Settings: `src/config/economy.ts`, `src/config/pet.ts`, `src/quests/quests.ts`, `src/progression/drivers.ts` (Daily Popsicles), `src/progression/hoods.ts` (Hood strength curves)
- Simulation harness: `src/economy/simulate.ts`. It drives the **real** reward code: mode drivers, quest service, roadmap chests, pet care, limited exchanges and the idempotent wallet. It is not bundled into the game.
- Acceptance tests: `tests/unit/economySim.test.ts`, plus the rules tests in `tests/unit/progression.test.ts`

## 1. Audit of v1: why high rarities came too fast

| Source (v1) | Problem |
|---|---|
| Icicle → Shard exchange (1,200 Icicles → 40 Shards) | **No limit.** Icicles flow freely from levels, so this was effectively an unlimited Shard tap. It was the largest single cause. |
| Hood prices 20 / 45 / 90 / 160 / 260 / **420 (Epic)** … 2,200 | Too flat at the top. The fast early Shard income bought Epic within the first hour. |
| Shard Earnings / Quest Rewards Hood bonuses on the 110% → **1000%** curve | Compounding: a Shard-boosting Hood made the next Hood cheaper to reach. |
| Daily Popsicle 7 Hood from Shiny–**Epic** | A guaranteed early Epic path outside the shop (1 in 3 chance per day). |
| Chest rarity windows rolled **uniformly** (Tuna: Lost & Found → Epic, 25% Epic per Hood roll) | High-rarity drops were much likelier than the tier names suggested. |
| Duplicate Hoods → 50% of price in Shards; Popsicle duplicate → 100% | Converting duplicates paid too well. |
| Every-10th-level Shards granted silently on first clear | Front-loaded and invisible; now moved to visible roadmap chests. |

**Measured v1 results** use the same player models as below (v1 code checked out at `8a976ce` and run through the same loop; see §6). In a fresh 1-hour session, Epic was affordable after **≈22 minutes** (skilled), **≈60 minutes** (regular) and was not reached by a casual player (they got up to rarity 4). The model's skilled player is not the fastest possible human. Someone faster, using the unlimited exchange, plausibly reaches an Epic in roughly the reported five minutes. **We could not reproduce exactly five minutes in the model**, but the v1 curve was clearly too fast at every skill level.

## 2. New settings (v2)

**Hood prices** (Icicle Shards, ±10% per Hood). Prices never change Hoods already owned.

| Pollution | Human Trash | Lost & Found | Oooh Shiny | SPARKLING | **Epic** | Legendary | Glorious | Supreme | Food |
|---|---|---|---|---|---|---|---|---|---|
| 30 | 70 | 150 | 300 | 550 | **900** | 1,500 | 2,400 | 3,800 | 6,000 |

**Shard sources**

| Source | v2 amount | Notes |
|---|---|---|
| Tutorial quest line | 35 Shards before the "Equip a Hood" step, 20 after (55 total) | Exactly enough for one first Hood from the cheapest rarity |
| Daily quests (3 per UTC day) | 4–6 Shards, some +1 Fish | |
| Weekly quests (3 per ISO week) | 35–45 Shards + 4–8 Fish | Targets raised: stash 200 fish, clear 40 Adventure levels |
| Monthly quests (3 per UTC month) | 60–140 Shards + 10–20 Fish | Targets raised: stash 1,000 fish, earn 400 stars |
| Daily Popsicles | #2: 15 Shards + 2 Fish · #4: 30 Shards · #8: 60 Shards + 25 Fish + Mackerel Chest · #7: a Hood from **Human Trash – Oooh Shiny** | Popsicle 7 can no longer give an Epic |
| Adventure roadmap chests | Milestone chest every 10 levels: 120+15·region Icicles, 4 + ⌊region/3⌋ Shards, 2 Fish. Region Treasure every 50: 400+60·region Icicles, 20+2·region Shards, 8+⌊region/2⌋ Fish, plus a Treasure Chest | Finite: 1,008 Shards across the whole campaign. Claimed once each. |
| Limited exchange | 1,500 Icicles → 20 Shards (**1 per UTC day**); 5,000 Icicles → 80 Shards (**1 per UTC week**) | Was unlimited |
| Pet goldfish | 4–24 Shards per fed day, by care tier | See §4 |
| Chest duplicates | 25% of the Hood's price | Was 50% (100% for Popsicle duplicates) |

**Hood bonuses on Shards** use a flat curve: Shard Earnings goes from 105% to 150%, and the Shard part of Quest Rewards uses the same curve. The total is **capped at +50%** (`MAX_SHARD_MULTIPLIER`). Shard Earnings now applies to roadmap-chest Shards. Icicle-family bonuses keep the original 110% → 1000% curve. Icicles can only become Shards through the capped exchange, so that curve can't bypass the Hood curve. Level-modifier ("level twist") bonuses are Icicles-only and capped at +25%. Ranked still ignores all Hood stats.

**Chest Hood odds** are weighted toward the low end of each window and shown in-game under "What's inside & Hood odds":

| Chest (Fish) | Hood rarity odds |
|---|---|
| Minnow (25) | Pollution 60 · Trash 32 · Lost & Found 8 |
| Mackerel (100) | Trash 55 · Lost & Found 33 · Shiny 12 |
| Tuna (225) | Lost & Found 50 · Shiny 32 · SPARKLING 14 · **Epic 4** |
| Emperor (400) | SPARKLING 45 · **Epic 32** · Legendary 17 · Glorious 6 |
| Leviathan (625) | Legendary 45 · Glorious 32 · Supreme 17 · Food 6 |

Intentional rare drops: Tuna's 4% Epic (disclosed). Emperor is the designed chest-route to Epic, and it costs 400 Fish, about four weeks of a regular player's Fish income.

## 3. Targets and results

Player models (`PLAYER_MODELS` in `src/economy/simulate.ts`). Par is the expert 5-star time, so ordinary play runs well above it.

| Model | Level time | Menus/results | Retry rate | Daily routine |
|---|---|---|---|---|
| casual | 2.4 × par + 8 s/fish | 25 s | 30% | 15 min/day, 5 Daily levels, no exchange |
| regular | 1.8 × par + 5 s/fish | 18 s | 15% | 30 min/day, 15 Daily levels, uses exchange |
| skilled | 1.25 × par + 2 s/fish | 10 s | 5% | 60 min/day, all 40 Daily levels, uses exchange |

All models claim every quest, route chest and pet benefit, feed the pet daily, upgrade it with spare Icicles, and buy the cheapest Hood once (the tutorial asks for it). Rarity times below are **"could afford the cheapest Hood of this rarity if no Shards were spent"**, an optimistic upper bound on speed.

### Fresh profile, first five minutes (the reported problem)

| Model | Shards earned | Best rarity owned | Best rarity affordable | Epic? |
|---|---|---|---|---|
| casual | 24 | none | none | **No** |
| regular | 59 (49 if it also tries a Daily level) | Pollution (tutorial Hood) | Pollution | **No** |
| skilled | 73 (69) | Pollution (tutorial Hood) | Pollution | **No** |

Epic's cheapest price is about 810 Shards. Five minutes now yields under 10% of that.

### Fresh profile, first hour

| Model | Shards earned | Best rarity affordable |
|---|---|---|
| casual | 137 | Human Trash |
| regular | 169 | Lost & Found |
| skilled | 513 | Oooh Shiny |

v1 for the same hour: casual reached Oooh Shiny; regular reached Epic (at 60 min); skilled reached **Glorious** (Epic at 22 min).

### Multi-day play: day on which each rarity first becomes affordable (21 simulated days)

| Model (play/day) | Pollution | Trash | Lost & Found | Shiny | SPARKLING | **Epic** | Legendary | Glorious | Supreme | Food |
|---|---|---|---|---|---|---|---|---|---|---|
| casual (15 min) | 1 | 2 | 5 | 8 | 15 | **20** (5.0 h) | — | — | — | — |
| regular (30 min) | 1 | 1 | 2 | 3 | 6 | **8** (3.9 h) | 12 | 20 | — | — |
| skilled (60 min) | 1 | 1 | 1 | 1 | 2 | **3** (2.3 h) | 7 | 12 | — | — |

"—" means not reached within 21 days. Supreme and Food remain long-term goals for everyone.

Where a regular player's 2,353 Shards came from in 21 days: roadmap chests 417, Daily Popsicles 315, exchange 660, daily quests 302, weekly 225, monthly 220, pet 169, tutorial 45.

**Targets** (pinned by `tests/unit/economySim.test.ts`):
- no Epic, and nothing above Human Trash, affordable in a fresh five-minute session, for every model, with or without a Daily level
- Epic stays unaffordable in the first hour for every model
- regular player: first Hood on day 1, Epic between days 5 and 12, Food not within 14 days
- casual player: no Epic in the first week
- Shard multipliers never exceed +50%
- the pet can never beat the Shards → Fish shop price

## 4. Pet goldfish economics

| Care tier | Feed cost per day (Fish) | Shards per fed day | Upgrade price (Icicles) | Shards per Fish |
|---|---|---|---|---|
| 1 Starter Care | **1** | 4 | — | 4.0 |
| 2 Comfy Care | 2 | 9 | 4,000 | 4.5 |
| 3 Deluxe Care | 3 | 14 | 10,000 | 4.7 |
| 4 Royal Care | 4 | 19 | 20,000 | 4.75 |
| 5 Legendary Care | 5 | 24 | 40,000 | 4.8 |

- **Is it worth it?** A Fish is worth less in Treasure Chests: a Minnow Crate's 25 Fish usually return Icicles, a few Shards and a low-rarity Hood. So feeding (4–4.8 Shards per Fish) is a good use of Fish. The shop sells Fish at 9 Shards each (135 Shards → 15 Fish, once a day), so buying Fish to feed the pet always loses Shards. There is no loop.
- **Payback** (valuing Icicles at the capped exchange rate of 75 Icicles per Shard, which overstates their value because that exchange is limited): Comfy Care pays back in about 11 fed days (+5 Shards/day for ≈53 Shard-equivalents), Deluxe about 27, Royal about 53, Legendary about 107. The later tiers are long-term Icicle sinks, not shortcuts.
- **Practical Fish without ads or Ranked:** 3 starting Fish, plus daily quests, Popsicles #2/#3/#5/#8, 2 Fish per milestone chest and more per region chest, weekly and monthly quests. In the simulation a regular player had 103 Fish on day 7 while feeding every day.
- **Bounded effect on Hoods:** the pet supplied 7% of a regular player's Shards over 21 days.

## 5. Save migration (v1 → v2)

`src/save/schema.ts`, migration `1 → 2`:
- Wallet balances, owned Hoods (even if they now cost more), Waddles, stars, unlocks and best times are kept unchanged.
- v1 already paid the every-10th-level Shards, so roadmap chests for milestones the player has cleared are marked **claimed**. There is no double payment and no confiscation.
- The new sections (pet, titles, trade limits) start from defaults. Titles are backfilled from reliable counters at load.
- Fresh profiles start with 200 Icicles, 0 Shards and 3 Fish. Migrated profiles do not receive the 3 starter Fish.

## 6. Reproducing these numbers

```bash
npx vitest run tests/unit/economySim.test.ts        # pins the targets
```

For the full tables, call `simulateDays(PLAYER_MODELS.regular, 21)` and `simulateFreshSession(model, 300 | 3600)` from `src/economy/simulate.ts`, for example in a scratch Vitest file. The v1 comparison ran the same player model against the v1 commit (`8a976ce`), using v1's drivers, quests and unlimited exchange. v1 has no roadmap chests or pet, so the comparable figures are the fresh-session ones quoted above.
