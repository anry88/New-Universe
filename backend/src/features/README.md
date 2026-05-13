# `backend/src/features` directory

Feature modules group business logic, route handlers, and tests for one bounded context. The convention mirrors what `AGENTS.md` requires: keep handlers thin, push reusable behavior into a `service.ts` class/module, and write a co-located test file (e.g. `auth.test.ts`, `home-system-generator.test.ts`) before reporting a feature complete.

Each subfolder is a single feature and is wired into Fastify from `backend/src/index.ts`. Add a new feature by creating `backend/src/features/<name>/{routes.ts,service.ts,<name>.test.ts}` and `app.register(<name>Routes, { prefix: '/<name>' })` in `index.ts`. When the feature is a single action module instead of a long-lived service class, keep the domain logic in that named file and document the exception locally.

## `jump-gate/`

Private Home System Jump Gate state.

- **`README.md`** — [Jump Gate state documentation](./jump-gate/README.md).
- **`routes.ts`** — `jumpGateRoutes(app)` registers `GET /jump-gate/state`, `POST /jump-gate/random-jump`, and `POST /jump-gate/destinations/:systemId/jump` for authenticated clients; Jump Gate mutations declare rate-limit/security metadata and JSON schemas for body/params.
- **`service.ts`** — `getJumpGateState(userId)` derives unlock from completed `jump_drive >= 1`, creates/updates the player's `jump_gates` row when unlocked, returns the outer-orbit home anchor, calibration state, random-jump availability, and discovered public destination summaries with registry source/last-visited metadata.
- **`service.test.ts`** — asserts locked/unlocked state, unfinished research staying locked, persistence creation, public destination filtering, and calibration finalization.

## `buildings/`

Planet infrastructure management.

- **`routes.ts`** — registers `GET /types`, `POST /build`, `POST /upgrade`, **`POST /resource`** for post-build extractor target changes, `POST /demolish`, `POST /sync/:planetId`, `GET /queue`, **`POST /rush`**.
- **`service.ts`** — handles building logic, shared L10 / Command Center upgrade caps, L6+ extra material costs, queueing, **`rushQueuedBuilding`**, demolish, sync/finalize helpers, selected-resource passive regen and post-build retargeting for extractors such as mines, drills, oil pumps, and biomass harvesters with per-resource deposit limits/rates, plus energy storage/generation sync for `battery`, `solar_plant`, `wind_turbine`, and `fuel_generator`.
- **`buildings.test.ts`**, **`rush.test.ts`**, etc. — integration tests for construction flows.

## `auth/`

Telegram-Mini-App authentication. The route layer delegates everything to `authService` and only translates between HTTP framing (header validation, cookie setting) and the service result.

- **`routes.ts`** — `authRoutes(app)` registers `POST /telegram` (mounted at `/auth` from `index.ts`, so the public path is `POST /auth/telegram`) with the auth-specific rate limit and `telegram-init-data` security metadata. The route uses `telegramAuthMiddleware` as a `preHandler`, so by the time the handler runs `request.user` is a verified `TelegramUser`. The handler:
  - Calls `authService.loginWithTelegram(request.user!)` and receives `{ user, token }`.
  - Builds a `Set-Cookie` value: `session=<token>; HttpOnly; Path=/; SameSite=Strict; Max-Age=<30 days>`. The `Secure` flag is added only when `NODE_ENV === 'production'`.
  - Returns the JSON `{ user, token }`.
- **`service.ts`** — `AuthService.loginWithTelegram(telegramUser)`:
  - Looks up `users` by `tgId` (converted to `bigint`).
  - If the user does not exist, opens a transaction (`db.transaction(...)`) and inserts the new row from `telegram.id`, `telegram.username`, `telegram.first_name`, initializes **`preferredLocale`** from Telegram `language_code` (`ru*` → `ru`, otherwise `en`), seeds **`diamonds`** with `env.DIAMOND_STARTING_GRANT`, then immediately calls `generateHomeSystem(newUser.id, tx)` so registration plus world bootstrap commit atomically.
  - Throws `'Failed to create or find user'` if neither lookup nor insert produced a row (defensive guard against a malformed transaction result).
  - Signs a JWT with `{ userId: user.id }` using `env.JWT_SECRET` and a 30-day expiry.
  - Returns `{ user: { ...user, tgId: user.tgId.toString() }, token }`. The `tgId` is converted to a string because BigInt does not survive JSON serialization.
  - The exported singleton is `authService = new AuthService()`.
