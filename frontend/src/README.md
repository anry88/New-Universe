# `frontend/src` directory

This is the Telegram Mini App client. It is a Vite + React 18 + TypeScript project (`"type": "module"`) using Tailwind CSS, the Telegram Apps SDK, TanStack Query, Zustand, Pixi.js (for future canvas scenes), and Sentry. The current code is the minimum bootstrap; new pages, components, and state belong in the conventional subfolders described below.

## Layout

- `lib/` — shared infrastructure (API client, store, Sentry init, helpers).
  - **`api.ts`** — `apiFetch` wrapper for authenticated JSON calls; sends `Accept-Language` from the persisted UI locale.
  - **`expedition-routing.ts`** — `buildExpeditionPreview()` wraps shared expedition route math for local and Jump Gate mission previews, including one-way colonizer fuel, ETA, and Jump Fuel requirements.
  - **`expedition-routing.test.ts`** — unit coverage that keeps frontend Jump Gate scout/colonizer preview math aligned with backend launch results.
  - **`i18n.tsx`** — React i18n provider/hook. Exports `I18nProvider`, `useI18n`, and `translate`; loads `locales/en.json` + `locales/ru.json`, persists locale changes, and performs simple `{param}` interpolation.
  - **`locale.ts`** — locale persistence/resolution helpers (`readStoredLocale`, `persistUiLocale`, `getUiLocale`, `normalizeUiLocale`) backed by `@shared/types/locale`.
  - **`locale.test.ts`** — unit coverage for locale normalization (`en` fallback, Telegram/Accept-Language `ru` detection).
  - **`production.ts`** — small UI helpers for recipe defaults, production-start eligibility, and localized block text from server preview responses.
  - **`production.test.ts`** — unit coverage for production helper behavior.
  - **`fleet.ts`** — `isCargoTransferShipType`, `isCargoTransferShip`, and `formatCargoTransferError` keep cargo-transfer entrypoints limited to logistics ships and map server cargo failures to localized UI copy.
  - **`fleet.test.ts`** — unit coverage for cargo-ship filtering and cargo error localization keys.
  - **`timers.ts`** — `timerSnapshot()` and `formatTimerDuration()` for local countdown/progress rendering from server timestamps without polling `/me` every second.
  - **`timers.test.ts`** — fake-clock coverage for remaining-time, derived-start, and due-state progress math.
  - **`ship-build-eligibility.ts`** — `resolveShipBuildBlockedReason(planet, shipType)` for local shipyard planner blocking on required building level and available build-cost resources.
  - **`ship-build-eligibility.test.ts`** — unit coverage for cargo_light shipyard L2 and capital-resource build blockers.
  - **`systemMapLayout.test.ts`** — Vitest coverage for shared home-system map guide rings, specifically ensuring obfuscated `unknown` planets from `/me` do not expand the rendered orbit count.
  - **`resourceBarScope.ts`** — `planetInventoryApiPath(planetId)` for `GET /resources/planets/:id` (resource top bar + inventory).
  - **`homeSystemTitle.ts`** — `formatHomeSystemTitleForUser()` builds localized home-system banners from `/me` (`@shared/format/homeSystemNaming`).
  - **`uiLocale.ts`** — compatibility re-export for `getUiLocale()` and `UiLocale`; new code should import from `locale.ts` / `i18n.tsx`.
  - **`sentry.ts`** — Sentry browser init.
  - **`tech-tree.ts`**, **`research-eligibility.ts`**, **`research-queue.ts`** — research UI helpers and tests. `research-queue.ts` identifies the single active research timer and blocks starts for other branches while that timer is running.
- `hooks/` — custom React hooks.
  - **`useAuth.ts`** — manages JWT session state in memory via Zustand.
  - **`useExpeditions.ts`** — `useLaunchExpedition()` wraps `POST /expeditions` and accepts the shared `LaunchExpeditionRequest`, including `routeMode='jump_gate'` with `destinationSystemId`.
  - **`useJumpGateState.ts`** — `useJumpGateState()` fetches `GET /jump-gate/state` for mission UI destination lists, gate lock/calibration status, and known public-system body summaries.
  - **`useResearch.ts`** — `useStartResearch()` wraps `POST /research/start` with optimistic `me` cache updates (`startedAt` + `completesAt` + in-flight branch), rollback on error, and invalidation on settle; `useRushResearch()` calls `POST /research/rush` and refreshes `/me`.
  - **`useMe.ts`** — React Query hook for fetching current player data from `GET /me`; schedules one refetch at the nearest active building/research/ship/expedition completion timestamp while countdowns tick locally in UI.
  - **`useColonies.ts`** — manages the collection of player-owned/settled planets and tracks the focal planet across the UI via a dedicated Zustand store (`useColoniesStore`); excludes undiscovered bodies and discovered-but-unsettled bodies (`isColonized === false`) so Home/Colonies show only buildable planets.
  - **`useColonies.test.ts`** — store-level coverage for switching the focal planet id (home rail / colonies).
