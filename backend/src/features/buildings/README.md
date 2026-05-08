# `backend/src/features/buildings` directory

<<<<<<< HEAD
This feature handles building construction and upgrades on planets.

## Files

- **`routes.ts`** — `buildingsRoutes(app)` registers:
  - `GET /types` — returns the list of all available building types.
  - `POST /build` — starts a new building construction in a specific slot.
  - `POST /upgrade` — starts an upgrade for an existing building.
- **`service.ts`** — `BuildingService` singleton with business logic for construction and upgrades. Handles resource deduction and queue management.
- **`buildings.test.ts`** — Vitest suite for testing the building service.

## Construction logic

When a building is started or upgraded:
1. Ownership and slot availability are verified.
2. Resource costs are calculated (upgrades use an exponential scale: `baseCost * 2^currentLevel`).
3. Resources are deducted from the planet's balance.
4. A building instance is created or updated with `queueAction` and `queueCompletesAt`.
5. A background worker (P1-160/P1-161) will later process the completion.
=======
This feature handles building construction and queue management on player planets.

## Files

- **`routes.ts`** — `buildingsRoutes(app)` registers `POST /build/build` (mounted at `/buildings` from `index.ts`). Requires a valid JWT in the `Authorization: Bearer <token>` header. Accepts `{ planetId, typeSlug }` in the request body.
- **`service.ts`** — `BuildingService` singleton with a single public method `build(userId, { planetId, typeSlug })`. 
  - Validates planet ownership, free slots, queue capacity (max 1), dependency buildings, and resource costs.
  - Spends resources atomically via `spendResources` from `features/resources/transactions.ts`.
  - Creates a `buildings` row with `queueAction='build'` and `queueCompletesAt`.
  - Enqueues a BullMQ delayed job for worker processing (P1-162).
- **`service.test.ts`** — Integration tests covering the full build flow: success path, slot exhaustion, queue limit, missing auth, unknown building type, and non-existent planet.

## Adding a new building type

1. Add the building type definition to `backend/src/db/seed/building-types.ts` and re-run `npm run db:seed`.
2. No code changes are needed in this module — the build endpoint reads the catalog dynamically.
>>>>>>> main