- **`auth.test.ts`** — Vitest suite covering the service in isolation: it asserts that an existing `tgId` is reused (no insert, no home-system generation), that a missing `tgId` triggers `users.insert` plus `generateHomeSystem`, and that the issued JWT verifies with `env.JWT_SECRET`.

## `bot/`

Telegram Bot logic and webhook handling.

- **`README.md`** — [Detailed bot documentation](./bot/README.md).
- **`service.ts`** — `BotService` singleton for processing Telegram updates.
- **`webhook.ts`** — Dispatcher for incoming Telegram updates.
- **`commands.ts`** — `handleStartCommand` and admin-only `/add_diamond` command handling (with allowlist and wallet updates).
- **`push.ts`** — `sendPush(userId, type, payload)` service to queue push notifications in the database.


## `multiplayer/`

Sector map visibility for Phase 3.

- **`README.md`** — [multiplayer/presence documentation](./multiplayer/README.md).
- **`presence.ts`** — `getSectorPresence(viewerId, sectorX, sectorY, sectorZ)` builds explicit home/colony/fleet/public-sector `SectorPresencePayload` markers for `GET /multiplayer/sectors/:sx/:sy/:sz/presence`, while `getSectorSystemAnchors(viewerId)` builds the Home/discovered/colony/fleet selector for `GET /multiplayer/systems`.
- **`presence.test.ts`** — asserts foreign homeworlds never appear and foreign colonies are masked.

## `me/`

Player state retrieval.

- **`routes.ts`** — `meRoutes(app)` registers `GET /me` and `PATCH /me/preferences`. Both require a valid JWT in the `Authorization: Bearer <token>` header. `GET /me` returns the database user record mapped to the `User` shared type (including `preferredLocale`), obfuscates undiscovered home planets, annotates discovered planets with `isColonized` so the UI can distinguish mapped bodies from buildable settlements, and includes only the current user's active expeditions so stale/foreign trails never leak into the map UI. `PATCH /me/preferences` accepts `{ preferredLocale }` (`en`/`ru`), declares mutation rate-limit/security metadata plus a JSON schema, and persists the player language preference for future sessions.
- **`online-sync.ts`** — active-session completion service used by `GET /me`. It finalizes due buildings, research, ship builds, production orders, expeditions, and colonizer arrivals for the current user with notification suppression so Telegram pushes remain an offline fallback.

## `buildings/`

Building construction and queue management. [Detailed documentation](./buildings/README.md).

- **`routes.ts`** — `buildingsRoutes(app)` registers mutation-rate-limited, JSON-schema-validated building endpoints including `POST /buildings/build`, `POST /buildings/resource`, `POST /buildings/upgrade`, `POST /buildings/demolish`, `POST /buildings/sync/:planetId`, and `POST /buildings/rush`. Requires a valid JWT in the `Authorization: Bearer <token>` header. Build accepts `{ planetId, typeId, slotIndex, selectedResourceId? }`; retargeting accepts `{ buildingId, selectedResourceId }`.
- **`service.ts`** — `BuildingService.build(userId, { planetId, typeSlug })` performs the full build flow:
  1. Validates the planet exists and has an active settlement for the requesting user.
  2. Looks up the building type from the catalog.
  3. Checks that the planet has a free slot (`buildingCount < planet.slotCount`).
  4. Ensures the build queue is not full (max 1 concurrent build without premium).
  5. Verifies all dependency buildings exist at the required level.
  5a. Applies shared planet-specific gates: mines require metal deposits, drills require fluid/gas/ice deposits, oil pumps require oil, and biomass harvesters require biomass. Refineries are processors and can use either oil or methane recipes, so they are not tied to an oil deposit.
  6. Deducts resource costs via `spendResources` (from `features/resources/transactions.ts`).
  7. Creates a `buildings` row with `queueAction='build'` and `queueCompletesAt = now + baseTime`.
  8. Enqueues a BullMQ delayed job for completion (non-blocking; gracefully handles unavailable Redis).
  9. On queue completion, **`finalizeBuildingConstruction`** recomputes **`planet_resources.regenRate`** for resources the completed building can passively produce on that planet by summing producer levels and **inserts** a `planet_resources` row the first time that resource appears. Processors (`smelter`, `refinery`, `fabrication_bay`, `cryo_factory`) do not get passive crafted-resource regen; they use explicit production recipes.
