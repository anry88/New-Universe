# `backend/src/features` directory

Feature modules group business logic, route handlers, and tests for one bounded context. The convention mirrors what `AGENTS.md` requires: keep handlers thin, push reusable behavior into a `service.ts` class/module, and write a co-located test file (e.g. `auth.test.ts`, `home-system-generator.test.ts`) before reporting a feature complete.

Each subfolder is a single feature and is wired into Fastify from `backend/src/index.ts`. Add a new feature by creating `backend/src/features/<name>/{routes.ts,service.ts,<name>.test.ts}` and `app.register(<name>Routes, { prefix: '/<name>' })` in `index.ts`. When the feature is a single action module instead of a long-lived service class, keep the domain logic in that named file and document the exception locally.

## `buildings/`

Planet infrastructure management.

- **`routes.ts`** — registers `GET /types`, `POST /build`, and `POST /upgrade`.
- **`service.ts`** — handles building logic, costs, and queueing.
- **`buildings.test.ts`** — integration tests for construction flows.

## `auth/`

Telegram-Mini-App authentication. The route layer delegates everything to `authService` and only translates between HTTP framing (header validation, cookie setting) and the service result.

- **`routes.ts`** — `authRoutes(app)` registers `POST /telegram` (mounted at `/auth` from `index.ts`, so the public path is `POST /auth/telegram`). The route uses `telegramAuthMiddleware` as a `preHandler`, so by the time the handler runs `request.user` is a verified `TelegramUser`. The handler:
  - Calls `authService.loginWithTelegram(request.user!)` and receives `{ user, token }`.
  - Builds a `Set-Cookie` value: `session=<token>; HttpOnly; Path=/; SameSite=Strict; Max-Age=<30 days>`. The `Secure` flag is added only when `NODE_ENV === 'production'`.
  - Returns the JSON `{ user, token }`.
- **`service.ts`** — `AuthService.loginWithTelegram(telegramUser)`:
  - Looks up `users` by `tgId` (converted to `bigint`).
  - If the user does not exist, opens a transaction (`db.transaction(...)`) and inserts the new row from `telegram.id`, `telegram.username`, `telegram.first_name`, then immediately calls `generateHomeSystem(newUser.id, tx)` so registration plus world bootstrap commit atomically.
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
- **`commands.ts`** — Implementation of bot commands like `/start`.
- **`push.ts`** — `sendPush(userId, type, payload)` service to queue push notifications in the database.


## `multiplayer/`

Sector map visibility for Phase 3.

- **`README.md`** — [multiplayer/presence documentation](./multiplayer/README.md).
- **`presence.ts`** — `getSectorPresence(viewerId, sectorX, sectorY, sectorZ)` builds `SectorPresencePayload` for `GET /multiplayer/sectors/:sx/:sy/:sz/presence`.
- **`presence.test.ts`** — asserts foreign homeworlds never appear and foreign colonies are masked.

## `me/`

Player state retrieval.

- **`routes.ts`** — `meRoutes(app)` registers `GET /me`. Requires a valid JWT in the `Authorization: Bearer <token>` header. Returns the database user record mapped to the `User` shared type.

## `buildings/`

Building construction and queue management. [Detailed documentation](./buildings/README.md).

- **`routes.ts`** — `buildingsRoutes(app)` registers `POST /build/build` (mounted at `/buildings` from `index.ts`, so the public path is `POST /buildings/build`). Requires a valid JWT in the `Authorization: Bearer <token>` header. Accepts `{ planetId, typeSlug }` in the request body.
- **`service.ts`** — `BuildingService.build(userId, { planetId, typeSlug })` performs the full build flow:
  1. Validates the planet exists and belongs to the requesting user.
  2. Looks up the building type from the catalog.
  3. Checks that the planet has a free slot (`buildingCount < planet.slotCount`).
  4. Ensures the build queue is not full (max 1 concurrent build without premium).
  5. Verifies all dependency buildings exist at the required level.
  6. Deducts resource costs via `spendResources` (from `features/resources/transactions.ts`).
  7. Creates a `buildings` row with `queueAction='build'` and `queueCompletesAt = now + baseTime`.
  8. Enqueues a BullMQ delayed job for completion (non-blocking; gracefully handles unavailable Redis).
- **`service.test.ts`** — Vitest integration suite covering the full build flow: successful mine construction, free-slot exhaustion (via direct DB insert), queue limit enforcement, missing auth, unknown building type, and non-existent planet.

