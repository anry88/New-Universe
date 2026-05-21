# `backend/src/features` directory

Feature modules group business logic, route handlers, and tests for one bounded context. The convention mirrors what `AGENTS.md` requires: keep handlers thin, push reusable behavior into a `service.ts` class/module, and write a co-located test file (e.g. `auth.test.ts`, `home-system-generator.test.ts`) before reporting a feature complete.

Each subfolder is a single feature and is wired into Fastify from `backend/src/index.ts`. Add a new feature by creating `backend/src/features/<name>/{routes.ts,service.ts,<name>.test.ts}` and `app.register(<name>Routes, { prefix: '/<name>' })` in `index.ts`. When the feature is a single action module instead of a long-lived service class, keep the domain logic in that named file and document the exception locally.

## `jump-gate/`

Private Home System Jump Gate state.

- **`README.md`** — [Jump Gate state documentation](./jump-gate/README.md).
- **`routes.ts`** — `jumpGateRoutes(app)` registers `GET /jump-gate/state`, `POST /jump-gate/random-jump`, and `POST /jump-gate/destinations/:systemId/jump` for authenticated clients; Jump Gate mutations declare rate-limit/security metadata and JSON schemas for body/params.
- **`service.ts`** — `getJumpGateState(userId)` derives unlock from completed `jump_drive >= 1`, creates/updates the player's `jump_gates` row when unlocked, returns the outer-orbit home anchor, calibration state, random-jump availability, and discovered public destination summaries with deterministic seed plus registry source/last-visited metadata. Live tactical contact state is intentionally outside this API.
- **`service.test.ts`** — asserts locked/unlocked state, unfinished research staying locked, persistence creation, public destination filtering, destination summaries without tactical contacts, and calibration finalization.

## `systems/`

System-scoped read models that do not belong to the Jump Gate lifecycle.

- **`README.md`** — [System tactical-state documentation](./systems/README.md).
- **`routes.ts`** — `systemsRoutes(app)` registers authenticated `GET /systems/:systemId/tactical-state`.
- **`tactical-state.ts`** — `getSystemTacticalState(userId, systemId)` checks that the requested system is visible to the viewer, then returns that system's Jump Gate fleet contacts in `in_flight` / `returning` / `stationed` states with `relation: "self" | "foreign"`, `visibility: "full" | "summary"`, safe foreign owner aliases, hull type, HP, combat stats, recent-combat timestamp, status, point coordinates, and optional movement vector for the tactical map.
- **`tactical-state.test.ts`** — asserts per-system contact scoping, self/foreign relation separation, moving point-to-point contact projection, and undiscovered-system protection.

## `buildings/`

Planet infrastructure management.

- **`routes.ts`** — registers `GET /types`, `POST /build`, `POST /upgrade`, **`POST /resource`** for post-build extractor target changes, `POST /demolish`, `POST /sync/:planetId`, `GET /queue`, **`POST /rush`**.
- **`service.ts`** — handles building logic, shared L10 / Command Center upgrade caps, L6+ extra material costs, queueing, **`rushQueuedBuilding`**, demolish, sync/finalize helpers, selected-resource passive regen and post-build retargeting for extractors such as mines, drills, oil pumps, and biomass harvesters with per-resource deposit limits/rates, plus energy storage/generation sync for `battery`, `solar_plant`, `wind_turbine`, and `fuel_generator`. Build/upgrade mutations persist Postgres queue rows first, then use the shared `completion-queue.ts` producer to optionally wake BullMQ without request-time Redis/Queue creation.
- **`completion-queue.ts`**, **`buildings.test.ts`**, **`completion-queue.test.ts`**, **`rush.test.ts`**, etc. — shared completion enqueue helper plus integration/unit tests for construction flows and BullMQ hot-path behavior.

## `auth/`

Telegram-Mini-App authentication. The route layer delegates everything to `authService` and only translates between HTTP framing (header validation, cookie setting) and the service result.

- **`routes.ts`** — `authRoutes(app)` registers `POST /telegram` (mounted at `/auth` from `index.ts`, so the public path is `POST /auth/telegram`) with the auth-specific rate limit and `telegram-init-data` security metadata. The route uses `telegramAuthMiddleware` as a `preHandler`, so by the time the handler runs `request.user` is a verified `TelegramUser`. The handler:
  - Calls `authService.loginWithTelegram(request.user!, { registrationSourceCode })` and receives `{ user, token }` plus internal registration metadata.
  - Emits `user_registered` only when a new `users` row was created, including the sanitized registration source/type for acquisition analysis.
  - Builds a `Set-Cookie` value: `session=<token>; HttpOnly; Path=/; SameSite=Strict; Max-Age=<30 days>`. The `Secure` flag is added only when `NODE_ENV === 'production'`.
  - Returns the JSON `{ user, token }`.