- `pages/` — page-level components routed by `react-router-dom`.
  - **`Home.tsx`** — main game screen with resource bar, planet view, build queue, and bottom tab bar.
  - **`Colonies.tsx`** — lists all owned planets with their resources and status, allowing focal planet switching and initiating cargo transfers; `?cargoOrigin=<planetId>` opens the cargo dialog directly from fleet logistics shortcuts.
  - **`Profile.tsx`** — player profile card with sector/system details, controlled-planet count based only on settled planets, an EN/RU language switch backed by `PATCH /me/preferences`, and a `RESUME TUTORIAL` action when onboarding is not completed yet.
  - `onboarding/` — first-session onboarding tutorial pages. See [`pages/onboarding/README.md`](./pages/onboarding/README.md).
    - **`Onboarding.tsx`** — 5-step tutorial overlay (welcome → mine → storage → scout → expedition); polls `POST /tutorial/sync`; wires **Continue** to dismiss full-screen gate via App/sessionStorage so Home stays playable without redirect loops.
  - **`PlanetDetail.tsx`** — detailed planet view with building slots, upgrade options, post-build extractor resource switching, production entry points for manual processors, and server-sourced planet energy status; derives construction eligibility from `GET /buildings/types` limits plus live `/me` planets/research/deposit richness via `@shared/types/building-eligibility`, computes extractor resource choices and used/limit counts from `PlanetResource.richness` plus `Building.selectedResourceId`, ignores buildings still in the initial queue for dependency previews, blocks non-Command-Center upgrades above the local Command Center level, and keeps merely discovered planets read-only until `/me` marks them `isColonized`.
  - **`SystemMap.tsx`** — page component for the interactive home system map; links into the sector radar for the same sector cube and treats only `isColonized` planets as openable settlements.
  - **`SectorMap.tsx`** — Phase 3 sector map: queries `GET /multiplayer/systems` for Home/discovered/colony/fleet anchor chips, then queries `GET /multiplayer/sectors/:sx/:sy/:sz/presence` for the chosen sector; still supports manual sector coordinates and renders Pixi markers via `SectorRenderer`.
  - **`Ships.tsx`** — fleet management screen with two tabs: roster (`/ships`) and shipyard build queue/planner (`/ships?tab=shipyard`) wired to `POST /ships/build`; shipyard rows show localized blockers for missing building levels and build-cost resources, ships in `building` show ETA/progress from `GET /ships/queue`, schedule a queue refresh at completion, support rush completion via `POST /ships/rush`, and route logistics ships into the Colonies cargo-transfer dialog instead of the generic expedition launcher.
