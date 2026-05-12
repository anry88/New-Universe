# New Universe architecture

This document explains how the New Universe backend, frontend, and supporting code are organized and where to find more details. The structure mirrors the source tree so you can jump from directories to package and function descriptions.

- [Backend source root (`backend/src`)](backend/src/README.md)
- [Backend database layer (`backend/src/db`)](backend/src/db/README.md)
- [Backend config constants (`backend/src/config`)](backend/src/config/README.md)
- [Backend feature modules (`backend/src/features`)](backend/src/features/README.md)
- [Backend shared libraries (`backend/src/lib`)](backend/src/lib/README.md)
- [Backend middleware (`backend/src/middleware`)](backend/src/middleware/README.md)
- [Backend HTTP routes (`backend/src/routes`)](backend/src/routes/README.md)
- [Backend workers (`backend/src/workers`)](backend/src/workers/README.md)
- [Backend tests (`backend/tests`)](backend/tests/README.md)
- [Frontend source root (`frontend/src`)](frontend/src/README.md)
- [Shared cross-package types (`shared`)](shared/README.md)
- [Economy balance simulator (`tools/balance-sim`)](tools/balance-sim/README.md)

## Overview

New Universe is a Telegram Mini App space-strategy game. The implementation is split across three top-level code areas:

- `backend/` — Fastify v5 + TypeScript (ESM) HTTP API. Entry point is `backend/src/index.ts`. End-to-end integration tests in `backend/tests/e2e` validate core game loops (registration, construction, expeditions) via `npm run test:e2e`. The Phase 2 regression gate (`phase2-regression.test.ts`) is documented in [`docs/testing/phase2-regression.md`](docs/testing/phase2-regression.md).
- `frontend/` — Vite + React 18 Telegram Mini App client. Entry point is `frontend/src/main.tsx`, which initializes the Telegram Apps SDK (`init`, `miniApp.mount`, `themeParams.mount`, `viewport.mount`, `miniApp.ready`), boots Sentry, optionally mocks the Telegram environment for browser dev (`mockEnv.ts`), and renders `App.tsx` into `#root`.
- `shared/` — cross-package contracts (`shared/types/` payloads plus `shared/config/` progression catalogs such as the research tree) consumed by both backend and frontend so shapes stay in sync.

The `dev/`, `docs/`, and `tasks/` folders contain non-runtime materials: dev-environment scaffolding, the GDD/roadmap PDFs, and the task plan / GitHub Project automation scripts. They do not ship as application code.

Phase 2 polish epic (**P2-EPIC-POLISH**) completion evidence lives in [`tasks/ROADMAP_COVERAGE_MATRIX.md`](tasks/ROADMAP_COVERAGE_MATRIX.md); accepted tuning risks before Phase 3 planning are listed in [`docs/phase2/tuning-risks.md`](docs/phase2/tuning-risks.md).

The `tools/` folder hosts offline agents (not bundled into Docker images). Today `tools/balance-sim` mirrors seeded costs/timers for deterministic first-week progression runs that write JSON artifacts for balance comparisons.

## Runtime composition

### Backend

`backend/src/index.ts` is the only HTTP process today:

- Plugins: `@fastify/cors`, `@fastify/helmet` (registered for every route).
- Logging: Pino instance from `lib/logger.ts`, switched to `pino-pretty` in development.
- Request IDs: every incoming request gets a UUID via `middleware/request-id.ts` and the ID is exposed under the `requestId` log key.
- Sentry: `lib/sentry.ts` is imported as the very first module to capture early-startup errors; it stays disabled when `SENTRY_DSN` is empty.
- Routes: `/health` (`routes/health.ts`), `/webhook/telegram` (`routes/bot.ts`), `/auth/telegram` (`features/auth/routes.ts`), `/me` and `PATCH /me/preferences` (`features/me/routes.ts`; active-session sync finalizes due timers before returning state and preferences persist the active UI locale), `/buildings/*` including **`POST /buildings/rush`** (`features/buildings/routes.ts`), `/resources/convert`, `/resources/buy-with-diamonds`, and `/resources/production/*` for explicit production recipes/orders (`features/resources/routes.ts`), `/ships/build`, `/ships/queue`, **`POST /ships/rush`** (`features/ships/routes.ts`), `/expeditions` (`features/expeditions/routes.ts`), `/expeditions/jump` (`features/expeditions/routes.ts`), `/research/start`, **`POST /research/rush`** (`features/research/routes.ts`), `/tutorial/sync` (`features/tutorial/routes.ts`), `/market/offers` (`routes/market.ts`), `/market/orders` (`routes/market.ts`), `/market/orders/:orderId/cancel` (`routes/market.ts`), `/multiplayer/sectors/:sx/:sy/:sz/presence` (`routes/multiplayer.ts`).

