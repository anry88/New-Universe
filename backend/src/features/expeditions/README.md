# `backend/src/features/expeditions` directory

Ship launch and expedition scheduling live here. The module accepts launch requests, validates ownership and resources, creates an `expeditions` row, and schedules the delayed completion job that future workers will consume.

## Files

- **`routes.ts`** — `expeditionsRoutes(app)` registers mutation-rate-limited and JSON-schema-validated endpoints:
  - `POST /` — launches a local expedition to a route point or a Jump Gate route to a known public destination. Local mode accepts `{ shipId, targetX, targetY, targetZ, cargoLoaded }`; `routeMode='jump_gate'` accepts `{ shipId, destinationSystemId, cargoLoaded, targetPlanetId? }` and server-resolves the target sector from `discovered_systems` instead of trusting arbitrary coordinates. Fuel is calculated and reserved server-side from route distance and ship fuel consumption, and Jump Gate routes also require/deduct 50 stored `jump_fuel` from the launch planet. `targetPlanetId` is valid for recon surveys and colonizer deployments. Logistics ships are rejected here and must use `/cargo/transfer`. Colonizers must provide a discovered, eligible target planet and reserve one-way fuel because a successful arrival consumes the ship into the new Command Center.
  - `POST /jump` — deprecated-compatible Jump Gate entry point. Accepts `{ shipId, mode: 'random' }` for server-authoritative random jumps or `{ shipId, destinationSystemId }` for known destinations; legacy `{ targetSector }` requests are rejected without generating or visiting client-provided coordinates.
- **`launch.ts`** — `launchExpedition(userId, request)` performs the launch flow:
  - Loads the ship, its type, and current planet/system context.
  - Verifies the ship belongs to the caller and is `idle`.
  - Checks the ship is on a planet and that the ship can carry the requested cargo.
  - Calculates fuel from **sector XY** route distance (galactic plane; Z is ignored) × `ship_types.fuel_consumption`, or from `systemMapPlanetDistanceLy` when a targeted local recon/colonizer launch stays inside the same system, then spends that amount from the launch planet via `spendResources`. Normal expeditions reserve round-trip fuel; colonizer deployments to `targetPlanetId` reserve one-way fuel.
  - Validates `targetPlanetId` by role and route: local recon targets must be undiscovered home-system bodies, Jump Gate recon targets must belong to the selected known public destination, and colonizer targets must be discovered, unsettled, outside protected foreign Home Systems, and pass colonization gates. Colonizer gates are enforced at launch; arrival consumes the one-way mission and does not turn the ship around because cooldown or colony counts changed while it was in flight.
  - Creates the expedition row with `status='in_flight'`, updates the ship to `moving`, and computes `eta = distance × 60 / speed × engine_factor` with the current neutral engine factor.
  - Optionally enqueues a BullMQ delayed job at `eta` when `ENABLE_BULLMQ=true`; otherwise the expedition poller and active-session sync complete due rows. Returns the created expedition plus queue metadata.
- **`jump.ts`** — `jumpShip(userId, request, options?)` handles Jump Ship inter-sector jumps:
  - Verifies the ship is a `jump_ship` and `idle`.
  - Verifies the private Jump Gate is unlocked from completed `jump_drive` research level 1+ and is not calibrating.
  - Deducts 50 stored `jump_fuel` from the current planet inventory.
  - For random jumps, chooses deterministic server-side candidate sectors, lazily generates common-pool systems, and moves the ship to a public neutral system; private Home Systems are never valid jump targets.
  - For repeat travel, accepts only a known `destinationSystemId` from `discovered_systems`; manual sector coordinates are not accepted.
  - Upserts the system-level known destination with `source='random_jump'` and `lastVisitedAt`, but does not automatically discover every planet in the target system.
- **`launch.test.ts`** — Vitest integration suite for standard launches, Jump Gate scout routing, Jump Gate colonizer launch/arrival, protected Home System rejection, insufficient fuel, and missing auth.
- **`jump.test.ts`** — Vitest integration suite for locked random jumps, deprecated manual coordinates, known-destination repeats, common-pool target generation, and foreign Home System suppression.

## Adding a new expedition action

1. Keep launch-specific domain logic in `launch.ts` and keep the route layer thin.
2. Reuse the existing `expeditions` table and extend the worker side later if the new action needs arrival processing.
3. Update this README and the parent [`backend/src/features/README.md`](../README.md) whenever you add a new file here.
