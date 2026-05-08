# `backend/src/features/expeditions` directory

Ship launch and expedition scheduling live here. The module accepts launch requests, validates ownership and resources, creates an `expeditions` row, and schedules the delayed completion job that future workers will consume.

## Files

- **`routes.ts`** — `expeditionsRoutes(app)` registers `POST /` (mounted at `/expeditions` from `index.ts`, so the public path is `POST /expeditions`). Requires a Bearer JWT in `Authorization`. Accepts `{ shipId, targetX, targetY, targetZ, fuelLoaded, cargoLoaded }`.
- **`launch.ts`** — `launchExpedition(userId, request)` performs the launch flow:
  - Loads the ship, its type, and current planet/system context.
  - Verifies the ship belongs to the caller and is `idle`.
  - Checks the ship is on a planet and that the ship can carry the requested cargo.
  - Spends `fuelLoaded` from the launch planet via `spendResources`.
  - Creates the expedition row with `status='in_flight'`, updates the ship to `moving`, and computes `eta = distance × 60 / speed × engine_factor` with the current neutral engine factor.
  - Enqueues a BullMQ delayed job at `eta` and returns the created expedition plus queue metadata.
- **`launch.test.ts`** — Vitest integration suite covering the happy path, non-idle ship rejection, insufficient fuel, and missing auth.

## Adding a new expedition action

1. Keep launch-specific domain logic in `launch.ts` and keep the route layer thin.
2. Reuse the existing `expeditions` table and extend the worker side later if the new action needs arrival processing.
3. Update this README and the parent [`backend/src/features/README.md`](../README.md) whenever you add a new file here.