### Workers

`backend/src/workers/index.ts` boots the background processing layer:

- **Repeat Queue**: Uses BullMQ's repeatable jobs to "tick" game logic every 30 seconds.
- **`tick-buildings`**: Completes construction/upgrades and updates resource regen rates.
- **`tick-expeditions`**: The most complex worker; it interpolates ship positions on the **sector XY plane** during travel (Z stays at the origin system’s sector Z for fog-of-war), performs real-time visibility checks with planet-size discovery radii, and turns one-way colonizer arrivals into settled colonies with a completed Command Center. The same `processExpeditions({ userId, skipNotifications })` path powers online `/me` sync for due arrivals without Telegram pushes.
- **`tick-ships`**: Finalizes ship production. Jobs update only still-building due rows and skip notification creation when the ship was already completed by online sync.
- **`notifications`**: Processes pending notifications from the database and sends them to Telegram via the Bot API every minute, respecting a 20 msgs/min per user rate limit.
- **`cargo-routes`**: Completes interplanetary resource transfers triggered from the API; handles atomicity, idempotency, and resource delivery.
- **`research`**: Applies finished lab timers (`research_progress.completes_at`), bumps completed tier levels once, triggers effect-cache invalidation hooks, and queues `research_done` notifications only for offline/worker completions.
- **`market`**: Every ~15 seconds runs `processNpcMarketFulfillment` to settle open NPC orders (sell: credits iron once inventory fits; buy: delivers purchased goods after `delivery_ready_at`, clamps to storage caps, refunds unused iron).
- **`production-orders`**: Every 30 seconds runs `ProductionService.processDueOrders` so explicit refinery/smelter/fabricator/cryo jobs grant their outputs after inputs were reserved at start time.


### Telegram Bot

The bot entry point is `POST /webhook/telegram`. Incoming updates are dispatched through `features/bot/service.ts`.
- `/start` command: implemented in `features/bot/commands.ts`, sends a welcome message with an inline button to launch the Mini App via `web_app` type.
- `/add_diamond` command: admin-only command in `features/bot/commands.ts` with aliases and `env.ADMIN_TELEGRAM_IDS` allowlist, `username + amount` input, and structured `admin.add_diamond` logging.
- Update handling: `features/bot/webhook.ts` parses the update and routes it to command handlers.

### Database (Drizzle ORM + Postgres)


`backend/src/db/index.ts` opens a `postgres-js` connection from `DATABASE_URL` and exposes a typed Drizzle client via `db`. The schema is split per domain under `backend/src/db/schema/` and re-exported from `backend/src/db/schema.ts`:

- `users` — Telegram-linked player accounts, onboarding progression (`tutorial_step` exposed in code as `tutorialStepCompleted`, `tutorial_completed_at`), **`preferred_locale`** (`en`/`ru`, initialized from Telegram `language_code` on first login and editable in Profile), plus **`diamonds`** (premium currency for rush-build; starter grant on first registration via env `DIAMOND_STARTING_GRANT`).
- `resources`, `richness`, `planet_resources` — universe resource catalog (25 seeded resources across tiers 1–4, including stored `energy`, `oil`, `fuel`, `steel`, `electronics`, and `biomass`) and per-planet inventory. **`richness`** is the deposit source exposed to the client as `PlanetResource.richness`; starter home rows and new colonies initialize `planet_resources.regenRate = 0` until matching extraction buildings complete. Building completion updates **`planet_resources.regenRate`** only for passive producers (`mine`, `drill`, `oil_pump`, `biomass_harvester`, solar/wind energy support rows); crafted goods such as `steel`, `electronics`, `fuel`, `ice`, and `water` are produced by explicit production orders instead of automatic regen.
- `systems`, `planets` — generated star systems and their planets, including biome and slot count.
- `building_types`, `buildings` — building catalog and per-planet build queue rows. Catalog rows may set **`max_per_planet`** / **`max_global`** (nullable integers) so uniqueness rules such as one Command Center per planet or one Laboratory account-wide stay aligned between seeds, API payloads (`GET /buildings/types`), and UI eligibility (`shared/types/building-eligibility.ts`). Command Center upgrades use a non-empty `iron`/`carbon`/`silicon` `baseCost` with the normal upgrade multiplier. Energy buildings include `battery` (`baseOutput.energyCap` storage), `solar_plant` (orbit-scaled output), `wind_turbine` (planet-size-scaled output), and `fuel_generator` (manual charging recipes). Eligibility can take an optional **`dependencyBuildings`** snapshot so structures still in the initial build queue do not satisfy prerequisite levels until construction finishes, and shared planet-resource gates prevent extractors/feedstock buildings on planets without matching deposits.
- `research_branches`, `research_progress` — research tree definitions and per-user progress. Active rows expose derived `startedAt` through `/me` so progress bars can be computed exactly without schema changes.
- `ship_types`, `ships` — ship catalog and player-owned ship instances. Active build rows expose derived `queueStartedAt` through `/me` and `/ships/queue`.
- `discovered_planets`, `discovered_systems` — fog-of-war reveal records.
- `expeditions` — scheduled expedition jobs with `eta` / `status` index.
- `notifications` — push notification log with `pending` and `sentAt` tracking.
- `market_offers`, `market_orders`, `market_order_fills` — NPC/player market offer book, user orders, and fill history with explicit order lifecycle states and delivery references. Orders store `planet_id` (settlement for fulfillment) and `delivery_ready_at` (NPC buy ETA); fulfillment inserts matching `market_order_fills` rows.
- `production_orders` — explicit manufacturing jobs for player-selected recipes. Starting an order atomically spends material inputs plus stored `energy` when the building consumes power, stores the intended outputs, and later worker/online sync grants the result when `completes_at` is due; `fuel_generator` recipes charge the battery resource from `fuel`, `oil`, or `methane`.
- `colonies` — player-owned colonies on discovered neutral planets and on discovered non-capital planets inside the player's own home system; foreign home systems stay protected.

