# `backend/src/features/logistics` directory

Interplanetary logistics — cargo transfers between player-owned colonies.

## Files

- **`cargo-transfer.ts`** — `previewCargoTransfer(userId, request)` and `launchCargoTransfer(userId, request)` action modules. Implements the atomic cargo transfer flow:
  - Validates ship ownership, idle state, logistics role, and planet location.
  - Confirms origin and target are player settlements through `features/colonies/ownership.ts`, so the home capital works even though it has no `colonies` row.
  - Requires Logistics research for cargo usage; the same requirement is mirrored by ship construction so the UI blocks transporter builds before a player reaches an unusable send flow.
  - Requires explicit `routeMode='jump_gate'` cargo routes to connect owned settlements in the player's Home system or discovered public common systems.
  - Normalizes multiple load lines in one transfer order, aggregates duplicate resource ids for reservation/delivery, and enforces the ship cargo capacity limit.
  - Calculates travel ETA, ordinary route fuel, optional Jump Fuel, distance, speed, and timer metadata server-side for both preview and launch. Same-system transfers use the shared planet-map distance between the origin and target bodies instead of the parent system's sector coordinate.
  - Reserves resources atomically on the origin planet (via `spendResources`), adding ordinary `fuel` and the shared Jump Fuel surcharge when the request explicitly selects `routeMode='jump_gate'`.
  - Creates a one-way `expeditions` record with type `cargo_transfer`.
  - Sets ship status to `moving` and populates `cargoJson`.
  - Optionally enqueues a BullMQ `arrive_cargo` job for delivery processing when `ENABLE_BULLMQ=true`; otherwise the expedition poller and online sync complete the transfer from Postgres.
  - Exports `completeCargoTransfer(expedition, shipId, tx, options?)`, used by both the cargo worker and active-session expedition sync to finish one-way delivery without a return phase.
  - `completeCargoTransfer` conditionally claims only `in_flight` / `returning` cargo expeditions before applying target gains, so repeated or concurrent worker jobs settle the cargo once. Delivery uses `gainResources`, which creates a zero-regen target stockpile row if the destination has never stored that resource.
- **`cargo-transfer.test.ts`** — Integration tests for Logistics gating, cargo transfer previews, Home ↔ common-colony Jump Gate routes, insufficient route fuel / Jump Fuel, discovered-only target rejection, and idempotent worker delivery.

## Transfer Rules

1. **Ownership**: Source and target planets must both be player settlements, either the home capital with an operational Command Center or an active `colonies` row.
2. **Capacity**: Total resource weight across all load lines must not exceed the ship's cargo capacity (`cargo_light` currently carries 5000).
3. **Idle**: Ship must be in `idle` status.
4. **Ship role**: Only logistics-role ships such as `cargo_light` can use `/cargo/transfer`; scouts and colonizers are rejected even if their catalog cargo value is non-zero.
5. **Distinct**: Source and target must be different planets.
6. **Jump Gate route cost**: Standard logistics transfers keep the existing cargo route. Explicit `routeMode='jump_gate'` transfers must target a different system, require an unlocked, idle Jump Gate, and connect only the player's Home system or known public common systems.
7. **Research gate**: Cargo transfer usage requires Logistics level 1. The shipyard UI mirrors the same gate for `cargo_light` construction so players see the missing research before building a transporter.
8. **Atomic reservation**: Resources, ordinary route `fuel`, and any selected Jump Fuel surcharge are deducted from the origin planet within the same DB transaction as the expedition record creation.
9. **No duplication on cancel**: Resources are reserved up-front; delivery only adds to target when the expedition poller, BullMQ worker (if enabled), or online expedition sync completes the one-way transfer.
10. **Idempotent settlement**: The delivery helper claims the expedition row before granting resources, preventing duplicate worker execution from crediting the target twice.
11. **New target resources**: A cargo load may deliver resources absent from the destination inventory; the target row is created with `regenRate=0` and the delivered amount.

## Adding a new logistics action

1. Create a new file `<action-name>.ts` in this directory.
2. Follow the `launchCargoTransfer` pattern: validate → reserve → record → optional BullMQ enqueue.
3. Add an integration test file `<action-name>.test.ts`.
4. Register the route in `backend/src/routes/cargo.ts` or a new route file.
5. Mount the route in `backend/src/index.ts`.
6. Update this README.