- **`service.ts`** — `AuthService.loginWithTelegram(telegramUser)`:
  - Looks up `users` by `tgId` (converted to `bigint`).
  - If the user does not exist, resolves a sanitized Telegram referral code from `initData.start_param` or the pending `/start <code>` table, opens a transaction (`db.transaction(...)`) and inserts the new row from `telegram.id`, `telegram.username`, `telegram.first_name`, initializes **`registrationSource`** (`direct` or `telegram_start`) and **`registrationSourceCode`**, initializes **`preferredLocale`** from Telegram `language_code` (`ru*` → `ru`, otherwise `en`), seeds **`diamonds`** with `env.DIAMOND_STARTING_GRANT`, then immediately calls `generateHomeSystem(newUser.id, tx)` and consumes any pending referral row so registration plus world bootstrap commit atomically.
  - Existing users are returned as-is; login never overwrites their original registration source.
  - Throws `'Failed to create or find user'` if neither lookup nor insert produced a row (defensive guard against a malformed transaction result).
  - Signs a JWT with `{ userId: user.id }` using `env.JWT_SECRET` and a 30-day expiry.
  - Returns `{ user, token }` plus internal `{ createdUser, registrationSource }` metadata for route analytics. `tgId` is converted to a string because BigInt does not survive JSON serialization; registration-source fields stay out of the public user payload.
  - The exported singleton is `authService = new AuthService()`.
- **`registration-source.ts`** — validates Telegram start/referral codes (`[A-Za-z0-9_-]`, max 64 chars), records pending `/start <code>` values for Telegram actors that do not yet have a user row, and normalizes direct-vs-Telegram-start source metadata used by auth.
- **`auth.test.ts`** — Vitest suite covering the service in isolation: it asserts that an existing `tgId` is reused (no insert, no home-system generation), that a missing `tgId` triggers `users.insert` plus `generateHomeSystem`, and that the issued JWT verifies with `env.JWT_SECRET`.

## `bot/`

Telegram Bot logic and webhook handling.

- **`README.md`** — [Detailed bot documentation](./bot/README.md).
- **`service.ts`** — `BotService` singleton for processing Telegram updates.
- **`webhook.ts`** — Dispatcher for incoming Telegram updates.
- **`commands.ts`** — `handleStartCommand`, admin-only `/add_diamond`, and Telegram Stars support commands (`/paysupport`, `/answer`, `/refund`, `/reject`, `/ask`) with admin-chat authorization and localized player replies. `/start` also clears `users.telegram_notifications_blocked_at`, because an incoming command proves the bot is no longer blocked for that Telegram user, and stores a sanitized deep-link referral code for not-yet-registered Telegram actors without changing existing user rows.
- **`push.ts`** — `sendPush(userId, type, payload)` service to queue push notifications in the database.

## `monetization/`

Telegram Stars diamond-pack monetization.

- **`README.md`** — [Detailed monetization documentation](./monetization/README.md).
- **`routes.ts`** — `monetizationRoutes(app)` registers authenticated `GET /monetization/stars/packs`, mutation-rate-limited `POST /monetization/stars/invoice` for Stars invoice-link creation, and `POST /monetization/stars/checkout-result` so the Mini App can confirm a specific paid checkout and receive the delivered diamond balance.
- **`service.ts`** — shared Stars logic for pack listing, invoice payloads with checkout ids, checkout-attempt persistence for observability, pre-checkout validation, idempotent successful-payment delivery, explicit checkout confirmation/recovery from Telegram transaction history with current diamond balance for already-delivered checkouts, transaction-history reconciliation for missed payments, `/paysupport` request storage, admin refund/reject/ask operations, Bot API `refundStarPayment`, and refund diamond reversal.
- **`monetization.test.ts`** — pack-ladder, invoice, payment idempotency, checkout confirmation/recovery, missed-payment reconciliation, support request, and refund coverage.

## `multiplayer/`

Sector map visibility for Phase 3.

- **`README.md`** — [multiplayer/presence documentation](./multiplayer/README.md).
- **`presence.ts`** — `getSectorPresence(viewerId, sectorX, sectorY, sectorZ)` builds explicit home/colony/fleet/public-sector `SectorPresencePayload` markers for `GET /multiplayer/sectors/:sx/:sy/:sz/presence`, including non-destroyed docked, stationed, and active `in_flight`/`returning` fleet positions with movement vectors/recent-combat timestamps for live sector radar, while `getSectorSystemAnchors(viewerId)` builds the Home/discovered/colony/fleet selector for `GET /multiplayer/systems`.
- **`presence.test.ts`** — asserts foreign homeworlds never appear and foreign colonies are masked.

## `me/`

Player state retrieval.

- **`routes.ts`** — `meRoutes(app)` registers `POST /me/session/start`, `GET /me`, and `PATCH /me/preferences`. All require a valid JWT in the `Authorization: Bearer <token>` header. `POST /me/session/start` opens a new explicit online-session baseline for aggregate play-time metrics; later visible frontend requests carry the shared online-activity header and are counted by the application hook. `GET /me` returns the database user record mapped to the `User` shared type (including `preferredLocale` and normalized `notificationPreferences`), obfuscates undiscovered home planets, annotates discovered planets with `isColonized` so the UI can distinguish mapped bodies from buildable settlements, includes only the current user's active expeditions (including `stationed` Jump Gate point deployments) so stale/foreign trails never leak into the map UI, and uses batched request-scoped resource/energy/research snapshots for visible planets. `PATCH /me/preferences` accepts `{ preferredLocale?, notificationPreferences? }`, declares mutation rate-limit/security metadata plus a JSON schema, and persists the player language and Telegram notification category preferences for future sessions.
- **`online-sync.ts`** — active-session completion service used by `GET /me`. It finalizes due buildings, research, ship builds, production orders, expeditions, and colonizer arrivals for the current user with notification suppression so Telegram pushes remain an offline fallback. It deliberately does not run combat damage; combat is advanced only by the worker tick.