## `resources/`

Resource accrual, transactions, and conversion.

- **`routes.ts`** — `resourcesRoutes(app)` registers `POST /convert` (mounted at `/resources` from `index.ts`, so the public path is `POST /resources/convert`). Requires a valid JWT in the `Authorization: Bearer <token>` header. Accepts `{ planetId, from, to, amount }` in the request body.
- **`convert.ts`** — `convertResources(userId, { planetId, from, to, amount })` converts ice ↔ water on a player-owned planet. Validates planet ownership, checks for a `cryo_factory` building (level ≥ 1), verifies energy availability (solar_plant production ≥ building consumption), then atomically spends the source resource and gains the target resource. Ice→water converts at 1:1; water→ice incurs a 5% loss (100 → 95).
- **`convert.test.ts`** — Vitest integration suite covering: missing cryo_factory (400), ice→water success, water→ice with 5% loss, missing auth (401), non-existent planet (404), invalid resource type (400), and insufficient source resource (400).
- **`accrual.ts`** — exports `computeCurrentResources(planetId, tx?)` which lazily computes current resource amounts without writing to the database. For each resource: `amount += regenRate × (now - lastUpdateAt)`. Respects `defaultStorageCap` from the `resources` table and applies research production/storage multipliers via `features/research/effects.ts`. Returns array of `{ resourceId, amount, regenRate, lastUpdateAt, storageCap }`.
  - Does NOT write to the database - this is a read-only computation for lazy updates.
  - Caps each resource amount at its `storageCap`.
  - Used by planet view and production features to show current state without constant DB writes.
- **`accrual.test.ts`** — Vitest coverage asserting: regen math (10/h for 1h → +10), storage cap enforcement, array of all planet resources, and multiple resources with different regen rates.
- **`transactions.ts`** — exports `spendResources(planetId, costs[], outerTx?)` and `gainResources(planetId, gains[], outerTx?)` for atomic resource transactions. When `outerTx` is omitted, opens its own transaction; when provided, participates in the caller's Drizzle transaction (used by market fulfillment). Uses `SELECT FOR UPDATE` on `planet_resources` for row-level locking. Updates `lastUpdateAt` synchronously with spend/gain. Returns `{ success, balanceAfter }` or `{ success: false, error: "not enough X" }`.
  - Parallel calls do not lead to negative values (transaction isolation).
  - If resource is insufficient → transaction rolls back, nothing spent.
  - `lastUpdateAt` synced with spend/gain.
- **`transactions.test.ts`** — Vitest coverage asserting: successful spend, insufficient resource rollback, gain resources, sync `lastUpdateAt`, and multiple resource atomic handling.

## `tutorial/`

Onboarding progression sync for first-time users.

- **`README.md`** — [Detailed tutorial documentation](./tutorial/README.md).
- **`routes.ts`** — `tutorialRoutes(app)` registers `POST /tutorial/sync` (mounted at `/tutorial`) and returns persisted tutorial state for the current user.
- **`service.ts`** — `syncTutorialProgress(userId)` maps game actions to steps (`mine`, `storage`, `scout`, first `expedition`), persists `users.tutorialStepCompleted`, and grants one-time completion reward (`+200 iron`, `+100 water`) through `gainResources` (atomic resource transaction).
- **`tutorial.test.ts`** — integration coverage for completion + one-time reward behavior.

## `market/`

Market contracts and explicit order-state lifecycle rules.

- **`README.md`** — [Detailed market documentation](./market/README.md).
- **`types.ts`** — typed market DTOs and explicit status transition map used by upcoming market services/routes.
- **`types.test.ts`** — Vitest coverage for allowed/forbidden market order transitions.
- **`pricing.ts`** — deterministic NPC broker pricing model (baseline + spread + stock-pressure + anti-abuse checks).
- **`pricing.test.ts`** — unit tests for stable prices, tier weighting, and no instant buy/sell profit loop.
- **`orders.ts`** — market order domain service used by `routes/market.ts` for listing offers, creating NPC orders, validating reserves, and cancellation rollback.
- **`orders.test.ts`** — integration tests covering offers list, successful create, insufficient reserve rejection, and cancel resource return.

## `expeditions/`

Ship launch and travel scheduling. [Detailed documentation](./expeditions/README.md).