NPC broker pricing parameters live in `backend/src/config/market-prices.ts`; the deterministic quote algorithm is implemented in `backend/src/features/market/pricing.ts`. `market-prices.test.ts` keeps tier alignment with seeded resources and asserts there is no trivial NPC buy/sell arbitrage at neutral stock (epic **P2-EPIC-MARKET-NPC** gate).
Phase 2 research definitions (**seven branches × five tiers** with typed effects) live in **`shared/config/researchCatalog.ts`** and are re-exported from `backend/src/config/research-catalog.ts` for seeding and runtime research/effects logic. Colonization tuning (colony caps vs logistics level, founding costs, cooldown, distance) lives in `backend/src/config/colonization-rules.ts` and is enforced in `features/colonies/colonization-rules.ts`. Progression gates that tie research completions to buildings, ships, colonization, logistics, and NPC trading are declared in `backend/src/config/research-unlocks.ts` and enforced in `backend/src/features/research/gates.ts`.


Migrations live under `backend/src/db/migrations/` and are managed by Drizzle Kit (`npm run db:generate`, `npm run db:migrate`). Static reference data is loaded by `backend/src/db/seed.ts`, which runs the four seeders in `backend/src/db/seed/` (`resources`, `research-branches`, `building-types`, `ship-types`).

### Authentication

`POST /auth/telegram` is the only Telegram login endpoint today. The request flows through `middleware/telegram-auth.ts`, which validates the `X-Telegram-Init-Data` header using `lib/telegram.ts` and returns localized auth errors via `lib/i18n.ts`. On first contact, `features/auth/service.ts#loginWithTelegram` creates a `users` row inside a transaction, initializes `preferredLocale` from Telegram `language_code` (`ru*` → `ru`, otherwise `en`), and immediately calls `features/world/home-system-generator.ts#generateHomeSystem` to seed the player's deterministic nine-planet home system with resource richness, zero-regen starter planet inventory, a starting `command_center` building, and a **`discovered_planets` row only for the capital** (other home bodies unlock after scout survey, then require colonizer settlement before construction). The service signs a 30-day JWT (`JWT_SECRET`), and the route sets a `Set-Cookie: session=<token>` cookie (`HttpOnly`, `SameSite=Strict`, `Secure` only in production) and returns `{ user, token }`.

### World generation

`features/world/biomes.ts` defines the seven biome catalog (`rocky`, `ocean`, `gas_giant`, `ice`, `volcanic`, `green`, `anomaly`) plus starter biome/resource rules that keep hot worlds close to the star and frozen worlds at the outer edge. `features/world/home-system-generator.ts` implements a deterministic per-user RNG (`hashString(userId-SERVER_SECRET)` + `mulberry32`-style PRNG) so a given player always gets the same home system: **9 planets** in a fixed inner-to-outer biome plan (two volcanic, two rocky, ocean, green capital, gas giant, two ice), capital always **`green`** with minimum slot budget (`MIN_HOME_CAPITAL_SLOT_COUNT`) and a deeper habitable orbit than the inner rocky/ocean worlds, and an authored local resource spread that includes the materials needed to progress out of the home system while excluding impossible mixes such as biomass on ice worlds. Passive sector visibility **does not** reveal locked home planets; `tick-expeditions` uses the shared flat map layout in `@shared/format/systemMapLayout` to reveal hidden home planets only when a recon route passes through their size-scaled visibility corridor, with a minimum width so nearby fly-bys still count on small worlds. `GET /me` lists only home planets the player has discovered, marks whether each planet is actually colonized via `isColonized`, and obfuscates undiscovered body details, while the frontend no longer renders hidden bodies at their real map positions or lets `unknown` placeholders create artificial orbit rings.