## `buildings/`

Building construction and queue management. [Detailed documentation](./buildings/README.md).

- **`routes.ts`** — `buildingsRoutes(app)` registers mutation-rate-limited, JSON-schema-validated building endpoints including `POST /buildings/build`, `POST /buildings/resource`, `POST /buildings/upgrade`, `POST /buildings/demolish`, `POST /buildings/sync/:planetId`, and `POST /buildings/rush`. Requires a valid JWT in the `Authorization: Bearer <token>` header. Build accepts `{ planetId, typeId, slotIndex, selectedResourceId? }`; build/upgrade responses include full queue metadata (`planetId`, `buildingTypeId`, `queueStartedAt`, `queueCompletesAt`, `rushCost`) for optimistic UI replacement; retargeting accepts `{ buildingId, selectedResourceId }`.
- **`service.ts`** — `BuildingService.build(userId, { planetId, typeSlug })` performs the full build flow:
  1. Validates the planet exists and has an active settlement for the requesting user.
  2. Looks up the building type from the catalog.
  3. Checks that the planet has a free slot (`buildingCount < planet.slotCount`).
  4. Ensures the build queue is not full (max 1 concurrent build without premium).
  5. Verifies all dependency buildings exist at the required level.
     5a. Applies shared planet-specific gates: mines require solid mineral deposits (including ice), drills require gas deposits, oil pumps require oil or methane, and biomass harvesters require water or biomass. Refineries are processors and can use either oil or methane recipes, so they are not tied to an oil deposit.
  6. Deducts resource costs via `spendResources` (from `features/resources/transactions.ts`).
  7. Creates a `buildings` row with `queueAction='build'` and `queueCompletesAt = now + baseTime`.
  8. After the transaction commits, optionally schedules a BullMQ delayed job through the shared `completion-queue.ts` producer when `ENABLE_BULLMQ=true`; otherwise the periodic Postgres worker and active-session sync finalize due rows.
  9. On queue completion, **`finalizeBuildingConstruction`** recomputes **`planet_resources.regenRate`** for resources the completed building can passively produce on that planet by summing producer levels and **inserts** a `planet_resources` row the first time that resource appears. Processors (`smelter`, `refinery`, `fabrication_bay`, `cryo_factory`) do not get passive crafted-resource regen; they use explicit production recipes.
- **`service.test.ts`** — Vitest integration suite covering the full build flow: successful mine construction including ice targeting, free-slot exhaustion (via direct DB insert), queue limit enforcement, missing auth, unknown building type, and non-existent planet.

## `resources/`

Resource accrual, transactions, conversion, and explicit production orders. [Detailed documentation](./resources/README.md).

- **`routes.ts`** — `resourcesRoutes(app)` registers `POST /convert`, `POST /buy-with-diamonds`, `GET /planets/:id`, and `/production/*` recipe/order endpoints (mounted at `/resources` from `index.ts`). JWT required for mutating endpoints; all public mutation routes carry mutation rate-limit/security metadata and JSON schemas for body or params. `POST /buy-with-diamonds` accepts `{ planetId, resourceId, amount }`; `POST /production/start` accepts `{ planetId, buildingId, recipeId, quantity }`, including refinery `jump_fuel` production from starter-system inputs.
- **`convert.ts`** — `convertResources(userId, { planetId, from, to, amount })` converts ice ↔ water on a player-owned planet. Validates planet ownership, checks for a `cryo_factory` building (level ≥ 1), then atomically spends the source resource plus stored `energy` before granting the target resource. Ice→water converts at 1:1; water→ice incurs a 5% loss (100 → 95). Also exports `buyResourceWithDiamonds` with rarity-aware pricing derived from `resources.tier` (`units-per-diamond` curve per tier), deducts `users.diamonds`, then credits `planet_resources`.
- **`wallet.ts`** — `grantDiamondsToUserByUsername` supports admin wallet updates by username.
- **`convert.test.ts`** — Vitest integration suite covering conversion flow plus buy-with-diamonds success and validation failures.
- **`accrual.ts`** — exports `loadPlanetResourceSnapshot(planetId, tx?)`, `computeCurrentResourcesFromSnapshot(snapshot)`, and compatibility helper `computeCurrentResources(planetId, tx?)`. The snapshot path lazily computes current resource amounts without writing to the database and reuses the same energy/research/building snapshot inside `/me` and `/resources/planets/:id`. For each resource: `amount += regenRate × max(0, now - lastUpdateAt)`, so future timestamp skew does not subtract or mint stockpile balance. Respects `defaultStorageCap` from the `resources` table and applies research production/storage multipliers via `features/research/effects.ts`. Returns array of `{ resourceId, amount, regenRate, lastUpdateAt, storageCap }`.
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
- **`production.test.ts`** — Vitest integration suite covering steel inputs, immediate material spend/deferred output, insufficient resources, building/research modifiers, electronics multi-input costs, oil-vs-methane fuel recipes, refinery Jump Fuel, and energy pause/resume.