- **`routes.ts`** — `expeditionsRoutes(app)` registers:
  - `POST /` — launches a standard expedition. Accepts `{ shipId, targetX, targetY, targetZ, fuelLoaded, cargoLoaded, targetPlanetId? }`. Optional **`targetPlanetId`** (scout-only) pins an in-home-system survey; coordinates must match the home system's sector.
  - `POST /jump` — performs an inter-sector jump using a Jump Ship. Accepts `{ shipId, targetSector: { x, y, z } }`.
- **`launch.ts`** — `launchExpedition(userId, request)` validates ship ownership and idle state, checks the launch planet has enough cargo stock, spends `fuelLoaded`, creates an `expeditions` row with `status='in_flight'` (stores **`targetPlanetId`** when surveying), updates the ship to `moving`, computes `eta = distance × 60 / speed × engine_factor`, and enqueues the delayed BullMQ job. Effective speed is resolved through `features/research/effects.ts`.
- **`jump.ts`** — `jumpShip(userId, request)` handles specialized Jump Ship teleportation. Checks for Jump Drive research lvl 1+, deducts 50 fuel from the ship's internal tank, lazily generates the target sector/system, and moves the ship to the first planet of the target system. Updates discovery records.
- **`launch.test.ts`** — Vitest integration suite covering the happy path, non-idle ship rejection, insufficient fuel, and missing auth.
- **`jump.test.ts`** — Vitest integration suite for the jump feature.

## `world/`

Procedural world generation primitives and visibility checks. Contains the home-system seeder used by `auth/service.ts`, sector pool management, and the fog-of-war visibility service.

- **`biomes.ts`** — exports the `BiomeType` union (`'rocky' | 'ocean' | 'gas_giant' | 'ice' | 'volcanic' | 'green' | 'anomaly'`), a `BIOMES` map keyed by biome id (`commonResources`, `rareResources`, `bonuses`, `penalties`), and **`HOME_SYSTEM_BASE_BIOMES`** — the six starter biomes (`green`, `rocky`, `ocean`, `ice`, `gas_giant`, `volcanic`) each guaranteed once per generated home system (capital stays `green`; keep `tools/balance-sim` mirrors aligned).
- **`home-system-generator.ts`** — exports `generateHomeSystem(userId, tx?)`, **`MIN_HOME_CAPITAL_SLOT_COUNT`** (minimum building slots on planet 1 / capital), and deterministic PRNG helpers `hashString` / `createRandom`.
  - Uses `tx` from auth or opens `db.transaction`; idempotent when a home `systems` row already exists.
  - Seeds sector coords `[-500,500]`, system `seed`, `name = "Home System <userId-prefix>"`.
  - Generates **6–7** planets; assigns biomes so **every `HOME_SYSTEM_BASE_BIOMES` entry appears at least once** (deterministic shuffle for planets 1–5 after the capital).
  - Capital (planet index 0): biome **`green`**, larger size, **`slotCount ≥ MIN_HOME_CAPITAL_SLOT_COUNT`** for early tutorial + shipyard chain.
  - Other planets: sizes/slots as before; resource rules unchanged — planet 0 gets the five starter resources; planet 1 adds `tritium`; planet 2+ uses biome pools with optional rares.
  - Filters forbidden tier-3/tier-4 richness ids; seeds `richness` + `planet_resources`; planet 0 gets `command_center` + **only planet 0** in `discovered_planets` (other home bodies stay locked until scout survey — see `visibility.ts` / expeditions).
  - Returns the new `systems.id`.
- **`sectors.ts`** — exports `getOrCreateSector(x, y, z)` which returns an existing sector or creates a new one with a deterministic seed. Used by jump and exploration features to lazily initialize world regions. The seed is computed via `hashString` of the coordinate triple, ensuring determinism across server restarts.
- **`sector-generator.ts`** — exports `generateSystemsInSector(sector, targetCount?)` which lazily generates missing systems within a sector. Uses the sector's seed for deterministic generation, respects the 12-system maximum per sector, ensures minimum 50-unit distance between systems, and distributes planet biomes by GDD weights (`getBiomeByWeight`, `generateSystemPosition`). Systems in the common pool have `ownerId=null` and `isHome=false`.
- **`visibility.ts`** — exports `checkVisibility(shipId, tx?, overrideCoords?)` which resolves the ship's sensor-augmented range, finds candidate systems in the cubic bounds, applies Euclidean distance, skips **foreign** home systems, and inserts new `discovered_systems` / `discovered_planets` rows. **Does not auto-insert undiscovered planets that belong to the player's own home system** (those unlock when a scout expedition with `targetPlanetId` completes — see `workers/tick-expeditions.ts`).
- **`visibility.test.ts`** — Vitest coverage for range, deduping, foreign-home suppression, discovery batches, 3D distance, and **locked home bodies staying hidden from passive sensors**.
- **`home-system-generator.test.ts`** — Vitest coverage for determinism, resource/tritium contracts, **full home biome set + capital slots**, and tier restrictions.

