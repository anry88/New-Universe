# Phase 2 regression suite

Gate scenario before Phase 3 breakdown ([P2-POL-003](https://github.com/anry88/New-Universe/issues/74)). It is also cited from the Phase 2 polish epic rollup ([P2-EPIC-POLISH](https://github.com/anry88/New-Universe/issues/93); see [`tasks/ROADMAP_COVERAGE_MATRIX.md`](../../tasks/ROADMAP_COVERAGE_MATRIX.md)). One integration test exercises **research** (mining I start + worker completion), **colonization** (first extra colony via colonizer), **cargo** (player transfer between owned planets), and **market** (first NPC broker sell order), with strict planet balance checks so stock is not double-counted across cargo debits and market reservations.

## Covered paths

| Area          | HTTP / DB actions |
|---------------|-------------------|
| Research      | `POST /research/start` (mining), `processCompletedResearch` fast-forward |
| Colonization  | `POST /colonies/found` after gates satisfied |
| Cargo         | `POST /cargo/transfer` (iron), asserts home planet amount drops exactly by transfer size |
| Market        | `POST /market/orders` NPC **sell**, asserts carbon on home drops exactly by sold quantity |

Assertion messages are prefixed with `[Research]`, `[Colonization]`, `[Cargo]`, or `[Market]` so Vitest failures point to the owning feature area.

## Local execution

From the repo root:

```bash
cd backend
npm run test:e2e -- phase2-regression
```

Or target the file explicitly:

```bash
cd backend
npx vitest run tests/e2e/phase2-regression.test.ts
```

Full backend unit + integration + e2e:

```bash
cd backend
npm test
```

Requirements: same as other backend tests (Postgres + Redis per `backend/.env` / Docker Compose, seeded catalogs).

## CI execution

Default PR workflow ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) runs `npm test` in the backend container, which includes `backend/tests/e2e/*.test.ts`, including this suite. No extra label or job is required.

Browser Playwright E2E ([`e2e.yml`](../../.github/workflows/e2e.yml)) is unrelated to this backend regression test.