## `tutorial/`

Onboarding progression sync for first-time users.

- **`README.md`** — [Detailed tutorial documentation](./tutorial/README.md).
- **`routes.ts`** — `tutorialRoutes(app)` registers rate-limited `POST /tutorial/sync` and `POST /tutorial/claim` (mounted at `/tutorial`) and returns persisted tutorial state for the current user.
- **`service.ts`** — `syncTutorialProgress(userId)` maps game actions to steps (`mine`, `storage`, `scout`, scout sent), persists `users.tutorialStepCompleted`, and leaves rewards untouched until `claimTutorialReward(userId, stepId)` grants a one-time 100-diamond reward for each of the five tutorial steps.
- **`tutorial.test.ts`** — integration coverage for sync-only progress, one-time diamond claims, and completion after all five rewards are claimed.

## `expeditions/`

Ship launch and travel scheduling. [Detailed documentation](./expeditions/README.md).

- **`routes.ts`** — `expeditionsRoutes(app)` registers mutation-rate-limited and JSON-schema-validated launch endpoints:
  - `POST /` — launches a local expedition to a route point or a Jump Gate route to a known public destination. Local mode accepts `{ shipId, targetX, targetY, targetZ, cargoLoaded, fuelLoaded?, jumpFuelLoaded? }`; `routeMode='jump_gate'` accepts `{ shipId, destinationSystemId, cargoLoaded, fuelLoaded?, jumpFuelLoaded?, targetPlanetId?, targetSystemX?, targetSystemY? }`, server-resolves the destination sector from `discovered_systems`, deducts stored `jump_fuel` from the launch planet, and never accepts arbitrary cross-system coordinates. Jump Gate routes are available to every non-logistics ship: non-colonizers without a selected planet require a destination-system point, return-trip scouts pay two Jump Fuel gate costs, and combat/support/shield/missile gate routes are one-way point deployments. Jump Gate colonizer launches skip the local colony-distance gate while still requiring a discovered target planet; same-system targeted launches use shared system-map planet distance, while logistics ships are rejected and must use `/cargo/transfer`.
  - `POST /jump` — deprecated-compatible Jump Gate entry point using `{ shipId, mode: 'random' }` or `{ shipId, destinationSystemId }`; legacy manual `targetSector` requests are rejected. Random discovery returns queue metadata because the new system opens on probe arrival at the Home Gate.
- **`launch.ts`** — `launchExpedition(userId, request)` validates ship ownership and idle state, rejects logistics ships from generic expeditions, checks the launch planet has enough cargo stock, computes and spends ordinary `fuel`, spends stored `jump_fuel` for Jump Gate routes, applies optional ordinary/Jump Fuel tank top-up requests after the mission minimum, creates an `expeditions` row with `status='in_flight'`, updates the ship to `moving`, computes `eta = distance × 60 / speed × engine_factor`, and optionally enqueues a delayed BullMQ job when `ENABLE_BULLMQ=true`. Effective speed is resolved through `features/research/effects.ts`; same-system target-planet launches derive distance from `@shared/format/systemMapLayout`, Jump Gate launches derive distance from the selected known public destination, ordinary non-survey target-planet launches reserve a target `spaceport` slot under a row lock, return-trip launches reserve the origin slot until the ship returns, and one-way colonizer plus combat/support/shield/missile Jump Gate deployments free the origin slot after departure. Active colonizer deployments count as colonization cooldown blockers until arrival plus the normal cooldown window. Jump Gate colonizer launch/preflight disables only the colony-distance gate because the known destination and discovered planet are the range authority.
- **`jump.ts`** — `jumpShip(userId, request, options?)` handles Jump Gate travel. Random discovery requires an idle `recon_probe`, deducts 50 stored `jump_fuel`, grows the abstract Common Pool when empty, undersupplied for player count, exhausted by the player, or missing a first target without foreign ships, skips already-known and already-pending systems, queues a route from the probe's current planet to the Home Gate, records the selected public neutral destination only when the worker processes arrival, and consumes the probe on arrival. A player can open 5 public systems by random jumps before colonization, plus one extra random discovery for each opened public system where they have at least one active colony; known-destination jumps can move ordinary idle ships through an already opened gate route without revealing every planet.
- **`launch.test.ts`** — Vitest integration suite covering the happy path, Jump Gate scout/colonizer routes, protected Home System rejection, non-idle ship rejection, insufficient fuel, and missing auth.
- **`jump.test.ts`** — Vitest integration suite for the jump feature.

## `world/`

Procedural world generation primitives and visibility checks. Contains the home-system seeder used by `auth/service.ts`, sector pool management, and the fog-of-war visibility service.

