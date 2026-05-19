# `backend/src/features/resources` directory

Resource features own lazy inventory accrual, atomic stockpile transactions, diamond purchases, ice/water conversion, and explicit production orders for processor buildings.

## Files

- **`accrual.ts`** — exports `loadPlanetResourceSnapshot(planetId, tx?)`, `computeCurrentResourcesFromSnapshot(snapshot)`, and compatibility helper `computeCurrentResources(planetId, tx?)`. The snapshot path derives current per-planet amounts from one resource/energy/building/effects read set, treats future-dated `lastUpdateAt` skew as zero elapsed time, caps ordinary resources by seeded storage plus research effects, caps `energy` by battery capacity, and reports zero passive extraction while the local energy chain is short.
- **`convert.ts`** — exports `convertResources`, `buyResourceWithDiamonds`, and `quoteResourceWithDiamonds`. Conversion validates settled ownership plus a `cryo_factory`, then spends source material and stored `energy` atomically; diamond purchases use resource tier pricing and then credit `planet_resources`.
- **`energy.ts`** — exports `resolvePlanetEnergyState`, `resolvePlanetEnergyStateFromSnapshot`, `syncEnergyResourceRow`, request-scoped energy-cache helpers, `energyRequirementForDuration`, and energy constants. It computes battery capacity, stored charge, solar output by orbital slot, wind output by planet size through shared `@shared/config/planetEnergy` formulas (size 22 × L1 wind produces 75 before research, rounded to two decimals), local idle consumption, active production-slot consumption for processor buildings, applies completed Energy research modifiers, waives operational demand on `energy` anomaly planets, and returns per-building disabled/charge state used by `/me`, production previews, pause/resume checks, and resource sync. Stored-energy processes such as `fuel_generator` and `atomic_reactor` output `energy` into battery capacity instead of becoming passive producers.
- **`production.ts`** — exports `ProductionService`, `productionService`, and `ProductionOperationError`. It lists recipes from `@shared/config/productionRecipes`, including expensive `silicon_carbide` fabrication from `silicon` / `carbon` / `steel`, refinery `jump_fuel` production from starter-system `ice` / `tritium` / `sulfur`, `atomic_reactor` sealed-cell energy recipes from advanced resources, previews input/output/duration/storage/launch-energy/slot blocks, starts processes by spending material inputs immediately without pre-spending the whole energy budget, scales recipe speed with the shared progressive building-level curve, enforces active production slots unlocked at levels 1/3/5/7/9, reports zero active-process demand on `energy` anomaly planets, pauses queued rows when battery power runs out, resumes paused rows by extending `completesAt`, and completes due `production_orders` by granting stored outputs.
- **`wallet.ts`** — exports `grantDiamondsToUserByUsername({ username, amount })` to perform admin wallet operations with username lookup and transactional diamond balance updates.
- **`routes.ts`** — registers resource HTTP endpoints under `/resources`: mutation-rate-limited and JSON-schema-validated `POST /convert`, `POST /buy-with-diamonds`, `POST /buy-with-diamonds/quote`, `GET /planets/:id`, plus production endpoints `GET /production/recipes`, `POST /production/preview`, `POST /production/start`, `GET /production/orders`, and `POST /production/sync/:planetId`. `GET /planets/:id` uses the shared resource snapshot path so energy and resource accrual are resolved once per request.
- **`transactions.ts`** — exports `spendResources` and `gainResources`, the row-locking primitives for atomic inventory changes. Callers can pass an outer Drizzle transaction so multi-step domain flows commit or roll back together; duplicate cost lines are charged in aggregate and roll back together when the combined amount is unaffordable. Before locking balances, transactions sync only the affected resource ids instead of writing every stockpile row on the planet, keeping hot mutation transactions narrower. Insufficient-resource failures include `{ code, details }` plus a human-readable resource label. `gainResources` creates a missing zero-regen `planet_resources` row before crediting, so delivered or crafted resources are not lost when a planet has never stored that resource before.
- **`*.test.ts`** — Vitest coverage for accrual math, conversion/diamond purchase behavior, transaction atomicity, and production-order previews/start/completion.

## Adding a resource flow

1. Keep balance constants in shared config or backend config instead of route handlers.
2. Validate planet ownership through `features/colonies/ownership.ts` before spending or granting inventory.
3. Use `spendResources` / `gainResources` for every stockpile mutation so `lastUpdateAt` and row locks stay consistent.
4. If the frontend needs the payload shape, add or update a contract in `shared/types/` and document it in `shared/README.md`.
5. Add focused integration tests that prove both successful and rollback paths.

## Verification

```bash
npm test -- src/features/resources/accrual.test.ts src/features/resources/convert.test.ts src/features/resources/energy.test.ts src/features/resources/transactions.test.ts src/features/resources/production.test.ts
```
