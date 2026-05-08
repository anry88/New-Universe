# `backend/src/features/buildings` directory

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