- **`biomes.ts`** — exports the `BiomeType` union (`'rocky' | 'ocean' | 'gas_giant' | 'ice' | 'volcanic' | 'green' | 'anomaly' | 'toxic' | 'metallic' | 'energy'`), a `BIOMES` map keyed by biome id (`commonResources`, `rareResources`, `bonuses`, `penalties`), `ANOMALOUS_COMMON_BIOMES`, and **`HOME_SYSTEM_BASE_BIOMES`** — the six starter biomes (`green`, `rocky`, `ocean`, `ice`, `gas_giant`, `volcanic`) each guaranteed once per generated home system (capital stays `green`; keep `tools/balance-sim` mirrors aligned). Ice planets no longer roll biomass deposits; volcanic worlds carry hot mineral/sulfur deposits without frozen-water rares. Common-space anomaly variants split into antimatter/rare-metal `anomaly`, heavy-resource `toxic`, dense-metal `metallic`, and no-deposit `energy`.
- **`home-system-generator.ts`** — exports `generateHomeSystem(userId, tx?)`, **`MIN_HOME_CAPITAL_SLOT_COUNT`** (minimum building slots on planet 1 / capital), deterministic PRNG helpers `hashString` / `createRandom`, and English-canonical `systems.name` plus `{shortTag}-N` initial planet codes via `@shared/format/homeSystemNaming`; physical map placement is stored separately in `planets.orbitIndex`.
  - Uses `tx` from auth or opens `db.transaction`; idempotent when a home `systems` row already exists.
  - Derives deterministic seeds from `userId` plus validated `env.SERVER_SECRET` so production home-system RNG is controlled by secret storage instead of a feature-level `process.env` fallback.
  - Seeds sector coords `[-500,500]`, system `seed`, `name = "Home System <userId-prefix>"`.
  - Generates **8** planets from the fixed `HOME_PLANET_ORBIT_PLAN`: two volcanic inner worlds, two rocky resource worlds, ocean world, green capital in a deeper habitable orbit, gas giant, and one outer ice world; each row receives a stable `orbitIndex` so later player renames do not alter layout, distances, or solar output.
  - Capital (planet index 0): biome **`green`**, larger size, **`slotCount ≥ MIN_HOME_CAPITAL_SLOT_COUNT`** for early tutorial + shipyard chain.
  - Other planets: sizes follow biome size classes; non-capital resources are hand-authored per orbit so titanium/tritium/ice/sulfur/copper/aluminum/silver/gold and starter gases exist locally while rare/extreme biomes stay rare.
  - Filters forbidden tier-3/tier-4 richness ids while allowing explicit starter exceptions (`gold`, `nitrogen`, `tritium`); `silicon_carbide` stays out of richness because it is manufactured, not mined. Repeated resource ids in the starter plan become fixed deposit slots; seeds `richness` + starter `planet_resources` stockpiles with `regenRate = 0` until extractor buildings complete; planet 0 gets `command_center` + **only planet 0** in `discovered_planets` (other home bodies stay locked until a recon expedition route passes through their system-map visibility corridor — see `visibility.ts` / `workers/tick-expeditions.ts`).
  - Returns the new `systems.id`.
- **`sectors.ts`** — exports `getOrCreateSector(x, y, z)` which returns an existing sector or creates a new one with a deterministic seed. Used by jump and exploration features to lazily initialize world regions. The seed is computed via `hashString` of the coordinate triple, ensuring determinism across server restarts.
- **`sector-generator.ts`** — exports `generateSystemsInSector(sector, targetCount?)`, `createCommonPoolSystems(count)`, common-pool counters, and `generateCommonPlanetRichness()` for deterministic common-planet deposits. Common Pool sectors are abstract packing buckets, not player-near coordinates: helpers fill the empty pool with 5 public systems, pack up to 12 public systems per sector, create a new abstract sector when requested, and update the sector `systemCount`. Public systems use the sector seed, keep at least 50 units between systems inside the bucket, create 6–9 planets in a fixed inner-to-outer base order (`volcanic`, `rocky`, `ocean`, `green`, `gas_giant`, `ice`) with anomalous variants inserted between those bodies, give planets stable `orbitIndex` slots plus initial `{shortTag}-{index}` codes, and seed `richness` plus zero-regen `planet_resources` rows for non-energy planets. Systems in the common pool have `ownerId=null` and `isHome=false`.
- **`visibility.ts`** — exports `checkVisibility(shipId, tx?, overrideCoords?)` which resolves the ship's sensor-augmented range, finds candidate systems in an **XY bounding square**, applies **planar** sector distance (Z ignored), skips **foreign** home systems, and inserts new `discovered_systems` / `discovered_planets` rows. **Does not auto-insert undiscovered planets that belong to the player's own home system**; home bodies unlock from the flat route-corridor scan in `workers/tick-expeditions.ts`.
- **`visibility.test.ts`** — Vitest coverage for range, deduping, foreign-home suppression, discovery batches, 3D distance, and **locked home bodies staying hidden from passive sensors**.
- **`home-system-generator.test.ts`** — Vitest coverage for determinism, starter resource coverage, zero passive regen before extractors, **full home biome set + capital slots**, fixed 8-planet starter composition, visual orbit sorting, size spread, and tier restrictions.

## `research/`

Tech tree definitions and starting research on a planet.