- **`Research.tsx`** — tech-tree screen (Cosmic Atlas): eight branches × **five** tiers aligned with `@shared/config/researchCatalog` (including Energy and Weapons), branch blurbs, localized applied-effects summary, per-tier `TechTreeNode` states (completed / in-progress timer / next pending / locked), tier detail sheet with lab/prereq/resource/queue blocking (BuildDialog-style), optimistic start via `useStartResearch`, and active-tier diamond rush via `useRushResearch`.
- `components/` — reusable presentational components.
  - `pixi/` — canvas-based rendering components using PixiJS.
    - **`SystemRenderer.tsx`** — top-down system map renderer. Handles orbits, planets, star, and ship markers with pan/zoom logic.
    - **`SectorRenderer.tsx`** — compact Pixi scatter plot for multiplayer sector markers (`PresenceEntityKind` colors); receives `SectorPresenceEntity[]` plus localized empty-state copy from the presence page.
  - **`ResourceBar.tsx`** — planet-scoped top chips (`planetInventoryApiPath` when `planetId` is set), RAF smoothing, **`user.diamonds`** on `CosmicTopBar` (four resources + diamond chip when balance is defined), optional `planetLabel`, and **All** opening `ResourceInventoryDrawer`. Clicking a resource chip opens diamond purchase flow (`POST /resources/buy-with-diamonds`) for the current planet.
  - **`ResourceInventoryDrawer.tsx`** — full planet stockpile list (sorted by label) plus account-wide diamonds in **Account (global)** when `/me` returns `user.diamonds`; each resource row has `Buy with diamonds` action using the same purchase flow as top chips.
  - **`ResourceDiamondPurchaseDialog.tsx`** — right-panel purchase sheet for resource amount input + buy confirmation; shared entrypoint for top-bar and inventory clicks.
  - **`cosmic/resources.ts`** — resource id -> symbol/label dictionary used in cosmic UI; aligned with seeded resource ids (`iron`, `silicon`, `oil`, `tritium`, etc.) for tech-tree cost rendering.
  - **`PlanetView.tsx`** — focal planet portrait + slot grid; `PlanetRail` updates the focal planet via `setFocalPlanetId` (keeps the user on Home while syncing the top resource bar).
  - **`cosmic/buildings.tsx`** — Cosmic Atlas building icons keyed by backend catalog ids (including `battery`, `solar_plant`, `wind_turbine`, `fuel_generator`, `oil_pump`, `biomass_harvester`, and `refinery`); exports `resolveBuildingType(typeId)` (canonical ids plus legacy synonyms such as `laboratory` and alternate lab spellings matched via `/^research[_-]?lab$/i`) plus stable build-list category helpers (`energy`, `extraction`, `processing`, `logistics`, `shipbuilding`, `progress`, `special`). `cryo_factory` is mapped to the `processing` section with other production buildings.
  - **`cosmic/buildings.test.ts`** — Vitest coverage for `resolveBuildingType` (known id resolution plus unknown-id fallback to the safe default icon).
  - **`cosmic/SystemMap.tsx`** — exports `CosmicSystemRenderer` (SVG orbital home-system map; pan/pinch/zoom) and optional `expeditionPick` for mission UI: tap-to-aim a flat sector ΔXY route point, colonizer target selection on discovered planets, draft trail from `launchPlanetId`, active expedition trails filtered to in-flight/returning rows, nine one-planet orbit guide rings that ignore obfuscated `unknown` placeholders from `/me`, ship interpolation in both directions without inline status labels, and undiscovered planets hidden from their real map positions until the backend marks them discovered. The selected-planet card now also shows mineable deposits and can be dismissed by tapping free space.
  - **`BuildQueue.tsx`** — displays the current build queue head with countdown timers and progress from server-derived `queueStartedAt`, polls `GET /buildings/queue` for **`rushPricing`**, computes live rush cost via `@shared/types/diamonds` (`estimateRushDiamondCost`), and calls **`POST /buildings/rush`** with loading/disabled states tied to `useMe().diamonds`.
  - **`ResearchQueue.tsx`** — fixed bottom research queue strip for the one active research timer. It reuses Cosmic `QueueStrip`, shows localized queue-lock status, computes live rush cost from shared diamond pricing, and calls `POST /research/rush`.
  - **`BuildingSlot.tsx`** — wraps the Cosmic `BuildSlot` atom for planet infrastructure slots, including queue progress, server-derived energy disabled state, battery charge display, and current queued/paused production-process chips from `/me`.
  - **`BuildDialog.tsx`** — Cosmic Atlas bottom sheet for picking a building type on an empty slot; groups options into localized category sections, sorts building options inside those sections by unlock progression (dependency gate/depth), applies dashed/low-opacity styling when `blockedReasonFor` reports a shared `BuildBlockedReason`, shows current energy balance (`+produced / -consumed / net`) plus stored battery charge with per-option projected net after build, treats processor energy as active-process demand rather than idle drain, offers resource-choice chips for extractor buildings with `used/limit` deposit counts, shows the resource-specific extraction yield from shared balance helpers, opens an inline hint (`build-block-reason`) on tap, and only calls `POST /buildings/build` when the row is eligible.
  - **`UpgradeDialog.tsx`** — Cosmic Atlas bottom sheet for completed buildings. It shows shared L10 / Command Center cap blockers, level-up costs from `@shared/config/buildingUpgradeEconomy` including L6+ extra materials, resource-specific extractor yield previews, shipyard/production entry points, saved extractor target, and `selectedResourceId` switching through `POST /buildings/resource` with the same deposit-limit chips and localized block reasons used during construction.
  - **`CargoTransferDialog.tsx`** — interplanetary logistics interface for moving resources between colonies through the shared `CargoTransferRequest` contract.
  - **`ExpeditionDialog.tsx`** — mission launch on a **single** Galaxy map: `CosmicSystemRenderer` with `expeditionPick` for local home-system routes, a Jump Gate route selector for known public destinations and their safe planet summaries, shared ETA/fuel preview for local and gate routes, Jump Fuel tank blocking, one-way colonizer deployment, and no manual fuel or ΔZ input.
  - **`ProductionDialog.tsx`** — compact production-process sheet for buildings with recipes. It fetches `/resources/production/recipes`, previews selected output quantity via `/resources/production/preview`, shows required material inputs, duration, and current queued/paused process countdowns, confirms material spend, and starts processes through `/resources/production/start`.
  - **`RequirementList.tsx`** — compact list of missing `{ branch, level }` research prerequisites for gated UI actions; uses localized research branch labels from `@shared/types/research`.
  - **`TechTreeNode.tsx`** — single-tier chip for Cosmic `tech-node` styles: completed/active countdown/pending/locked visuals using `timerSnapshot()` so progress can use server `startedAt`.
  - **`cosmic/atoms.tsx`** — shared Cosmic Atlas atoms including `BuildSlot` and `QueueStrip`; `BuildSlot` renders queue progress, energy/battery badges, and current production-process chips, while the strip supports long-duration ETA formatting, optional status subtitle copy, and custom rush labels for building and research queues.
  - **`Tutorial.tsx`** — reusable full-screen onboarding overlay with step list, per-step reward blurbs from `@shared/config/tutorialRewards`, **Continue** (back to game without skip), **Skip for now**, and **Back to game** when complete.
