# `backend/src/db` directory

The data layer defines the Drizzle ORM client, all Postgres tables, generated migrations, and seed scripts. Domain code touches the database exclusively through the typed `db` instance exported from [`index.ts`](index.ts) (e.g. `import { db } from '../../db/index.js'` from a feature module).

## Files

- **`index.ts`** — loads `.env` from the repository root and from `backend/` (if those files exist; existing `process.env` wins), then opens Postgres from `process.env.DATABASE_URL` using `postgres-js`, then wraps it with `drizzle(client, { schema })`. The exported `db` is the only entry point services should use; passing `db.transaction(...)` is required when multiple inserts must succeed atomically (see `features/auth/service.ts` and `features/world/home-system-generator.ts`).
- **`schema.ts`** — barrel that `export *`s from every domain module under `schema/`. Drizzle relies on this single export to build the relations and types passed into `drizzle({ schema })`. Whenever you add a new file under `schema/`, add an `export * from './schema/<file>.js';` line here.
- **`seed.ts`** — entry point invoked by `npm run db:seed`. Calls `seedResources`, `seedResearchCatalog`, `seedBuildingTypes`, `seedShipTypes` in order, then exits the process. New seeders must be registered here.
- **`migrations/`** — auto-generated SQL produced by `drizzle-kit generate`. Numbered `0000_*.sql` … `0007_*.sql` files plus the Drizzle `meta/` snapshots. Do not edit migrations by hand; regenerate them after schema changes.

## Schema modules (`schema/`)

Each module owns one domain and exports the Drizzle table objects. `schema.ts` re-exports them so consumers can `import { systems, planets } from '../../db/schema.js'`.

- **`users.ts`** — `users` table. Columns: `id` (UUID PK), `tgId` (`bigint`, unique, mapped via `mode: 'bigint'`), `tgUsername`, `tgFirstName`, `createdAt`, `premiumUntil`, `powerScore`, `tutorialStepCompleted` (stored in `tutorial_step`), `tutorialCompletedAt`. Telegram identity is the unique business key; tutorial fields are used to auto-start and complete onboarding.
- **`resources.ts`** — `resources` reference catalog. Columns: `id` (text PK), `name` (`jsonb<{ ru, en }>`), `tier`, `symbol`, `baseRegenRate`, `defaultStorageCap`. Seeded by `seed/resources.ts` with 21 resources across tiers 1–4.
- **`world.ts`** — `systems`, `planets`, `planet_resources`, `richness`. Notable details:
  - `systems.ownerId` is the home-system owner; `isHome` flags it as the player's starting system; `sectorX/Y/Z` are deterministic per-user sector coordinates produced by `home-system-generator.ts`; `x/y/z` are the system's position within the sector (numeric, precision 10 scale 2), used for distance calculations between systems in the same sector.
  - `planets` carries `biome` (text), `size` (10–19), `slotCount` (≈80% of `size`).
  - `planet_resources` is a composite-PK `(planet_id, resource_id)` table with `amount`, `lastUpdateAt`, `regenRate` (numeric). It is the source of truth for current per-planet balances.
  - `richness` is also `(planet_id, resource_id)` and stores `value` constrained to `0..5` via `richness_value_check`. It represents discovered deposit tier, not running balance.
  - `planets_system_id_idx` covers the common `systemId` lookup pattern.
- **`buildings.ts`** — `building_types` (catalog) and `buildings` (instances). `building_types` carries `name` (`jsonb<{ ru, en }>`), `description` (`jsonb<{ ru, en }>`), `category`, optional nullable **`max_per_planet`** / **`max_global`** enforcement knobs (seeded via `catalog-rows.ts`), `maxLevel`, `deps` (JSONB `{ typeId, level }[]`), `baseCost` (JSONB `{ resourceId: amount }`), `baseTimeSec`, `baseOutput`, `energyConsumption`. `buildings` is per-planet with `level`, optional `queueAction` and `queueCompletesAt` columns used by the build queue.
- **`research.ts`** — `research_branches` (catalog) and `research_progress` (composite PK `(userId, branch)`, with `level`, optional `completesAt`).
- **`ships.ts`** — `ship_types` and `ships`. `ship_types` describes role, hp, speed, cargo, dps/armor, fuel consumption, build time, build cost, required buildings, sensor range. `ships` instances reference owner, type, optional `locationPlanetId`, `status` (default `idle`), `cargoJson`, `fuel`.
- **`discovery.ts`** — `discovered_planets` and `discovered_systems`, both composite-PK `(userId, planetId|systemId)` with `discoveredAt`. Used to gate the fog-of-war reveal.
- **`expeditions.ts`** — `expeditions` job log. Columns: `id`, `shipId`, `type`, `originPlanetId`, `targetX/Y/Z`, optional `targetPlanetId`, `status` (default `queued`), `eta`, optional `returnedAt`, `result` (JSONB). The `shipId` and `originPlanetId` foreign keys cascade on delete so test cleanup and planet/ship teardown do not leave orphaned expedition rows; `targetPlanetId` uses `SET NULL`. `expeditions_eta_status_idx` is a compound index on `(eta, status)` to support the worker's "what is due" query.
- **`sectors.ts`** — `sectors` table. Composite PK `(x, y, z)`, `seed` (deterministic hash of coordinates), `generatedAt` (timestamp), `systemCount` (default 0). Represents the common pool of space sectors; used by jump and exploration features to lazily initialize world regions.
- **`notifications.ts`** — `notifications` table. Columns: `id`, `userId`, `type` (`building_done`, `ship_done`, etc.), `payload` (JSONB), `createdAt`, `read`, `pending` (default `true`), `sentAt`. Used by the push notification system.
- **`market.ts`** — NPC/player market persistence primitives:
  - `market_offers` — offer book rows keyed by scope (`npc`/`player`), side (`buy`/`sell`), resource, status, price, qty, fees, and expiry.
  - `market_orders` — per-user order lifecycle rows (`open`, `partially_filled`, `filled`, `cancelled`, `expired`, `failed`, `settled`) with fill totals, fees, optional delivery/offer references, nullable `planet_id` (FK → `planets`, `ON DELETE set null`) for settlement routing, and optional `delivery_ready_at` for NPC buy ETA indexing (`market_orders_fulfillment_tick_idx`).
  - `market_order_fills` — immutable fill records tied to orders/offers, with execution price/qty, fees, and optional delivery expedition reference.
