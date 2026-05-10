# `backend/src/features/buildings` directory

Construction queues, demolitions, and building-type reads on player planets.

## Files

- **`routes.ts`** — Registers JWT-protected `GET /types`, `POST /build`, `POST /upgrade`, `POST /demolish`, `POST /sync/:planetId`, and `GET /queue` under `/buildings`.
- **`service.ts`** — `BuildingService` owns catalog reads plus transactional **`build`**, **`upgrade`**, **`demolish`**, **`syncPlanetBuildings`**, **`finalizeBuildingConstruction`**, and regen aggregation for producers (`upsertProductionRegen`). **`build`** passes two building snapshots into eligibility: full rows for per-planet caps, and a dependency snapshot that omits rows still in the initial construction queue (`queueAction === 'build'`) so a colony founding CC under construction does not unlock dependents early. **`upgrade`** scales the next level’s resource cost by **1.6^currentLevel** (per resource, floored) and upgrade duration by **1.8^currentLevel × baseTimeSec** before research speed modifiers; demolition refunds sum historical upgrade spends under the same cost curve (50% floor).
- **`building-operation-error.ts`** — `BuildingOperationError` carries deterministic `{ code, details }` pairs mirrored by `@shared/types/buildings` (`BuildBlockedReason`).
- **`count-user-buildings.ts`** — `countUserBuildingsOfType` is the single account-wide counter used when enforcing **`building_types.max_global`** at construction time.
- **`upgrade.ts`** — legacy/alternate upgrade entry point kept aligned with `BuildingService.upgrade` multipliers (**1.6^level**, **1.8^level**); HTTP routes call `BuildingService` directly.
- **`buildings.test.ts`**, **`service.test.ts`**, **`upgrade.test.ts`**, **`eligibility.test.ts`** — Vitest coverage over transactional flows plus pure eligibility ordering rules shared with the frontend.

## Adding limits / prerequisites

1. Extend **`building_types`** through Drizzle (`backend/src/db/schema/buildings.ts`) + migrations + `catalog-rows.ts` seeds (`max_per_planet`, `max_global`, deps JSON).
2. Wire shared eligibility logic (`@shared/types/building-eligibility`) inside **`service.ts`** right after queue-cap checks so the backend rejects duplicates atomically before charging resources.
3. Mirror counters offline via **`tools/balance-sim/src/catalog.ts`** when production timings/deps change.
4. Research-gated builds consume **`BUILDING_RESEARCH_GATES`** from **`shared/config/buildingResearchGates.ts`** (re-exported through `backend/src/config/research-unlocks.ts`) so UI previews cannot drift from enforcement order (`research → deps → per-planet → global`).
