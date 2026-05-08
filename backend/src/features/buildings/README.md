# `backend/src/features/buildings` directory

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
