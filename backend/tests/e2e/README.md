# `backend/tests/e2e` directory

This directory contains end-to-end tests that validate full game loops.

## Files

- **`first-day.test.ts`** — implements the "First Day" player journey (task P1-240).
  - Verifies registration and home system generation.
  - Tests building construction and upgrades.
  - Simulates ship production and expedition launching.
  - Validates fog-of-war discovery mechanics and resource constraints.
- **`colonization.test.ts`** — implements the "Colonization Lifecycle" scenario (task P2-COL-008).
  - Verifies colonization prerequisites and research gates.
  - Tests colonization cooldown and capacity limits.
  - Validates successful colony founding and initial cargo transfers.

## Conventions

- Tests use `app.inject()` to avoid starting a real HTTP server.
- Telegram authentication is mocked using `createValidInitData` helper.
- Time-based mechanics are fast-forwarded by manually updating `queueCompletesAt` or `status` in the database.