- **`colonies.ts`** — `colonies` table. Columns: `id` (UUID PK), `ownerId` (references `users.id`), `planetId` (references `planets.id`), `foundedAt`, `status`. A planet can only have one colony total across all players (`colonies_planet_id_idx`).
- **`multiplayer.ts`** — documents that Phase 3 sector presence composes `systems`, `planets`, `colonies`, `ships`, and `users`; no extra tables in this slice (see `features/multiplayer/presence.ts`).


## Seed scripts (`seed/`)

Each seed module exports an idempotent `async function seedXxx()` that calls `db.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row })`. They are safe to re-run.

- **`catalog-rows.ts`** — single source of truth for `RESOURCE_CATALOG_ROWS`, `BUILDING_TYPE_CATALOG_ROWS`, and `SHIP_TYPE_CATALOG_ROWS` (no DB import). Consumed by seed scripts and `runCatalogAudit()` so CI can validate catalogs without connecting to Postgres.
- **`resources.ts`** — inserts `RESOURCE_CATALOG_ROWS` into `resources` (23 rows including `fuel`, `steel`, `electronics`, and base/mineral tiers `water` … `biomass`).
- **`research.ts`** — idempotent seeder for `research_branches` from `config/research-catalog.ts`. Keeps branch name/description in sync with the phase-2 catalog source of truth.
- **`building-types.ts`** — inserts `BUILDING_TYPE_CATALOG_ROWS` (`command_center`, `mine`, `drill`, `storage`, `smelter`, `fabrication_bay`, `spaceport`, `shipyard`, `lab`, `cryo_factory`, `solar_plant`) with dependency chains (`spaceport ⇒ command_center L4`, `shipyard ⇒ spaceport L2`, `fabrication_bay ⇒ command_center L3 + smelter L1`, `cryo_factory ⇒ spaceport L2 + smelter L3`, etc.).
- **`ship-types.ts`** — inserts `SHIP_TYPE_CATALOG_ROWS` (`scout`, `cargo_light`, `colonizer`, `recon_probe`, `jump_ship`). Each row encodes role, stats, fuel use, build time, build cost, required buildings, and sensor range.
- **`audit.ts`** — exports `runCatalogAudit()` to verify duplicate-free ids, `ru`/`en` names on catalog rows, tier/defaultStorageCap consistency, cross-references (costs → resource ids, building deps, NPC baseline keys), and research-branch localization. Used by `audit.test.ts` (default `npm test` / CI).

### Resource sourcing (game economy)

Non-currency materials should be obtainable without the NPC broker: **planetary richness** (`richness` / passive `planet_resources.regenRate`) and/or **building production** (`building_types.baseOutput` with `resourceId` + `baseRate`, applied on build/upgrade completion in `features/buildings/service.ts`). In particular, **`steel`** is produced by **`smelter`**, and **`electronics`** by **`fabrication_bay`**; the market remains an optional liquidity sink, not the sole source of baseline alloys/components.
- **`audit.test.ts`** — Vitest gate that fails when catalog drift would break seeds or market pricing alignment.

## Working with the schema

- Always run `npm run db:generate` after editing any file in `schema/` so a numbered SQL migration is created. Commit the generated SQL alongside the schema change.
- Drizzle's relational query API (`db.query.users.findFirst({ where: ... })`) is preferred over raw `select` for readability; use `db.transaction` whenever you write multiple related rows.
- Update [`backend/src/db/README.md`](README.md) and re-export from `db/schema.ts` when new tables land.
- Reference data (anything you would otherwise hand-insert in dev) belongs in a `seed/` script registered from `seed.ts`, not in code paths that run on every request.