- **`README.md`** — [Detailed research documentation](./research/README.md).
- **`completion.ts`** — `processCompletedResearch(db, options?)` scans due `research_progress` rows (`completes_at <= now`), optionally scoped to one user, increments `level` exactly once per completion, clears the timer, calls `invalidateResearchEffectsCache` for a provided request cache, and inserts a `research_done` notification unless active-session sync passed `skipNotification`.
- **`data.ts`** — exports `TECH_TREE` and `getResearchDef(branch, level)` backed by **`shared/config/researchCatalog.ts`** (eight branches × **five** tiers); building prerequisites use catalog id `lab`, and all research costs use seeded resource ids (`iron`, `silicon`, `tritium`, ...).
- **`effects.ts`** — typed research-effects engine with deterministic stacking. Exports `createResearchEffectsRequestCache`, `getResearchEffectsForUser(userId, db?, cache?)`, `invalidateResearchEffectsCache(userId, cache?)`, plus apply helpers for production, storage, energy generation/storage/efficiency, ship speed, sensor range, and build time. The optional cache is request-scoped and must be invalidated after research mutations before reuse.
- **`effects.test.ts`** — unit tests for deterministic composition and stacked resource/ship/sensor/build-time effects.
- **`gates.ts`** — progression gates: `loadUserResearchLevels(userId, db)`, `meetsResearchRequirement`, and `assertResearchRequirement` enforce unlock rules from `config/research-unlocks.ts` for buildings, ships, colonization, cargo routes, and jump drive.
- **`routes.ts`** — registers mutation-rate-limited and JSON-schema-validated `POST /start` and **`POST /rush`** (mounted at `/research` from `index.ts`). Start first finalizes due research for the active user, locks the user row, enforces the one-active-research queue rule across all branches, validates planet ownership, prerequisite research rows, lab building level (`buildings.typeId === 'lab'`), spends resources, and upserts `research_progress`; rush validates the active branch and delegates diamond spending to `rushActiveResearch`.
- **`rush.ts`** — `rushActiveResearch(userId, branch)` prices the remaining timer through `lib/diamonds`, atomically spends `users.diamonds`, increments the tier, clears `completesAt`, and invalidates research effects without creating a Telegram notification.
- **`research.test.ts`** — integration test for `POST /research/start`; creates a user and inserts a `lab` at **`slotIndex: 1`** (slot `0` is reserved for the seeded `command_center`), starts mining tier 1 research, and asserts `iron`/`silicon` are atomically deducted from `planet_resources`.
- **`rush.test.ts`** — integration tests for research rush success and insufficient-diamond rollback.
- **`gates.test.ts`** — unit coverage for research level maps, requirement checks, and unlock assertions.
- **`completion.test.ts`** — asserts single completion, idempotent ticks, future-dated timers ignored, effects multiplier change, notification creation, and online scoped completion without notification.

## `ships/`

Ship construction and fleet queue helpers.

- **`build.ts`** — `buildShip`, `getShipQueue`, `rushShipBuild`, and `syncReadyShips(userId?, options?)`. Build responses and queue payloads include server-derived `queueStartedAt`; `POST /ships/build` returns both the created `ship` and matching `queueItem` so the client can replace optimistic temporary ids without waiting for `/ships/queue`. `syncReadyShips` can be scoped to the active user and suppress stale pending `ship_done` notifications. Ship build blockers return structured codes/details formatted through shared localized entity labels before reaching the client. Ship build completion is always persisted in Postgres (`status='building'` + `queueCompletesAt`), then:
  - `ENABLE_BULLMQ=true` schedules a delayed wake-up through `completion-queue.ts` after the database transaction commits, reusing one app-lifetime Queue/Redis producer instead of creating Redis connections inside request transactions.
  - `ENABLE_BULLMQ=false` relies on periodic database polling in the worker and active-session `/me` sync.
  - New ship instances copy catalog HP/max HP and combat stats at construction so medium/heavy durability and rocket-carrier payload metadata are present before the ship leaves the queue.
- **`completion-queue.ts`** and **`completion-queue.test.ts`** — shared ship-build BullMQ producer and tests for non-blocking fire-and-forget enqueue behavior.
- **`refuel.ts`** — `refuelShip(userId, request)` validates owned idle docked ships, requires the source hull to be `refueler`, checks the receiver's current and maximum ordinary/Jump Fuel tanks, reserves support fuel under row locks, loads missing support reserve from the launch planet when available, spends route fuel, and creates a one-way `refuel_transfer` expedition. Local routes use same-system or sector distance; `routeMode='jump_gate'` validates an unlocked/calibrated Home Gate plus a known public `destinationSystemId`, charges launch-planet -> gate -> destination-gate -> target ordinary fuel and one Jump Fuel gate cost, and stores route metadata in the expedition result. Arrival completion re-checks the target's remaining capacity before delivering fuel, returns any undelivered reserve to the refueler, and leaves the refueler docked at the target planet. `replenishRefueler(userId, request)` creates a routed `refuel_replenish` expedition to an owned planet and fills the refueler's own tanks before support reserves on arrival, including Jump Gate routes to owned colonies in known public systems.
- **`spaceport-capacity.ts`** — shared landing-slot dispatcher for ship construction, expedition launch, and spaceport demolition. It locks the planet row, treats the sum of completed `spaceport` levels as planet capacity, counts docked/building ships, active target-landing reservations, and return-trip origin reservations, and returns occupied/reserved/available counts for localized blockers.
- **`spaceport-capacity.test.ts`** — focused regression coverage for summed multi-`spaceport` landing capacity and occupied-slot accounting.
- **`routes.ts`** — registers `GET /types`, JSON-schema-validated `POST /build`, `GET /queue`, JSON-schema-validated `POST /rush`, JSON-schema-validated `POST /refuel`, and JSON-schema-validated `POST /refuel/replenish`; ship mutations declare rate-limit/security metadata. Queue reads run user-scoped `syncReadyShips(..., { skipNotifications: true })` before returning the current queue.
- **`build.test.ts`** — integration coverage for ship construction gates and active-session ready-ship sync.
- **`refuel.test.ts`** — integration coverage for routed refuel transfers, owned-planet reserve loading, target tank capacity limits before launch and at arrival, idle/docked validation, tank overfill/source-insufficient rollback, concurrent transfer serialization, remote docked targets, Jump Gate transfer/replenish routes, and routed refueler replenishment.

