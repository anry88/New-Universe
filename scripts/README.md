# `scripts` directory

Automation helpers for agents — not imported by application runtime code.

## Files

- **`ci-verify.sh`** — Runs the same Docker-backed sequence as [.github/workflows/ci.yml](../.github/workflows/ci.yml), including backend migrations/seed data before the `npm run security:check` gate, then lint/build/tests. Playwright is **off by default** (matches default PR CI). Set `RUN_PLAYWRIGHT_E2E=1` to also run `frontend` Playwright as in [.github/workflows/e2e.yml](../.github/workflows/e2e.yml). Ends with `docker compose down -v`.
- **Research catalog gate (backend)** — quick Vitest-only check for the shared tech tree: from `backend/`, run `npm run research:catalog-check` (task **P2.1-417** / CI parity for structure and scaling assertions).

Related offline tooling: [`tools/balance-sim/README.md`](../tools/balance-sim/README.md) (economy simulator; not part of `ci-verify.sh` today). Epic **P2-EPIC-POLISH** ties simulator output, seed audit, and this regression suite together — see [`tasks/ROADMAP_COVERAGE_MATRIX.md`](../tasks/ROADMAP_COVERAGE_MATRIX.md) (*Phase 2 polish epic gate*).

## Conventions

- When CI steps change, update `ci-verify.sh` and [.github/workflows/ci.yml](../.github/workflows/ci.yml) together. Keep the `security` job and local `npm run security:check` step aligned, including any migration/seed prerequisites for database-backed security tests.
- When Playwright install/run commands change, update [.github/workflows/e2e.yml](../.github/workflows/e2e.yml) and the `RUN_PLAYWRIGHT_E2E` block in `ci-verify.sh` together.
- Do not report repository-wide “verification passed” without a green **`ci.yml`** run on the PR or a successful `./scripts/ci-verify.sh` when Docker is available.
