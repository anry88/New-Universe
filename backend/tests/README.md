# `backend/tests` directory

This directory contains integration and end-to-end tests for the backend.

## Layout

- [`e2e/`](e2e/README.md) — end-to-end tests that simulate full player journeys using mocked Telegram authentication, including the documented Phase 2, Jump Gate, and Phase 3 combat regression gates.
- [`security/`](security/README.md) — security regression tests that exercise database-backed abuse cases such as economy duplication, worker idempotency, and cargo settlement races.

## Adding a new test

1. Create a new file ending in `.test.ts` in the appropriate subdirectory.
2. Use `vitest` and `app.inject()` to simulate HTTP requests.
3. If the test requires database access, import `db` from `../../src/db/index.js`.

## Verification commands

- `npm run test:e2e` — runs all tests in this directory.
- `npm run security:economy` — runs the economy exploit regression suite.
