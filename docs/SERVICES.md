# Slippery Fish — Optional Online Services

**Status for this build: none of the online services are integrated. Only adapters exist.**
All four game modes, saves, quests, chests, Hoods and Waddles work fully offline. Every online-dependent button is visibly disabled, and pressing it explains why. The game never fakes a reward, purchase, opponent or account.

GitHub Pages hosts static files only. Deploying the site does **not** turn on any of these services; each one needs its own provider account and, in most cases, a server you deploy separately.

| Service | Adapter | Current behaviour | Configured by (public, build time) | Needs a server? |
|---|---|---|---|---|
| Rewarded ads | `src/services/ads.ts` → `UnavailableAdService` | Failure Continue (ad), Free Chest and Fishing START show "Rewarded ads are not connected in this version of Slippery Fish yet." | `VITE_ADS_PROVIDER`, `VITE_ADS_PLACEMENT_CONTINUE`, `VITE_ADS_PLACEMENT_CHEST`, `VITE_ADS_PLACEMENT_FISHING` | Recommended (server-side reward verification) |
| Accounts / sign-in | `src/services/account.ts` → `GuestAuthService` | Everyone is a local guest. Sign In is disabled with a reason. | `VITE_AUTH_PROVIDER`, `VITE_AUTH_PUBLIC_CLIENT_ID` | Yes |
| Cloud save | `src/services/account.ts` → `LocalOnlyCloudSave` | "Progress stays on this device." Export/Import Save is offered instead. | `VITE_CLOUD_SAVE_API` | Yes |
| Ranked (online) | `src/services/ranked.ts` → `RankedAdapter` | "Online Ranked: unavailable". FIND MATCH is disabled. A clearly labelled offline **Practice** (no opponent, no rewards) is available. | `VITE_RANKED_SERVER_URL` (`wss://…`) | Yes |
| Real-money payments | `src/services/payments.ts` → `DisabledPaymentService` | The Store lists the catalog as "Unavailable". Recover Purchases explains there is nothing to recover. | `VITE_PAYMENTS_PROVIDER`, `VITE_PAYMENTS_CHECKOUT_API` | Yes |
| Promotions / remote config | `src/services/remoteConfig.ts` → `RemoteConfig` | "No promotions right now." | `VITE_REMOTE_CONFIG_URL` (`https://…`, JSON) | A static JSON file is enough |
| Privacy / consent | `src/services/privacy.ts` → `PrivacyManager` | No consent banner, because there is nothing that needs consent (no ads, analytics or trackers). | — | — |

All `VITE_*` values are **public**: they end up inside the JavaScript bundle. Never put a secret key, merchant secret, admin token or password in them. `scripts/validate-content.mjs` fails the build if it finds an obviously secret-looking value. Copy `.env.example` to `.env.local` for local experiments; `.env*` files other than the example are git-ignored.

The live adapters are created in one place, `src/app.ts` (`ads`, `auth`, `cloudSave`, `payments`, `ranked`, `remoteConfig`, `privacy`). Gameplay and UI only ever talk to these interfaces.

---

## Rewarded ads

**Not integrated. No provider is selected, and no publisher account, site registration, placement ids or `ads.txt` exist.**

### Placements the game already has

| Placement id | Where | Reward (granted only on a verified reward event) | Idempotency key |
|---|---|---|---|
| `failure_continue` | Failure screen → "Watch ad to continue" | Continue the run once | `adcontinue:<rewardId>` |
| `free_chest` | Treasure Chests → "Free Minnow Crate" | One Minnow Crate; starts the 30-minute cooldown (`AD_CHEST` in `src/config/economy.ts`) | `adchest:<rewardId>` |
| `fishing` | Fishing screen → START | +10 Fish (`FISHING_REWARD_FISH`) | `fishing:<rewardId>` |

### How to connect a provider

1. Choose a browser rewarded-ad provider or game portal that supports rewarded video on your domain. Read its current publisher policies. Rewarded ads usually require an approved site or domain, and some forbid certain hosts, so check whether `*.github.io` is allowed (see GitHub Pages note below).
2. Create the publisher account and the three rewarded placements in the provider dashboard. Copy only the **public** placement ids into the `VITE_ADS_*` variables.
3. Implement `AdService` (`availability`, `showRewarded`) in a new class in `src/services/ads.ts`, and return it from `createAdService()` when `SERVICE_CONFIG.ads.provider` matches.
   - Resolve `{status:'rewarded', rewardId}` **only** from the provider's documented reward-granted callback. Never resolve on button press, ad start, load, timer, or a premature close (that is `cancelled`).
   - `rewardId` must be unique per completed view. If the provider offers server-side verification (signed callback), verify on your server and pass that server's grant id. The wallet already ignores duplicate ids, so a double callback cannot double-pay.
   - Map failures (no fill, blocked by an ad blocker, network) to `failed` or `unavailable` with a player-friendly reason.