- **`service.test.ts`** — Vitest integration suite covering the full build flow: successful mine construction, free-slot exhaustion (via direct DB insert), queue limit enforcement, missing auth, unknown building type, and non-existent planet.

## `resources/`

Resource accrual, transactions, conversion, and explicit production orders. [Detailed documentation](./resources/README.md).

- **`routes.ts`** — `resourcesRoutes(app)` registers `POST /convert`, `POST /buy-with-diamonds`, `GET /planets/:id`, and `/production/*` recipe/order endpoints (mounted at `/resources` from `index.ts`). JWT required for mutating endpoints; all public mutation routes carry mutation rate-limit/security metadata and JSON schemas for body or params. `POST /buy-with-diamonds` accepts `{ planetId, resourceId, amount }`; `POST /production/start` accepts `{ planetId, buildingId, recipeId, quantity }`.
- **`convert.ts`** — `convertResources(userId, { planetId, from, to, amount })` converts ice ↔ water on a player-owned planet. Validates planet ownership, checks for a `cryo_factory` building (level ≥ 1), then atomically spends the source resource plus stored `energy` before granting the target resource. Ice→water converts at 1:1; water→ice incurs a 5% loss (100 → 95). Also exports `buyResourceWithDiamonds` with rarity-aware pricing derived from `resources.tier` (`units-per-diamond` curve per tier), deducts `users.diamonds`, then credits `planet_resources`.
- **`wallet.ts`** — `grantDiamondsToUserByUsername` supports admin wallet updates by username.
- **`convert.test.ts`** — Vitest integration suite covering conversion flow plus buy-with-diamonds success and validation failures.
- **`accrual.ts`** — exports `computeCurrentResources(planetId, tx?)` which lazily computes current resource amounts without writing to the database. For each resource: `amount += regenRate × max(0, now - lastUpdateAt)`, so future timestamp skew does not subtract or mint stockpile balance. Respects `defaultStorageCap` from the `resources` table and applies research production/storage multipliers via `features/research/effects.ts`. Returns array of `{ resourceId, amount, regenRate, lastUpdateAt, storageCap }`.
  - Does NOT write to the database - this is a read-only computation for lazy updates.
  - Caps each resource amount at its `storageCap`.
  - Used by planet view and production features to show current state without constant DB writes.
- **`accrual.test.ts`** — Vitest coverage asserting: regen math (10/h for 1h → +10), storage cap enforcement, array of all planet resources, and multiple resources with different regen rates.
- **`transactions.ts`** — exports `spendResources(planetId, costs[], outerTx?)` and `gainResources(planetId, gains[], outerTx?)` for atomic resource transactions. When `outerTx` is omitted, opens its own transaction; when provided, participates in the caller's Drizzle transaction. Uses `SELECT FOR UPDATE` on `planet_resources` for row-level locking, including duplicate resource ids in the same cost list. Updates `lastUpdateAt` synchronously with spend/gain. Returns `{ success, balanceAfter }` or `{ success: false, error: "not enough X" }`.
  - Parallel calls do not lead to negative values (transaction isolation).
  - If resource is insufficient → transaction rolls back, nothing spent.
  - `lastUpdateAt` synced with spend/gain.
- **`transactions.test.ts`** — Vitest coverage asserting: successful spend, insufficient resource rollback, gain resources, sync `lastUpdateAt`, and multiple resource atomic handling.
- **`production.ts`** — `ProductionService` exposes recipe listing, preview, start, process listing, pause/resume, and due-row completion. It validates settled-planet ownership and building type, applies building/research modifiers to input quantities/durations, keeps material spend immediate, treats processor energy as active-process demand instead of an upfront resource input, stores `production_orders`, pauses queued rows on energy shortage, and grants outputs when worker or online sync processes due rows.
- **`production.test.ts`** — Vitest integration suite covering steel inputs, immediate material spend/deferred output, insufficient resources, building/research modifiers, electronics multi-input costs, oil-vs-methane fuel recipes, and energy pause/resume.

## `tutorial/`

Onboarding progression sync for first-time users.