- `locales/` — flat EN/RU dictionaries used by `lib/i18n.tsx`; see [`locales/README.md`](./locales/README.md).
- `assets/` — static assets imported by Vite (currently empty).

The folders above are reserved by `AGENTS.md` (`Engineering Rules` → "Keep frontend state and API calls in clear `lib/`, `pages/`, and `components/` boundaries"). Create them as soon as a feature needs them and document new files here.

## Top-level files

- **`main.tsx`** — Vite entry point. Order of operations:
  1. Imports `./lib/sentry` first so Sentry can capture errors thrown by later imports.
  2. Imports React and `react-dom/client`.
  3. Calls `init()` from `@telegram-apps/sdk-react` to initialize the SDK.
  4. Mounts the SDK pieces conditionally (`miniApp.mount`, `themeParams.mount`, `viewport.mount`). Each `*.mount.isAvailable()` guard skips mounting on platforms that do not support that piece. The `viewport.mount()` call is async; its rejection is caught and logged to keep the rest of the boot sequence alive.
  5. Imports `mockEnv.ts` so the dev environment is patched before `App` renders.
  6. Calls `miniApp.ready()` to tell the Telegram client that the Mini App finished loading.
  7. Renders `<App />` into `#root` inside `React.StrictMode`.
- **`App.tsx`** — application shell. Wraps React Query, `I18nProvider`, and `BrowserRouter`, runs Telegram login, syncs the active locale from `/auth/telegram` or `/me`, guards first-session onboarding, and routes Home, maps, research, fleet, colonies, profile, and planet detail pages.
- **`mockEnv.ts`** — runs in local `DEV` and in E2E preview mode (`VITE_E2E_MOCK_TELEGRAM=1`). Calls `retrieveLaunchParams()`; if it throws (i.e. we are running in a plain browser without Telegram), it constructs a deterministic fake `initDataRaw` and theme via `mockTelegramEnv` so the SDK behaves as if it were inside Telegram. The mocked user (`Andrew Rogue`, `id: 99281932`) is a stable fixture; do not commit additional users without coordinating with the auth-test fixtures.
- **`index.css`** — Tailwind base/components/utilities entry imported by `main.tsx`; keeps modal backdrops/sheets (`.bd-backdrop` / `.bd-sheet`) above the fixed bottom nav so research/build dialogs remain clickable on mobile, including grouped build-dialog category headers.
- **`dummy.test.ts`** — a Vitest sanity test that asserts a trivial expression. Replace with real tests as features land.
- **`../tests/e2e/onboarding.spec.ts`** — Playwright E2E for the onboarding flow (open TMA mock env, complete/skip tutorial, build first mine, assert resource tick-up in UI).
- **`../tests/e2e/first-day.spec.ts`** — Playwright E2E for the Cosmic Atlas first-day flow using stable `data-testid` selectors (`cosmic-topbar`, `planet-portrait`, `planet-rail`, `slot-{idx}`, `queue-strip`, `bnav-{id}`) across Home → PlanetDetail → BuildDialog → QueueStrip → Tech/Fleet/Galaxy navigation.

## `lib/`

