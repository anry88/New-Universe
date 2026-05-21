# Product Analytics Event Taxonomy

This document is the launch-readiness taxonomy for task **P4-ANA-001**. It defines the first analytics surface for acquisition, onboarding, retention, building, ships, research, expeditions, economy, market readiness, and monetization readiness.

Analytics is intentionally local-first in this milestone:

- Backend events are structured Pino log entries with `event: "analytics.event"` and `analyticsEvent: "<event-name>"`.
- Frontend events are emitted as browser `CustomEvent("nu:analytics")` and can be mirrored to PostHog only when `VITE_POSTHOG_KEY` is explicitly configured.
- No external analytics provider is required for local verification or default production startup.

Production observability for aggregate product health is documented separately in [`docs/production/observability.md`](../production/observability.md). It exports `/metrics` for VictoriaMetrics/Grafana with DAU/WAU/MAU, absolute comparable-period player deltas, registration-source breakdowns, observed play time, sessions, system-development averages, funnel milestone counts for tutorial completion, discovered planets, completed buildings, built ships, and research levels, plus Telegram Stars checkout funnel aggregates. Activity-window metrics come from the `player_activity_daily` rollup; registration-source, milestone, and monetization metrics are aggregated from source-of-truth tables without per-user metric labels.

## Privacy Rules

Analytics must never contain:

- Telegram `initData`, Bot API payloads, auth headers, JWTs, cookies, secrets, or payment provider raw payloads.
- Telegram id, username, first name, last name, phone, email, or other direct personal identifiers.
- Full request/response bodies.
- Chat text or user-generated free text.

Allowed identity fields:

- Backend events may include `userIdHash`, an HMAC-SHA256 prefix derived from the internal `users.id` and `SERVER_SECRET`.
- Frontend events may include an anonymous per-tab `sessionId` stored in `sessionStorage`.

All event properties pass through `sanitizeAnalyticsEventProperties()` from `shared/types/analytics.ts`, which drops keys outside the event-specific `safeProperties` list, drops unsafe keys, and accepts only primitive string/number/boolean/null values.

## Event Catalog