- **`README.md`** — [Detailed tutorial documentation](./tutorial/README.md).
- **`routes.ts`** — `tutorialRoutes(app)` registers rate-limited `POST /tutorial/sync` (mounted at `/tutorial`) and returns persisted tutorial state for the current user.
- **`service.ts`** — `syncTutorialProgress(userId)` maps game actions to steps (`mine`, `storage`, `scout`, first `expedition`), persists `users.tutorialStepCompleted`, and grants one-time completion reward (`+200 iron`, `+100 water`) through `gainResources` (atomic resource transaction).
- **`tutorial.test.ts`** — integration coverage for completion + one-time reward behavior.

## `expeditions/`

Ship launch and travel scheduling. [Detailed documentation](./expeditions/README.md).

- **`routes.ts`** — `expeditionsRoutes(app)` registers mutation-rate-limited and JSON-schema-validated launch endpoints:
  - `POST /` — launches a local expedition to a route point or a Jump Gate route to a known public destination. Local mode accepts `{ shipId, targetX, targetY, targetZ, cargoLoaded }`; `routeMode='jump_gate'` accepts `{ shipId, destinationSystemId, cargoLoaded, targetPlanetId? }`, server-resolves the destination sector from `discovered_systems`, deducts Jump Fuel from the ship tank, and never accepts arbitrary cross-system coordinates. `targetPlanetId` is valid for recon survey targets and required for colonizer deployments to discovered planets; same-system targeted launches use shared system-map planet distance, while logistics ships are rejected and must use `/cargo/transfer`.
  - `POST /jump` — deprecated-compatible Jump Gate entry point using `{ shipId, mode: 'random' }` or `{ shipId, destinationSystemId }`; legacy manual `targetSector` requests are rejected.
- **`launch.ts`** — `launchExpedition(userId, request)` validates ship ownership and idle state, rejects logistics ships from generic expeditions, checks the launch planet has enough cargo stock, computes and spends fuel, creates an `expeditions` row with `status='in_flight'`, updates the ship to `moving`, computes `eta = distance × 60 / speed × engine_factor`, and enqueues the delayed BullMQ job. Effective speed is resolved through `features/research/effects.ts`; same-system target-planet launches derive distance from `@shared/format/systemMapLayout`, Jump Gate launches derive distance from the selected known public destination, and colonizer launches are one-way and must pass colonization gates before launch.
- **`jump.ts`** — `jumpShip(userId, request, options?)` handles specialized Jump Ship teleportation. Checks for unlocked Jump Gate state, deducts 50 fuel from the ship's internal tank, chooses server-authoritative random sectors or known `destinationSystemId` targets, lazily generates common-pool sectors, excludes protected Home Systems, and upserts system-level known destination records without revealing all planets.
- **`launch.test.ts`** — Vitest integration suite covering the happy path, Jump Gate scout/colonizer routes, protected Home System rejection, non-idle ship rejection, insufficient fuel, and missing auth.
- **`jump.test.ts`** — Vitest integration suite for the jump feature.

## `world/`

Procedural world generation primitives and visibility checks. Contains the home-system seeder used by `auth/service.ts`, sector pool management, and the fog-of-war visibility service.

- **`biomes.ts`** — exports the `BiomeType` union (`'rocky' | 'ocean' | 'gas_giant' | 'ice' | 'volcanic' | 'green' | 'anomaly'`), a `BIOMES` map keyed by biome id (`commonResources`, `rareResources`, `bonuses`, `penalties`), and **`HOME_SYSTEM_BASE_BIOMES`** — the six starter biomes (`green`, `rocky`, `ocean`, `ice`, `gas_giant`, `volcanic`) each guaranteed once per generated home system (capital stays `green`; keep `tools/balance-sim` mirrors aligned). Ice planets no longer roll biomass deposits; volcanic worlds carry hot mineral/sulfur deposits without frozen-water rares.
- **`home-system-generator.ts`** — exports `generateHomeSystem(userId, tx?)`, **`MIN_HOME_CAPITAL_SLOT_COUNT`** (minimum building slots on planet 1 / capital), deterministic PRNG helpers `hashString` / `createRandom`, and English-canonical `systems.name` plus `{shortTag}-N` planet codes via `@shared/format/homeSystemNaming`.
  - Uses `tx` from auth or opens `db.transaction`; idempotent when a home `systems` row already exists.
  - Derives deterministic seeds from `userId` plus validated `env.SERVER_SECRET` so production home-system RNG is controlled by secret storage instead of a feature-level `process.env` fallback.
  - Seeds sector coords `[-500,500]`, system `seed`, `name = "Home System <userId-prefix>"`.
  - Generates **9** planets from the fixed `HOME_PLANET_ORBIT_PLAN`: two volcanic inner worlds, two rocky resource worlds, ocean world, green capital in a deeper habitable orbit, gas giant, and two outer ice worlds.
  - Capital (planet index 0): biome **`green`**, larger size, **`slotCount ≥ MIN_HOME_CAPITAL_SLOT_COUNT`** for early tutorial + shipyard chain.
  - Other planets: sizes follow biome size classes; non-capital resources are hand-authored per orbit so titanium/tritium/ice/sulfur/copper/aluminum exist locally while rare/extreme biomes stay rare.
  - Filters forbidden tier-3/tier-4 richness ids; seeds `richness` + starter `planet_resources` stockpiles with `regenRate = 0` until extractor buildings complete; planet 0 gets `command_center` + **only planet 0** in `discovered_planets` (other home bodies stay locked until a recon expedition route passes through their system-map visibility corridor — see `visibility.ts` / `workers/tick-expeditions.ts`).
  - Returns the new `systems.id`.