## `research/`

Tech tree definitions and starting research on a planet.

- **`data.ts`** — exports `TECH_TREE` and `getResearchDef(branch, level)`; building prerequisites use catalog id `lab`, and all research costs use seeded resource ids (`iron`, `silicon`, `tritium`, ...).
- **`gates.ts`** — progression gates: `loadUserResearchLevels(userId, db)`, `meetsResearchRequirement`, and `assertResearchRequirement` enforce unlock rules from `config/research-unlocks.ts` for buildings, ships, colonization, cargo routes, and NPC market orders.
- **`completion.ts`** — `processCompletedResearch(db)` scans due `research_progress` rows (`completes_at <= now`), increments `level` exactly once per completion, clears the timer, calls `invalidateResearchEffectsCache`, and inserts a `research_done` notification. Used by `workers/research.ts`.
- **`effects.ts`** — typed research-effects engine with deterministic stacking. Exports `getResearchEffectsForUser(userId)` plus apply helpers for production, storage, ship speed, sensor range, and build time. Exports `invalidateResearchEffectsCache(userId)` as a hook after tier completions (no-op until memoization exists).
- **`effects.test.ts`** — unit tests for deterministic composition and stacked resource/ship/sensor/build-time effects.
- **`routes.ts`** — registers `POST /start` (mounted at `/research` from `index.ts`). Validates planet ownership, prerequisite research rows, lab building level (`buildings.typeId === 'lab'`), spends resources, and upserts `research_progress`.
- **`research.test.ts`** — integration test for `POST /research/start`; creates a user and lab, starts mining research, and asserts `iron`/`silicon` are atomically deducted from `planet_resources`.
- **`gates.test.ts`** — unit coverage for research level maps, requirement checks, and unlock assertions.
- **`completion.test.ts`** — asserts single completion, idempotent ticks, future-dated timers ignored, effects multiplier change, and notification creation.

## `colonies/`

Player colonies outside the home system.

- **`colonies.ts`** — `ColonyService` singleton. Implements colonization rules: checks for discovery, protects home systems, enforces per-player limits (default 5), and inserts into the `colonies` table.
- **`found-colony.ts`** — `foundColony(userId, shipId, planetId)` action module. Performs role validation, consumes the colonizer ship, establishes the colony, and builds the initial Command Center.
- **`bootstrap.ts`** — `bootstrapColony(planetId, tx?)` action module. Initializes resources and regen rates for a new colony.
- **`colonies.test.ts`** — integration tests for colonization rules.
- **`found-colony.test.ts`** — integration tests for the founding flow.
- **`bootstrap.test.ts`** — integration tests for economy initialization.

## `logistics/`

Interplanetary cargo transfers. [Detailed documentation](./logistics/README.md).

- **`cargo-transfer.ts`** — `launchCargoTransfer(userId, request)` action module. Validates ownership, capacity, and planet state; reserves resources atomically; creates an `expeditions` record with type `cargo_transfer`; enqueues a BullMQ `arrive_cargo` job.
- **`cargo-transfer.test.ts`** — integration tests for the cargo transfer flow.

## Adding a new feature module

1. Pick a kebab-case folder name that matches the bounded context (`buildings`, `expeditions`, `research`, …).
2. Create `routes.ts` with `export async function <name>Routes(app: FastifyInstance) { ... }` and register it from `backend/src/index.ts` with the appropriate prefix.
3. Move all DB and domain logic into `service.ts` (typically a class plus an exported singleton). If the feature is a single-operation module, keep the logic in the named action file and call it from the route. Inject `db` and any tx via parameters so the domain code stays testable.
4. Co-locate `<name>.test.ts` and run `npm test` before committing.
5. Update this README and [`backend/src/README.md`](../README.md) to describe the new module.
