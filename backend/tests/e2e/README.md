# `backend/tests/e2e` directory

This directory contains end-to-end tests that validate full game loops.

## Files

- **`colonization.test.ts`** — implements the "Colonization Lifecycle" scenario (task P2-COL-008).
  - Verifies colonization prerequisites and research gates.
  - Tests colonization cooldown and capacity limits.
  - Validates successful colony founding and initial cargo transfers.
- **`first-day.test.ts`** — implements the "First Day" player journey (task P1-240).
  - Verifies registration and home system generation.
  - Tests selected-resource mine construction and upgrades.
  - Simulates ship production and expedition launching.
  - Validates fog-of-war discovery mechanics and resource constraints.
- **`jump-gate-regression.test.ts`** — implements the Phase 2.3 Jump Gate regression scenario (task P2.3-508).
  - Verifies Jump Drive unlock, random jump, known-destination repeat jump, Common Pool discovery, colonizer settlement, and Jump Gate cargo delivery.
  - Checks stale foreign Home System rows are filtered from Jump Gate known destinations, sector anchors, and sector presence payloads.
  - Re-runs worker/online-sync paths to assert discovery, colony, command center, and cargo delivery side effects are idempotent.
- **`combat-regression.test.ts`** — implements the Phase 3 combat roll-up scenario ([`docs/testing/combat-regression.md`](../../../docs/testing/combat-regression.md), task P3-COM-012).
  - Verifies Military Shipyard construction, light combat ship production, fuel loading, ship combat, bombing, Command Center wipe, and colonization re-check.
  - Pairs with `backend/src/features/ships/refuel.test.ts` for the focused refuel transfer and concurrency evidence.
- **`phase2-regression.test.ts`** — Phase 2 gate ([`docs/testing/phase2-regression.md`](../../../docs/testing/phase2-regression.md), task P2-POL-003).
  - One player journey: mining research completion → first extra colony → `cargo_light` transfer.
  - Assert messages use `[Research]` / `[Colonization]` / `[Cargo]` prefixes for failure triage.

## Conventions

- Tests use `app.inject()` to avoid starting a real HTTP server.
- Telegram authentication is mocked using `createValidInitData` helper.
- Time-based mechanics are fast-forwarded by manually updating `queueCompletesAt` or `status` in the database.