- **`sectors.ts`** — exports `getOrCreateSector(x, y, z)` which returns an existing sector or creates a new one with a deterministic seed. Used by jump and exploration features to lazily initialize world regions. The seed is computed via `hashString` of the coordinate triple, ensuring determinism across server restarts.
- **`sector-generator.ts`** — exports `generateSystemsInSector(sector, targetCount?)` which lazily generates missing systems within a sector. Uses the sector's seed for deterministic generation, respects the 12-system maximum per sector, ensures minimum 50-unit distance between systems, and distributes planet biomes by GDD weights (`getBiomeByWeight`, `generateSystemPosition`). Systems in the common pool have `ownerId=null` and `isHome=false`.
- **`visibility.ts`** — exports `checkVisibility(shipId, tx?, overrideCoords?)` which resolves the ship's sensor-augmented range, finds candidate systems in an **XY bounding square**, applies **planar** sector distance (Z ignored), skips **foreign** home systems, and inserts new `discovered_systems` / `discovered_planets` rows. **Does not auto-insert undiscovered planets that belong to the player's own home system**; home bodies unlock from the flat route-corridor scan in `workers/tick-expeditions.ts`.
- **`visibility.test.ts`** — Vitest coverage for range, deduping, foreign-home suppression, discovery batches, 3D distance, and **locked home bodies staying hidden from passive sensors**.
- **`home-system-generator.test.ts`** — Vitest coverage for determinism, starter resource coverage, zero passive regen before extractors, **full home biome set + capital slots**, fixed 9-planet starter composition, visual orbit sorting, size spread, and tier restrictions.

## `research/`

Tech tree definitions and starting research on a planet.

- **`data.ts`** — exports `TECH_TREE` and `getResearchDef(branch, level)` backed by **`shared/config/researchCatalog.ts`** (eight branches × **five** tiers); building prerequisites use catalog id `lab`, and all research costs use seeded resource ids (`iron`, `silicon`, `tritium`, ...).
- **`gates.ts`** — progression gates: `loadUserResearchLevels(userId, db)`, `meetsResearchRequirement`, and `assertResearchRequirement` enforce unlock rules from `config/research-unlocks.ts` for buildings, ships, colonization, cargo routes, and jump drive.
- **`completion.ts`** — `processCompletedResearch(db, options?)` scans due `research_progress` rows (`completes_at <= now`), optionally scoped to one user, increments `level` exactly once per completion, clears the timer, calls `invalidateResearchEffectsCache`, and inserts a `research_done` notification unless active-session sync passed `skipNotification`.
- **`effects.ts`** — typed research-effects engine with deterministic stacking. Exports `getResearchEffectsForUser(userId)` plus apply helpers for production, storage, energy generation/storage/efficiency, ship speed, sensor range, and build time. Exports `invalidateResearchEffectsCache(userId)` as a hook after tier completions (no-op until memoization exists).
- **`effects.test.ts`** — unit tests for deterministic composition and stacked resource/ship/sensor/build-time effects.
- **`routes.ts`** — registers mutation-rate-limited and JSON-schema-validated `POST /start` and **`POST /rush`** (mounted at `/research` from `index.ts`). Start first finalizes due research for the active user, locks the user row, enforces the one-active-research queue rule across all branches, validates planet ownership, prerequisite research rows, lab building level (`buildings.typeId === 'lab'`), spends resources, and upserts `research_progress`; rush validates the active branch and delegates diamond spending to `rushActiveResearch`.
- **`rush.ts`** — `rushActiveResearch(userId, branch)` prices the remaining timer through `lib/diamonds`, atomically spends `users.diamonds`, increments the tier, clears `completesAt`, and invalidates research effects without creating a Telegram notification.
- **`research.test.ts`** — integration test for `POST /research/start`; creates a user and inserts a `lab` at **`slotIndex: 1`** (slot `0` is reserved for the seeded `command_center`), starts mining tier 1 research, and asserts `iron`/`silicon` are atomically deducted from `planet_resources`.
- **`rush.test.ts`** — integration tests for research rush success and insufficient-diamond rollback.
- **`gates.test.ts`** — unit coverage for research level maps, requirement checks, and unlock assertions.
- **`completion.test.ts`** — asserts single completion, idempotent ticks, future-dated timers ignored, effects multiplier change, notification creation, and online scoped completion without notification.