- **`tech-tree.ts`** — `TECH_TREE_DATA` (levels **1–5** per branch, costs/times/descriptions/effects, including Energy and Weapons) and `BRANCHES` metadata imported from `@shared/config/researchCatalog` (same source as `backend/src/config/research-catalog.ts`).
- **`tech-tree.test.ts`** — asserts all research branches × five tiers stay aligned with `RESEARCH_MAX_LEVEL` for epic **P2-EPIC-RESEARCH** UI coverage.
- **`research-eligibility.ts`** — `evaluateResearchEligibility` mirrors `/research/start` lab + prerequisite checks for UI lock copy; optional `planetResources` adds resource-shortage messaging aligned with server deductions.
- **`research-queue.ts`** — `getActiveResearch()` and `researchStartBlockedByActive()` implement the frontend one-active-research queue rule.
- **`research-queue.test.ts`** — Vitest coverage for active-timer detection, due-row ignore behavior, and blocking another branch while one timer is active.
- **`fleet.ts`** — cargo/fleet helper module. `isCargoTransferShipType()` and `isCargoTransferShip()` keep only logistics ships in cargo-transfer flows, while `formatCargoTransferError()` converts known server cargo errors into localized dictionary keys.
- **`fleet.test.ts`** — Vitest coverage for logistics-only cargo filtering and mapped cargo-transfer server errors.
- **`ship-build-eligibility.ts`** — local planner helper that returns the first ship build blocker (`missingBuilding` or `insufficientResource`) for localized shipyard rows.
- **`ship-build-eligibility.test.ts`** — Vitest coverage for lightweight-transporter L2 shipyard and resource availability checks.
- **`production.ts`** — `defaultProductionRecipeId`, `canStartProduction`, and `productionBlockedText` keep production dialog controls deterministic and translate structured server block reasons.
- **`production.test.ts`** — Vitest coverage for production helper selection, disabled state, and localized block messages.
- **`timers.ts`** — pure local timer helpers for countdown/progress snapshots and compact duration labels. Network synchronization stays in hooks (`useMe`, `useShipQueue`) and fires at due timestamps, not every UI tick.
- **`timers.test.ts`** — Vitest coverage for exact timestamp progress, derived start fallback, and due-state clamping.
- **`api.ts`** — Unified fetch client. Automatically injects `X-Telegram-Init-Data` from the SDK, `Authorization: Bearer <token>` when a session is active, and `Accept-Language` from the persisted UI locale.
- **`i18n.tsx`** — React locale context/provider over the EN/RU JSON dictionaries, with persisted locale switching and `t(key, params?)`.
- **`locale.ts`** — reads/writes the persisted UI locale (`nu_preferred_locale`, plus legacy `ui_locale`) and normalizes Telegram/header values through the shared locale contract.
- **`locale.test.ts`** — Vitest coverage for `normalizeLocale`.
- **`sentry.ts`** — initializes `@sentry/react` only when `import.meta.env.VITE_SENTRY_DSN` is present.
 Uses `browserTracingIntegration` and `replayIntegration` with `replaysSessionSampleRate: 0.1` and `replaysOnErrorSampleRate: 1.0`, sets `tracesSampleRate: 1.0`, and reports `import.meta.env.MODE` as the environment. The module exports the `Sentry` namespace so error-boundary or `Sentry.captureException` calls can import directly from here.

## Adding a feature to the frontend

1. Place fetch and persistence helpers in `frontend/src/lib/` (TanStack Query hooks, Zustand stores, fetcher functions).
2. Place page-level components in `frontend/src/pages/` and presentational components in `frontend/src/components/`.
3. Add the route to `App.tsx` (or `pages/App.tsx` once it is moved out) using `react-router-dom`.
4. If the feature talks to the backend, define the request/response types in [`shared/types/`](../../shared/README.md) and import them on both ends.
5. Add a Vitest test for any non-trivial logic and update this README to describe the new file.

## Verification commands

`frontend/package.json` defines:

- `npm run dev` — Vite dev server on port `5173` (Compose passes `--host 0.0.0.0`).
- `npm run build` — `tsc && vite build`.
- `npm run preview` — Vite preview of the production build.
- `npm run lint` — ESLint over `*.ts,*.tsx`.
- `npm test` — Vitest run.
- `npm run test:e2e` — Playwright end-to-end run (`frontend/playwright.config.ts`, tests under `frontend/tests/e2e/`). On GitHub, Playwright runs from `.github/workflows/e2e.yml` only after manual dispatch or when the PR has label **`run-e2e`**, not from the default `ci.yml`; locally use `RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh` for the same combined gate.