## `combat/`

Server-authoritative ship-vs-ship combat ticks.

- **`durability.ts`** — `deriveBuildingMaxHp(baseHp, level)` and `deriveShipMaxHp(baseHp)` baseline HP helpers, plus `durability.test.ts` validating the catalog combat stats. Buildings scale HP by level; ships use type baseline.
- **`missiles.ts`** — abstract missile payload helpers for rocket carriers. It validates allowed target classes, evasion counter thresholds, and armor-adjusted sustained pressure derived from alpha/reload gameplay values while staying at game-stat level.
- **`nuclear.ts`** — late-tier abstract nuclear payload rule resolver gated by Weapons V, advanced resource cost, cooldown, visibility, ownership, protected-home, settlement and shield-interaction rules. It intentionally exposes only game stats and blockers.
- **`shields.ts`** — pure shield-coverage and shield-HP resolver. Same-owner shield ships in the same combat space protect allied hulls while `currentHp > 0`; overlapping shields absorb by smallest radius, then nearest center, then ship id; broken shields enter downtime and recharge idempotently from persisted shield timestamps.
- **`engine.ts`** — pure (DB-free) target acquisition.
  - `resolveAttackerHits(actors)` chooses one deterministic ship target per active attacker tick after filtering by owner, status, target class, same `hostSystem.id`, planar engagement-range distance, and `isDefenderProtectedFromAttacker` (mirrors `world/visibility.ts` — foreign home systems hide ships from outside attackers). Stale re-engagement first restamps contact instead of applying retroactive damage from an old `lastCombatTickAt`.
  - Rocket-carrier missile payload hits are resolved alongside sustained ship weapons but only against configured medium/heavy target classes under the evasion counter threshold, so light evasive hulls remain a counter.
  - `resolveBomberHits(bombers, buildingsByPlanet)` (P3-COM-007) routes `engagementRange='orbital'` ships against enemy buildings in the bomber's host system, including tactical point deployments whose current system-map position resolves inside the ship's explicit fighter-scale `bombardmentRange` rather than inheriting long orbital range. Per-planet target is chosen via `selectBomberTargetForPlanet`: non-CC buildings (lowest id) before any Command Center.
  - `computeTickDamage(defender, totalDps, nowMs, { timeScale? })` returns elapsed-time damage capped by a short visible-combat window, so one worker tick cannot erase ships or surface buildings from a stale or delayed engagement; ship-vs-ship callers use `SHIP_COMBAT_DAMAGE_TIME_SCALE`, and bomber-vs-building callers use `SURFACE_BOMBARDMENT_DAMAGE_TIME_SCALE`, to make engagements last longer without rewriting catalog DPS/HP.
- **`tick-combat.ts`** — `processDueCombat({ userId?, skipNotifications?, now? })` is the orchestrator. It discovers candidate combat systems read-only, then processes each system in its own transaction under a Postgres advisory lock keyed by `systemId`, so independent systems do not block each other and duplicate workers cannot double-apply the same system tick.
  - **Ship-vs-ship pass**: loads alive (`status != 'destroyed'`) ships only for the locked system, plus moving ships whose current Jump Gate/local route leg resolves into that system. It computes positions (planet coordinates at rest, system-map interpolation for same-system and destination-leg Jump Gate point routes, `calculateExpeditionPosition` fallback for other `'moving'` ships), runs the engine inside that system scope, routes incoming fire through active allied shields before hull HP, applies capped and time-scaled damage transactionally, marks first-contact/re-engagement combat with deduped `combat_started` notifications, marks destroyed hulls (`status='destroyed'`, `hp=0`, `destroyedAt`, drops in-flight expeditions), stamps `lastCombatTickAt`, emits `ship_destroyed` notifications.
  - **Bomber-vs-building pass** (P3-COM-007): loads alive buildings (`destroyedAt IS NULL` and `hp > 0`) only in the locked system when it contains a docked, moving, or `stationed` orbital bomber, joins with `building_types` for armor + `colonies` for owner, runs `resolveBomberHits`, applies elapsed-time damage with the same `lastCombatTickAt` idempotency pattern and surface-combat time scale, stamps the bombing ship for recent-combat map visibility, and queues deduped `combat_started` notifications for the attacked colony owner on first surface contact. Destroying the Command Center cascades: the entire planet's buildings + colony row are deleted in one transaction, the planet becomes a clean slate for re-colonization, and a `colony_destroyed` notification fires. Non-CC destruction emits `building_destroyed`.
  - Runs on a 3 s interval worker. `/me` reads the resulting state but does not advance combat.
