# `backend/tests/security` directory

This directory contains Docker-backed security regression suites that need the real backend database schema and seed data.

## Files

- **`economy-exploits.test.ts`** — economy abuse regression suite for task `P4-SEC-002`. Covers duplicate resource spend rollback, future-timestamp accrual skew, repeated building/production worker ticks, and concurrent cargo arrival idempotency.

## Adding a new security regression

1. Add a focused `*.test.ts` file for the abuse class.
2. Seed only the catalogs required by the tested path.
3. Prefer direct service/worker calls when the exploit is below the HTTP layer.
4. Add the file to `backend/package.json` scripts if it should run in `npm run security:check`.

## Verification

```bash
npm run security:economy
npm run security:check
```