## `ships/`

Ship construction and fleet queue helpers.

- **`build.ts`** — `buildShip`, `getShipQueue`, `rushShipBuild`, and `syncReadyShips(userId?, options?)`. Queue payloads include server-derived `queueStartedAt`; `syncReadyShips` can be scoped to the active user and suppress stale pending `ship_done` notifications.
- **`routes.ts`** — registers `GET /types`, JSON-schema-validated `POST /build`, `GET /queue`, and JSON-schema-validated `POST /rush`; ship mutations declare rate-limit/security metadata. Queue reads run user-scoped `syncReadyShips(..., { skipNotifications: true })` before returning the current queue.
- **`build.test.ts`** — integration coverage for ship construction gates and active-session ready-ship sync.

## Shared feature helpers

- **`timers.ts`** — server-side derivation helpers for timer metadata (`queueStartedAt` / `startedAt`) from catalog durations and completion timestamps, used by `/me`, `/buildings/queue`, and `/ships/queue`.

## `colonies/`

Player colonies and settled planets.

- **`colonies.ts`** — `ColonyService` singleton. Implements colonization rules: checks for discovery, protects foreign home systems, allows the player's own discovered home bodies to be settled by colonizer, enforces per-player limits (default 5), and inserts into the `colonies` table.
- **`found-colony.ts`** — `foundColony(userId, shipId, planetId)` action module. Performs role validation, consumes the colonizer ship, establishes the colony, and builds the initial Command Center.
- **`ownership.ts`** — settlement ownership helpers used by buildings/ships/workers to distinguish discovered planets from buildable settlements.
- **`bootstrap.ts`** — `bootstrapColony(planetId, tx?)` action module. Initializes starting stock and known deposit rows for a new colony with `regenRate = 0` until extractors are built.
- **`colonies.test.ts`** — integration tests for colonization rules.
- **`found-colony.test.ts`** — integration tests for the founding flow.
- **`bootstrap.test.ts`** — integration tests for economy initialization.

## `logistics/`

Interplanetary cargo transfers. [Detailed documentation](./logistics/README.md).

- **`cargo-transfer.ts`** — `launchCargoTransfer(userId, request)` action module. Validates settlement ownership including the home capital, logistics ship role, multi-load capacity, and planet state; reserves aggregated resources atomically; creates a one-way `expeditions` record with type `cargo_transfer`; enqueues a BullMQ `arrive_cargo` job and shares `completeCargoTransfer` with active-session expedition sync. Completion conditionally claims only active cargo rows before delivery so duplicate or concurrent workers skip already-settled cargo.
- **`cargo-transfer.test.ts`** — integration tests for the cargo transfer flow.

## Adding a new feature module

1. Pick a kebab-case folder name that matches the bounded context (`buildings`, `expeditions`, `research`, …).
2. Create `routes.ts` with `export async function <name>Routes(app: FastifyInstance) { ... }` and register it from `backend/src/index.ts` with the appropriate prefix.
3. Move all DB and domain logic into `service.ts` (typically a class plus an exported singleton). If the feature is a single-operation module, keep the logic in the named action file and call it from the route. Inject `db` and any tx via parameters so the domain code stays testable.
4. Co-locate `<name>.test.ts` and run `npm test` before committing.
5. Update this README and [`backend/src/README.md`](../README.md) to describe the new module.