| Event | Category | Surface | Safe properties | Notes |
| --- | --- | --- | --- | --- |
| `client_session_started` | retention | frontend | `locale`, `path`, `isTelegramEnvironment` | Fired once when the Mini App shell starts. |
| `session_authenticated` | retention | frontend, backend | `locale`, `tutorialCompleted`, `diamondsBalanceBand` | Backend is canonical for authenticated sessions; frontend is useful for client startup diagnostics. |
| `user_registered` | acquisition | backend | `registrationSource`, `registrationSourceCode` | Fired only when a new `users` row is created; existing users are not re-attributed. |
| `page_viewed` | retention | frontend | `path`, `locale` | Routed page views only, no query payloads. |
| `tutorial_synced` | onboarding | backend | `tutorialStep`, `tutorialCompleted`, `claimedRewardCount` | Progress sync state after server-side detection. |
| `tutorial_reward_claimed` | onboarding | backend | `stepId`, `rewardGranted`, `rewardDiamonds`, `tutorialCompleted` | One-time tutorial diamond reward claim. |
| `building_started` | building | backend | `buildingTypeId`, `slotIndex`, `selectedResourceId`, `rushCost` | Construction queue item created. |
| `building_upgraded` | building | backend | `buildingTypeId`, `fromLevel`, `rushCost` | Upgrade queue item created. |
| `building_rushed` | building | backend | `diamondsSpent`, `diamondsRemaining` | Existing diamond spend flow, not real-money purchase. |
| `building_demolished` | building | backend | `refundResourceCount` | Demolition succeeded. |
| `extractor_resource_changed` | building | backend | `selectedResourceId` | Completed extractor retargeted. |
| `ship_build_started` | ships | backend | `shipTypeId`, `rushCost` | Ship construction queue item created. |
| `ship_build_rushed` | ships | backend | `diamondsSpent`, `diamondsRemaining` | Existing diamond rush flow. |
| `ship_refueled` | ships | backend | `fuel`, `jumpFuel` | Refueler transfer succeeded. |
| `research_started` | research | backend | `branch`, `level`, `durationSeconds` | Research timer started. |
| `research_rushed` | research | backend | `branch`, `level`, `diamondsSpent`, `diamondsRemaining` | Existing diamond rush flow. |
| `expedition_launched` | expeditions | backend | `routeMode`, `hasTargetPlanet`, `fuelRequired`, `jumpFuelRequired` | Ordinary and Jump Gate mission launch. |
| `expedition_jump_requested` | expeditions | backend | `mode`, `jumpFuelRequired` | Random or known-destination Jump Gate jump accepted. |
| `cargo_transfer_started` | expeditions | backend | `routeMode`, `resourceLineCount` | Cargo transfer launched. |
| `resource_conversion_completed` | economy | backend | `fromResourceId`, `toResourceId`, `amount` | Processor conversion succeeded. |
| `production_started` | economy | backend | `recipeId`, `quantity`, `durationSeconds` | Manual production order started. |
| `diamond_resource_purchase_quoted` | monetization | backend | `resourceId`, `amount`, `diamondsNeeded`, `unitsPerDiamond` | Existing in-game diamond quote, not Telegram Stars. |
| `diamond_resource_purchase_completed` | monetization | backend | `resourceId`, `amount`, `diamondsSpent`, `diamondsRemaining` | Existing in-game diamond spend. |
| `market_order_created` | market | backend | `resourceId`, `orderType`, `amountBand`, `priceBand` | Reserved; no runtime market exists today. |
| `market_order_filled` | market | backend | `resourceId`, `orderType`, `amountBand`, `priceBand` | Reserved until escrowed market settlement is implemented. |
| `market_order_cancelled` | market | backend | `resourceId`, `orderType`, `amountBand` | Reserved until market cancellation/refund rules exist. |
| `stars_diamond_pack_viewed` | monetization | frontend | `packDiamonds`, `priceStars`, `bonusPercentVsPrevious` | Fired when the Stars shop displays configured diamond packs. |
| `stars_checkout_started` | monetization | frontend, backend | `packDiamonds`, `priceStars` | Fired when a Stars invoice is requested/opened. |
| `stars_checkout_completed` | monetization | backend | `packDiamonds`, `priceStars` | Fired after Telegram sends `successful_payment` and diamonds are credited once. |
| `stars_refund_issued` | monetization | backend | `packDiamonds`, `priceStars`, `reasonCode` | Fired after admin-approved `refundStarPayment` succeeds and diamonds are reversed. |

## Local Verification

Backend focused check:

```bash
cd backend
npm test -- src/lib/analytics.test.ts
```

Frontend focused check:

```bash
cd frontend
npm test -- src/lib/analytics.test.ts
```

Manual local sink check:

1. Run the frontend with `VITE_ANALYTICS_DEBUG=1`.
2. In the browser console, optionally run:

   ```js
   window.addEventListener('nu:analytics', (event) => console.log(event.detail));
   ```

3. Navigate between pages and log in through the mock Telegram environment.
4. Confirm frontend events include `client_session_started`, `session_authenticated`, and `page_viewed`.
5. Trigger a backend mutation such as tutorial claim, building queue, research start, ship build, expedition launch, or diamond resource quote.
6. Confirm backend logs include `event: "analytics.event"` and `analyticsEvent` from the catalog.
7. Confirm no log or browser event includes Telegram `initData`, auth tokens, username, phone/email, or raw request payloads.

Repository-wide verification remains `./scripts/ci-verify.sh` when Docker is available. The focused tests are the minimum check for this taxonomy layer.

## Monetization Readiness Boundary

This taxonomy still reserves market events only. No player-market route, table, escrow, or settlement worker exists in this repository snapshot.

P4-MON-001 implemented the Telegram Stars subset:

- Policy/readiness docs live in `docs/product/monetization.md` and `docs/product/telegram-policy-checklist.md`.
- The final diamond pack ladder is 100, 500, 2500, 5000, and 10000 diamonds for 20, 85, 350, 600, and 1000 Stars.
- Runtime purchase/refund telemetry uses the Stars events above with safe aggregate properties only.
