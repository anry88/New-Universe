# `backend/tests` directory

This directory contains integration and end-to-end tests for the backend.

## Layout

- [`e2e/`](e2e/README.md) — end-to-end tests that simulate full player journeys using mocked Telegram authentication.

## Adding a new test

1. Create a new file ending in `.test.ts` in the appropriate subdirectory.
2. Use `vitest` and `app.inject()` to simulate HTTP requests.
3. If the test requires database access, import `db` from `../../src/db/index.js`.

## Verification commands

- `npm run test:e2e` — runs all tests in this directory.