### Frontend

`frontend/src/main.tsx` is the only entry point. It depends on `@telegram-apps/sdk-react` for Telegram launch parameters, theme, and viewport, and renders `App.tsx`. 
- `lib/api.ts` — a unified fetch client that automatically sends the session token in the `Authorization` header, Telegram `initDataRaw` in the `X-Telegram-Init-Data` header, and the persisted locale in `Accept-Language`.
- `lib/i18n.tsx`, `lib/locale.ts`, and `locales/` — EN/RU dictionary loading, runtime `t(key, params?)` translation, persisted locale switching, and Telegram/Accept-Language locale normalization.
- `hooks/useAuth.ts` — manages the auth flow and session token.
- `hooks/useMe.ts` — uses TanStack Query to fetch and cache the current player state from `GET /me`; countdowns tick locally and the hook schedules one refetch at the nearest due building/research/ship/expedition timestamp.
- `pages/SectorMap.tsx` — Phase 3 sector radar: queries `GET /multiplayer/sectors/:sx/:sy/:sz/presence` and renders markers via `components/pixi/SectorRenderer.tsx` (PixiJS scatter plot; foreign actors shown with summary visibility).
- `hooks/useColonies.ts` — manages the collection of player-owned planets and tracks the focal planet across the UI via a dedicated Zustand store; discovered-but-unsettled planets are excluded until a colonizer arrives.
- `pages/Home.tsx` — main game screen with resource bar, tab bar, and navigation; inactive-tutorial shortcut uses **`tutorial-launcher`** CSS so it sits below the resource bar (no overlap).
- `pages/Colonies.tsx` — lists all owned planets with their resources and status, allowing focal planet switching and initiating cargo transfers.
- `pages/Profile.tsx` — player profile and preferences surface, including the EN/RU language switch that persists through `PATCH /me/preferences` and updates the Mini App without reload.
- `pages/Market.tsx` — market UI for browsing buy/sell quotes, submitting NPC market orders, and tracking pending order ETA.
- `pages/Research.tsx` — Cosmic Atlas tech tree (**levels 1–5** per branch, synced with `frontend/src/lib/tech-tree.ts` / `@shared/config/researchCatalog`); lab/prerequisite/resource gating (BuildDialog-style blocking copy), tier detail sheet, optimistic research starts, live countdown chips, and diamond rush for the active tier.
- `pages/onboarding/Onboarding.tsx` — Cosmic tutorial overlay: step list with reward copy from `@shared/config/tutorialRewards`, periodic `POST /tutorial/sync`, **Continue** returns to Home without forcing `/onboarding` again until the player re-opens tutorial or completes it (`sessionStorage` + lifted App state).
- `pages/PlanetDetail.tsx` — detailed planet screen with infrastructure slots, building construction, upgrade dialogs, battery charge/energy-shortage status, and explicit production entry points for smelters/refineries/fabricators/cryo factories/fuel generators; unsettled discovered planets show their survey data but keep building slots locked until colonization. Build previews use `/me` resource richness plus shared eligibility helpers so useless planet/building combinations are disabled before the API call.
- `components/ExpeditionDialog.tsx` — launch dialog for scouts, cargo, and colonizers. Colonizers require a discovered unsettled home-system planet target and reserve one-way fuel for settlement instead of behaving like return-trip scouts.
- `components/ResourceBar.tsx` — displays planet resources with animated real-time regeneration.
- `components/PlanetView.tsx` — shows the current focus planet overview.
- `components/BuildQueue.tsx` — displays the current build queue with countdown timers and progress from server-derived `queueStartedAt`; syncs due builds at completion rather than polling `/me` every second.
- `components/CargoTransferDialog.tsx` — interplanetary logistics interface for moving resources between colonies.
- `components/Tutorial.tsx` — full-screen onboarding overlay UI used by `Onboarding.tsx`.
- `components/BuildingSlot.tsx` — presentational component for an infrastructure slot.
- `components/ProductionDialog.tsx` — compact recipe picker and production-order confirmation sheet. It shows what will be produced, required material/energy inputs, output quantity, duration, storage/resource blocks, and active-order remaining-time countdowns before starting a job that spends inputs immediately.
- `components/UpgradeDialog.tsx` & `components/BuildDialog.tsx` — dialogs for managing buildings; the upgrade dialog links production-capable buildings into `ProductionDialog`, and the build dialog groups options into localized category sections (energy, extraction, processing, logistics, shipbuilding, progress, special).