- **`engine.test.ts`** — pure tests for engagement range, effective DPS, protection rules, one-target-per-attacker ship-vs-ship selection, rocket-carrier payload target/counter behavior, elapsed-time idempotency/re-engagement math, plus bomber target priority (CC last) and aggregation across multiple bombers.
- **`missiles.test.ts`** — pure tests for abstract payload alpha/reload math, medium/heavy target class allowance, and light/evasive counter limits.
- **`nuclear.test.ts`** — pure tests for Weapons V gating, advanced resource/cooldown requirements, allowed use, shield absorption/spillover, and blocked hidden/own/neutral/protected/unsettled targets.
- **`shields.test.ts`** — pure tests for shield coverage, overlap priority, overflow, downtime/recharge idempotency, and ownership/combat-space isolation.
- **`tick-combat.test.ts`** — integration tests covering: first-contact stamps `lastCombatTickAt` without damage, same-system Jump Gate point-to-point movement using system-map coordinates, stale re-engagement does not burst-damage old defenders, scouts surviving the first scaled combat pulse before dying under sustained fire, military light hulls surviving materially longer, identical one-vs-one fighter duels staying HP/status-symmetric until both ships die together, online `/me` sync not mutating combat state from a browser session, shield ships absorbing and recharging allied coverage, tick idempotency, destroyed ships stay destroyed, in-flight expeditions cancelled on destruction, foreign-home protection, bombers skip ship targeting, **bombers gradually damage non-CC buildings**, **stationed tactical bombers damage buildings and notify the colony owner**, **bombing idempotency**, **non-CC must be destroyed before CC takes any damage**, **CC destruction wipes the colony plus every building on the planet**, **no-target bombing is a no-op**, and **colonization gate switches between `colony_blocked_hostile_buildings` and the next gate after cleanup**.

## Shared feature helpers

- **`timers.ts`** — server-side derivation helpers for timer metadata (`queueStartedAt` / `startedAt`) from catalog durations and completion timestamps, used by `/me`, `/buildings/queue`, and `/ships/queue`.

## `colonies/`

Player colonies and settled planets.

- **`colonies.ts`** — `ColonyService` singleton. Implements colonization rules: checks for discovery, protects foreign home systems, allows the player's own discovered home bodies to be settled by colonizer, enforces the shared colony cap formula (base 1 + 5 per completed Logistics level), respects active colonizer deployment cooldown, and inserts into the `colonies` table.
- **`found-colony.ts`** — `foundColony(userId, shipId, planetId)` action module. Performs role validation, consumes the colonizer ship, establishes the colony, and builds the initial Command Center.
- **`ownership.ts`** — settlement ownership helpers used by buildings/ships/workers to distinguish discovered planets from buildable settlements.
- **`bootstrap.ts`** — `bootstrapColony(planetId, tx?)` action module. Initializes starting stock and known deposit rows for a new colony with `regenRate = 0` until extractors are built.
- **`colonies.test.ts`** — integration tests for colonization rules.
- **`found-colony.test.ts`** — integration tests for the founding flow.
- **`bootstrap.test.ts`** — integration tests for economy initialization.

## `logistics/`

Interplanetary cargo transfers. [Detailed documentation](./logistics/README.md).

- **`completion-queue.ts`** and **`completion-queue.test.ts`** — shared cargo-route BullMQ producer and tests for fire-and-forget `arrive_cargo` scheduling after commit.
- **`cargo-transfer.ts`** — `previewCargoTransfer(userId, request)` and `launchCargoTransfer(userId, request)` action modules. They validate settlement ownership including the home capital, logistics ship role, multi-load capacity, and planet state; calculate one-way ETA / fuel / Jump Fuel server-side, including shared planet-map distance for same-system transfers; require explicit `routeMode='jump_gate'` cargo routes to connect owned settlements in the player's Home system or known public common systems; reserve aggregated resources plus route `fuel` and optional stored `jump_fuel` atomically; create a one-way `expeditions` record with type `cargo_transfer`; optionally enqueue a BullMQ `arrive_cargo` wake-up through `completion-queue.ts` after commit when `ENABLE_BULLMQ=true`; and share `completeCargoTransfer` with active-session expedition sync and the expedition poller. Completion conditionally claims only active cargo rows before delivery, creates missing destination stockpile rows through `gainResources`, and skips already-settled cargo under duplicate or concurrent workers.
- **`cargo-transfer.test.ts`** — integration tests for the cargo transfer flow, including Home ↔ common-colony Jump Gate routes, insufficient route fuel / Jump Fuel, discovered-only target rejection, server preview payloads, and duplicate-delivery protection.

## Adding a new feature module

1. Pick a kebab-case folder name that matches the bounded context (`buildings`, `expeditions`, `research`, …).
2. Create `routes.ts` with `export async function <name>Routes(app: FastifyInstance) { ... }` and register it from `backend/src/index.ts` with the appropriate prefix.
3. Move all DB and domain logic into `service.ts` (typically a class plus an exported singleton). If the feature is a single-operation module, keep the logic in the named action file and call it from the route. Inject `db` and any tx via parameters so the domain code stays testable.
4. Co-locate `<name>.test.ts` and run `npm test` before committing.
5. Update this README and [`backend/src/README.md`](../README.md) to describe the new module.
