# `backend/src/db` directory

The data layer defines the Drizzle ORM client, all Postgres tables, generated migrations, and seed scripts. Domain code touches the database exclusively through the typed `db` instance exported from [`index.ts`](index.ts) (e.g. `import { db } from '../../db/index.js'` from a feature module).

## Files

- **`index.ts`** — opens the Postgres connection from `process.env.DATABASE_URL` using `postgres-js`, then wraps it with `drizzle(client, { schema })`. The exported `db` is the only entry point services should use; passing `db.transaction(...)` is required when multiple inserts must succeed atomically (see `features/auth/service.ts` and `features/world/home-system-generator.ts`).
- **`schema.ts`** — barrel that `export *`s from every domain module under `schema/`. Drizzle relies on this single export to build the relations and types passed into `drizzle({ schema })`. Whenever you add a new file under `schema/`, add an `export * from './schema/<file>.js';` line here.
- **`seed.ts`** — entry point invoked by `npm run db:seed`. Calls `seedResources`, `seedResearchBranches`, `seedBuildingTypes`, `seedShipTypes` in order, then exits the process. New seeders must be registered here.
- **`migrations/`** — auto-generated SQL produced by `drizzle-kit generate`. Numbered `0000_*.sql` … `0007_*.sql` files plus the Drizzle `meta/` snapshots. Do not edit migrations by hand; regenerate them after schema changes.

## Schema modules (`schema/`)

Each module owns one domain and exports the Drizzle table objects. `schema.ts` re-exports them so consumers can `import { systems, planets } from '../../db/schema.js'`.

- **`users.ts`** — `users` table. Columns: `id` (UUID PK), `tgId` (`bigint`, unique, mapped via `mode: 'bigint'`), `tgUsername`, `tgFirstName`, `createdAt`, `premiumUntil`, `powerScore`. Telegram identity is the unique business key; do not add other unique constraints here without updating the auth flow.
- **`resources.ts`** — `resources` reference catalog. Columns: `id` (text PK), `name` (`jsonb<{ ru, en }>`), `tier`, `symbol`, `baseRegenRate`, `defaultStorageCap`. Seeded by `seed/resources.ts` with 21 resources across tiers 1–4.
- **`world.ts`** — `systems`, `planets`, `planet_resources`, `richness`. Notable details:
  - `systems.ownerId` is the home-system owner; `isHome` flags it as the player's starting system; `sectorX/Y/Z` are deterministic per-user sector coordinates produced by `home-system-generator.ts`; `x/y/z` are the system's position within the sector (numeric, precision 10 scale 2), used for distance calculations between systems in the same sector.
  - `planets` carries `biome` (text), `size` (10–19), `slotCount` (≈80% of `size`).
  - `planet_resources` is a composite-PK `(planet_id, resource_id)` table with `amount`, `lastUpdateAt`, `regenRate` (numeric). It is the source of truth for current per-planet balances.
  - `richness` is also `(planet_id, resource_id)` and stores `value` constrained to `0..5` via `richness_value_check`. It represents discovered deposit tier, not running balance.
  - `planets_system_id_idx` covers the common `systemId` lookup pattern.
- **`buildings.ts`** — `building_types` (catalog) and `buildings` (instances). `building_types` carries `category`, `maxLevel`, `deps` (JSONB `{ typeId, level }[]`), `baseCost` (JSONB `{ resourceId: amount }`), `baseTimeSec`, `baseOutput`, `energyConsumption`. `buildings` is per-planet with `level`, optional `queueAction` and `queueCompletesAt` columns used by the build queue.
- **`research.ts`** — `research_branches` (catalog) and `research_progress` (composite PK `(userId, branch)`, with `level`, optional `completesAt`).
- **`ships.ts`** — `ship_types` and `ships`. `ship_types` describes role, hp, speed, cargo, dps/armor, fuel consumption, build time, build cost, required buildings, sensor range. `ships` instances reference owner, type, optional `locationPlanetId`, `status` (default `idle`), `cargoJson`, `fuel`.
- **`discovery.ts`** — `discovered_planets` and `discovered_systems`, both composite-PK `(userId, planetId|systemId)` with `discoveredAt`. Used to gate the fog-of-war reveal.
- **`expeditions.ts`** — `expeditions` job log. Columns: `id`, `shipId`, `type`, `originPlanetId`, `targetX/Y/Z`, optional `targetPlanetId`, `status` (default `queued`), `eta`, optional `returnedAt`, `result` (JSONB). The `shipId` and `originPlanetId` foreign keys cascade on delete so test cleanup and planet/ship teardown do not leave orphaned expedition rows; `targetPlanetId` uses `SET NULL`. `expeditions_eta_status_idx` is a compound index on `(eta, status)` to support the worker's "what is due" query.
- **`sectors.ts`** — `sectors` table. Composite PK `(x, y, z)`, `seed` (deterministic hash of coordinates), `generatedAt` (timestamp), `systemCount` (default 0). Represents the common pool of space sectors; used by jump and exploration features to lazily initialize world regions.

## Seed scripts (`seed/`)

Each seed module exports an idempotent `async function seedXxx()` that calls `db.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row })`. They are safe to re-run.

- **`resources.ts`** — populates the 21-resource catalog (`water`, `iron`, `carbon`, `silicon`, `methane`, `copper`, `aluminum`, `titanium`, `ice`, `sulfur`, `mercury`, `magnesium`, `lead`, `uranium`, `cobalt`, `silicon_carbide`, `tritium`, `antimatter`, `dark_matter`, `iridium`, `biomass`) with bilingual names, tier, symbol, base regen, and default storage cap.
- **`research-branches.ts`** — seven research branches: `mining`, `engineering`, `engines`, `weapons`, `sensors`, `logistics`, `jump_drive`.
- **`building-types.ts`** — building catalog: `command_center`, `mine`, `drill`, `storage`, `smelter`, `spaceport`, `shipyard`, `lab`, `cryo_factory`, `solar_plant`. Includes dependency chains (`spaceport ⇒ command_center L4`, `shipyard ⇒ spaceport L2`, `cryo_factory ⇒ spaceport L2 + smelter L3`, etc.).
- **`ship-types.ts`** — five starter ship types: `scout`, `cargo_light`, `colonizer`, `recon_probe`, `jump_ship`. Each row encodes role, stats, fuel use, build time, build cost, required buildings, and sensor range.

## Working with the schema

- Always run `npm run db:generate` after editing any file in `schema/` so a numbered SQL migration is created. Commit the generated SQL alongside the schema change.
- Drizzle's relational query API (`db.query.users.findFirst({ where: ... })`) is preferred over raw `select` for readability; use `db.transaction` whenever you write multiple related rows.
- Update [`backend/src/db/README.md`](README.md) and re-export from `db/schema.ts` when new tables land.
- Reference data (anything you would otherwise hand-insert in dev) belongs in a `seed/` script registered from `seed.ts`, not in code paths that run on every request.
