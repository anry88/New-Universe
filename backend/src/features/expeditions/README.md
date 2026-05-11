# `backend/src/features/expeditions` directory

Ship launch and expedition scheduling live here. The module accepts launch requests, validates ownership and resources, creates an `expeditions` row, and schedules the delayed completion job that future workers will consume.

## Files

- **`routes.ts`** — `expeditionsRoutes(app)` registers:
  - `POST /` — launches a standard expedition to a route point. Accepts `{ shipId, targetX, targetY, targetZ, cargoLoaded }`; fuel is calculated and reserved server-side from route distance and ship fuel consumption. Legacy `fuelLoaded` is ignored as a client hint, and legacy `targetPlanetId` is only retained for recon-only compatibility paths.
  - `POST /jump` — performs an inter-sector jump. Accepts `{ shipId, targetSector: { x, y, z } }`.
- **`launch.ts`** — `launchExpedition(userId, request)` performs the launch flow:
  - Loads the ship, its type, and current planet/system context.
  - Verifies the ship belongs to the caller and is `idle`.
  - Checks the ship is on a planet and that the ship can carry the requested cargo.
  - Calculates round-trip fuel from **sector XY** route distance (galactic plane; Z is ignored) × `ship_types.fuel_consumption`, then spends that amount from the launch planet via `spendResources`.
  - Creates the expedition row with `status='in_flight'`, updates the ship to `moving`, and computes `eta = distance × 60 / speed × engine_factor` with the current neutral engine factor.
  - Enqueues a BullMQ delayed job at `eta` and returns the created expedition plus queue metadata.
- **`jump.ts`** — `jumpShip(userId, request)` handles Jump Ship inter-sector jumps:
  - Verifies the ship is a `jump_ship` and `idle`.
  - Verifies `jump_drive` research level 1+.
  - Deducts 50 Jump Fuel from the ship's internal tank.
  - Lazily generates the target sector and moves the ship to the first planet of its first system.
  - Updates `discovered_systems` and `discovered_planets` for the user.
- **`launch.test.ts`** — Vitest integration suite for standard launches.
- **`jump.test.ts`** — Vitest integration suite for the jump feature.

## Adding a new expedition action

1. Keep launch-specific domain logic in `launch.ts` and keep the route layer thin.
2. Reuse the existing `expeditions` table and extend the worker side later if the new action needs arrival processing.
3. Update this README and the parent [`backend/src/features/README.md`](../README.md) whenever you add a new file here.
