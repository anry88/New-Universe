# `backend/tests/e2e` directory

This directory contains end-to-end tests that validate full game loops.

## Files

- **`first-day.test.ts`** — implements the "First Day" player journey (task P1-240).
  - Verifies registration and home system generation.
  - Tests selected-resource mine construction and upgrades.
  - Simulates ship production and expedition launching.
  - Validates fog-of-war discovery mechanics and resource constraints.
- **`colonization.test.ts`** — implements the "Colonization Lifecycle" scenario (task P2-COL-008).
  - Verifies colonization prerequisites and research gates.
  - Tests colonization cooldown and capacity limits.
  - Validates successful colony founding and initial cargo transfers.
- **`phase2-regression.test.ts`** — Phase 2 gate ([`docs/testing/phase2-regression.md`](../../../docs/testing/phase2-regression.md), task P2-POL-003).
  - One player journey: mining research completion → first extra colony → `cargo_light` transfer.
  - Assert messages use `[Research]` / `[Colonization]` / `[Cargo]` prefixes for failure triage.

## Conventions

- Tests use `app.inject()` to avoid starting a real HTTP server.
- Telegram authentication is mocked using `createValidInitData` helper.
- Time-based mechanics are fast-forwarded by manually updating `queueCompletesAt` or `status` in the database.
