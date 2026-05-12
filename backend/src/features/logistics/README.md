# `backend/src/features/logistics` directory

Interplanetary logistics — cargo transfers between player-owned colonies.

## Files

- **`cargo-transfer.ts`** — `launchCargoTransfer(userId, request)` action module. Implements the atomic cargo transfer flow:
  - Validates ship ownership, idle state, and planet location.
  - Confirms target planet is owned by the player (via `colonies` table).
  - Normalizes multiple load lines in one transfer order, aggregates duplicate resource ids for reservation/delivery, and enforces the ship cargo capacity limit.
  - Calculates travel ETA based on 3D distance, ship speed, and research effects.
  - Reserves resources atomically on the origin planet (via `spendResources`).
  - Creates a one-way `expeditions` record with type `cargo_transfer`.
  - Sets ship status to `moving` and populates `cargoJson`.
  - Enqueues a BullMQ `arrive_cargo` job for delivery processing.
  - Exports `completeCargoTransfer(expedition, shipId, tx, options?)`, used by both the cargo worker and active-session expedition sync to finish one-way delivery without a return phase.
- **`cargo-transfer.test.ts`** — Integration tests for the cargo transfer flow.

## Transfer Rules

1. **Ownership**: Source and target planets must both be owned by the requesting player.
2. **Capacity**: Total resource weight across all load lines must not exceed the ship's cargo capacity (`cargo_light` currently carries 5000).
3. **Idle**: Ship must be in `idle` status.
4. **Distinct**: Source and target must be different planets.
5. **Atomic reservation**: Resources are deducted from the origin planet within the same DB transaction as the expedition record creation.
6. **No duplication on cancel**: Resources are reserved up-front; delivery only adds to target when the BullMQ worker or online expedition sync completes the one-way transfer.

## Adding a new logistics action

1. Create a new file `<action-name>.ts` in this directory.
2. Follow the `launchCargoTransfer` pattern: validate → reserve → record → enqueue.
3. Add an integration test file `<action-name>.test.ts`.
4. Register the route in `backend/src/routes/cargo.ts` or a new route file.
5. Mount the route in `backend/src/index.ts`.
6. Update this README.
