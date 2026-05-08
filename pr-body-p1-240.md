## Summary
Implemented the **First-Day E2E integration test** to validate the core player journey from registration to space exploration.

## Key Changes
- **E2E Test**: Created `backend/tests/e2e/first-day.test.ts` which simulates:
  - User registration via Telegram.
  - Automatic home system and planet generation.
  - Building construction (Mine) and upgrades.
  - Ship production (Scout).
  - Expedition launching, arrival at target, and return home.
  - Fog-of-war discovery and resource constraint validation.
- **Infrastructure**:
  - Updated `backend/vitest.config.ts` to discover tests in the `tests/` directory.
  - Added `test:e2e` script to `backend/package.json`.
  - Updated `docker-compose.yml` to mount the `tests/` directory.
- **Bug Fixes & Improvements**:
  - Refactored `tick-expeditions.ts` query to select specific columns, avoiding join ambiguity.
  - Added defensive checks to `calculateExpeditionPosition` for invalid/missing data.
  - Replaced `tx.query` with `tx.select` in notification handling for better stability.

## Verification
- Ran `npm run test:e2e` inside the backend container.
- All 2 tests passed (Full Flow and Resource Constraints).

Closes #38