4. If the provider collects personal data for ads, add a consent management platform before the SDK loads (where required, e.g. an IAB TCF-registered CMP for EEA/UK users). Set `PrivacyManager.requiresConsent` to true, gate SDK loading on consent, and update the Privacy Policy and the Privacy & Legal screen.
5. `ads.txt`: if the provider requires it, it must be served from the **root of your domain** (`https://example.com/ads.txt`). A GitHub project site (`user.github.io/Slippery-Fish/`) cannot serve the domain root, so you would need a custom domain or a user/organization site.
6. Test with the provider's test mode and test placement ids. A development-only mock already exists: run `npm run dev` and open `http://localhost:5173/?mockAds=1`. It shows a dashed "DEV MOCK AD" panel with Simulate reward / cancel / failure buttons and is removed from production builds.

> GitHub's documentation says Pages is not intended as free hosting for an online business or a site primarily directed at commercial transactions. Ad-monetized or paid features may fit better on another static host plus your own backend. Verify against GitHub's current terms before enabling monetization.

---

## Accounts and cloud save

**Not integrated.**

What a real integration needs:

- **Sign-in:** a hosted identity provider using OAuth 2.0 / OpenID Connect with **PKCE** (no client secret in the browser). Register the site origin(s) as allowed redirect URIs (for example `https://<user>.github.io/Slippery-Fish/`). Only the provider name and public client id go in `VITE_AUTH_*`.
- **Never** store passwords, refresh tokens in plain localStorage, or private keys in the client.
- **Cloud save API** (your server): authenticated `GET/PUT /save`. The server validates the uploaded JSON with the same rules as `sanitizeSave` (`src/save/schema.ts`) and resolves conflicts. Suggested rules: progress takes the max, cosmetics and settings take the newest, and currencies and purchases follow server truth.
- **Account deletion:** must delete the **server** account and its data, be reachable in-game (Settings → Privacy & Legal) and on a public web page (`legal/data-deletion.html`), and be documented in the Privacy Policy. Clearing only the local save is not account deletion.
- Implement `AuthService` / `CloudSaveService` in `src/services/account.ts` and construct them in `src/app.ts`.

---

## Ranked (online multiplayer)

**Not integrated. No server exists.** The client has the rules (best of three, same seed for both players, normalized stats, "OUTMATCHED" on a loss), the deterministic simulation, and the adapter. The server part must be built and hosted separately; GitHub Pages cannot run it.

Protocol the client is designed around (see the header of `src/services/ranked.ts`):

1. The client opens `wss://…` (`VITE_RANKED_SERVER_URL`) and sends `hello {contentVersion, generatorVersion, appVersion}`. The server refuses incompatible versions.
2. The server pairs two players, picks **one seed per round** (same layout for both), and sends a synchronized start time.
3. Clients stream throttled snapshots (about 10 Hz) so each can see the opponent, and send their full **input log** at round end.
4. The server **re-simulates** each input log with the same pure-TypeScript `GameSim` (`src/gameplay/sim.ts`, which has no DOM dependencies) to validate the completion time. It never trusts a client-reported time. Before launch, check cross-engine determinism (Node vs. each browser engine); the generator already avoids non-deterministic math.
5. Best of three: each round is won by the faster valid time (raw times are never added up), ties replay the round, a disconnect longer than 20 s forfeits the round, and reconnection resumes the stream.
6. Rewards (Fish, Ranked Victories) are granted **by the server** after validation. The "Ranked Victories" profile stat only counts server-validated wins.

The server needs: allowed origins (your Pages URL), rate limiting, matchmaking, version gating, abuse handling, and its own privacy disclosures (it would process gameplay data and identifiers).

---

## Real-money payments

**Disabled.** The catalog in `REAL_MONEY_CATALOG` (`src/config/economy.ts`) is shown as "Unavailable", with no prices and no buy buttons.

A real integration must:

- Create provider-hosted checkout sessions **on your server** (merchant secrets stay on the server).
- Grant entitlements only after the server verifies the provider's signed webhook or receipt, idempotently per transaction id. Never trust a client-side "success" redirect.
- Support **Recover Purchases** from the server's entitlement record (this needs accounts).
- Show final provider prices (currency and tax), refund terms, and age or parental requirements where applicable. Update the Terms of Use.
- Be hosted somewhere whose terms allow commercial transactions (see the GitHub Pages note above).

---

## Promotions

`VITE_REMOTE_CONFIG_URL` may point at an HTTPS JSON file:

```json
{ "promotions": [ { "id": "spring", "title": "Spring Thaw!", "body": "New Hoods this week.", "endsAt": "2027-04-01T00:00:00Z" } ] }
```

The response is validated (at most 6 entries, length-limited strings) and shown on the Purchases sign. Promotions are informational only; the client never invents countdowns or "limited time" offers from the local clock.
