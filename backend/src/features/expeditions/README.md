# `backend/src/features/expeditions` directory

Ship launch and expedition scheduling live here. The module accepts launch requests, validates ownership and resources, creates an `expeditions` row, and schedules the delayed completion job that future workers will consume.

## Files

- **`routes.ts`** — `expeditionsRoutes(app)` registers:
  - `POST /` — launches a standard expedition to a route point. Accepts `{ shipId, targetX, targetY, targetZ, cargoLoaded }`; fuel is calculated and reserved server-side from route distance and ship fuel consumption. `targetPlanetId` is valid only for recon surveys and colonizer deployments. Logistics ships are rejected here and must use `/cargo/transfer`. Colonizers must provide a discovered, eligible target planet and reserve one-way fuel because a successful arrival consumes the ship into the new Command Center.
  - `POST /jump` — performs an inter-sector jump. Accepts `{ shipId, targetSector: { x, y, z } }`.
- **`launch.ts`** — `launchExpedition(userId, request)` performs the launch flow:
  - Loads the ship, its type, and current planet/system context.
  - Verifies the ship belongs to the caller and is `idle`.
  - Checks the ship is on a planet and that the ship can carry the requested cargo.
  - Calculates fuel from **sector XY** route distance (galactic plane; Z is ignored) × `ship_types.fuel_consumption`, or from `systemMapPlanetDistanceLy` when a targeted recon/colonizer launch stays inside the same system, then spends that amount from the launch planet via `spendResources`. Normal expeditions reserve round-trip fuel; colonizer deployments to `targetPlanetId` reserve one-way fuel.
  - Validates `targetPlanetId` by role: recon targets must be undiscovered home-system bodies, while colonizer targets must be discovered, unsettled, and pass colonization gates.
  - Creates the expedition row with `status='in_flight'`, updates the ship to `moving`, and computes `eta = distance × 60 / speed × engine_factor` with the current neutral engine factor.
  - Enqueues a BullMQ delayed job at `eta` and returns the created expedition plus queue metadata.
- **`jump.ts`** — `jumpShip(userId, request)` handles Jump Ship inter-sector jumps:
  - Verifies the ship is a `jump_ship` and `idle`.
  - Verifies `jump_drive` research level 1+.
  - Deducts 50 Jump Fuel from the ship's internal tank.
  - Lazily generates the target sector and moves the ship to the first planet of the first public, non-home system; private Home Systems are never valid jump targets.
  - Updates `discovered_systems` and `discovered_planets` for the user.
- **`launch.test.ts`** — Vitest integration suite for standard launches.
- **`jump.test.ts`** — Vitest integration suite for the jump feature.

## Adding a new expedition action

1. Keep launch-specific domain logic in `launch.ts` and keep the route layer thin.
2. Reuse the existing `expeditions` table and extend the worker side later if the new action needs arrival processing.
3. Update this README and the parent [`backend/src/features/README.md`](../README.md) whenever you add a new file here.