### Shared types and config

`shared/types/` is the cross-cutting contract folder for backend ↔ frontend payloads:
- `locale.ts` — supported-locale contract (`en`/`ru`), locale normalization, and `/me/preferences` payloads.
- `user.ts` — `User` interface (`preferredLocale`, `diamonds`, onboarding fields, home system linkage).
- `buildings.ts` — building types, construction requests, and structured build-block reasons including planet-resource/deposit failures.
- `auth.ts` — `AuthResponse` interface.
- `research.ts` — research DTOs, `RushResearchRequest` / `RushResearchResponse`, `ResearchRequirementRef`, `RESEARCH_BRANCH_LABELS_EN`, plus `ResourceId` union used by tech-tree costs and unlock messaging on both backend and frontend.
- `diamonds.ts` — shared rush-pricing metadata and formula used by building, ship, and research rush previews.
- `expeditions.ts` — expedition DTOs plus `ExpeditionResult` (`fuelRequired`, route distance/speed/timer data) shared by map/fleet countdown UI and backend launch records.
- `ships.ts` — fleet DTOs including active build `queueStartedAt` for local ETA/progress rendering.
- `market.ts` — market offer and order contracts shared between frontend market hooks and backend market routes.
- `world.ts` — world DTOs including `Planet.isColonized`, which lets the frontend separate survey visibility from settlement ownership, `PlanetResource.richness` for deposit-aware UI gates, `Planet.energy` / `Building.energy` for battery charge and energy-shortage UI, plus active building `queueStartedAt`.
- `production.ts` — explicit production recipe/order DTOs used by `/resources/production/*` and the production dialog.

`shared/format/` holds locale-aware and deterministic display helpers — **`homeSystemNaming.ts`** templates EN/RU home-system titles and `{shortTag}-N` planet codes shared with world generation; **`systemMapLayout.ts`** keeps the frontend orbital map and worker pass-by discovery on the same flat geometry, including biome orbit ordering, one-planet orbit slots, and sprite-size-based discovery radius.

`shared/config/` holds deterministic catalogs duplicated only when both backend and browser need identical numbers — today **`researchCatalog.ts`** (full tech tree + scaling notes), **`buildingResearchGates.ts`**, **`productionRecipes.ts`** (manual manufacturing and battery-charge recipes), and **`tutorialRewards.ts`** (tutorial iron/water bundles + EN/RU UI summaries).

## Local environment

`docker-compose.yml` at the repo root composes the local dev stack: `postgres` (with `pgdata` volume), `redis`, `backend` (`Dockerfile` target `dev`, mounts `backend/src` and `shared` for hot reload), an optional `worker` profile, an optional `frontend` profile, and the optional `devtools` profile (`adminer`, `redis-commander`). All variables are read from `.env` (template in `.env.example`).

## CI and automation

- **`.github/workflows/ci.yml`** — on each PR / push to `main`: Docker Postgres/Redis, backend lint/build/migrate/seed/unit tests, frontend lint/build/unit tests (fast path). No Playwright.
- **`.github/workflows/e2e.yml`** — Playwright Chromium on `frontend/tests/e2e` when triggered by workflow dispatch or by PR label **`run-e2e`** (not `epic:*` — every task issue already has an `epic:EPIC-…` label from import).
- **`scripts/ci-verify.sh`** — local mirror of `ci.yml`; set `RUN_PLAYWRIGHT_E2E=1` to include Playwright like `e2e.yml`.

See [.github/workflows/README.md](.github/workflows/README.md) and [`AGENTS.md`](AGENTS.md) (verification contract and CI / Playwright sections).

## How to navigate this codebase

To understand how a specific piece of code works, open the README for the relevant package and follow the links to the detailed files. Start at [`backend/src/README.md`](backend/src/README.md) for backend code and [`frontend/src/README.md`](frontend/src/README.md) for frontend code. Each package README lists every file in that directory with a short description of its responsibilities and the key exports/functions that other packages call into.

## Keeping this document fresh

`AGENTS.md` requires every code change to update the matching `*/README.md` and, when the change affects cross-cutting concerns, this `DOCUMENTATION.md` overview. Do not let the documentation drift; agents reading the codebase rely on it to navigate quickly.
