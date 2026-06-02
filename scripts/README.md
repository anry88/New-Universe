# `scripts` directory

Automation helpers for agents — not imported by application runtime code.

## Files

- **`ci-verify.sh`** — Runs the same Docker-backed sequence as [.github/workflows/ci.yml](../.github/workflows/ci.yml), including backend migrations/seed data before the `npm run security:check` gate, then lint/build/tests. Playwright is **off by default** (matches default PR CI). Set `RUN_PLAYWRIGHT_E2E=1` to also run `frontend` Playwright as in [.github/workflows/e2e.yml](../.github/workflows/e2e.yml). Ends with `docker compose down -v`.
- **`deploy-hdc.sh`** — Current deploy script for the Windows Docker host. Run it from the operator machine, not GitHub Actions: `scripts/deploy-hdc.sh --environment prod`. It builds `api`, `frontend`, and `migrate` images on Docker context `hdc`, syncs Docker-host infra files to `D:\new-universe\deploy\<env>\repo`, updates `IMAGE_TAG` in the Windows env file, stops the worker, runs migrations/seeders once, starts API/frontend, then starts the worker and smoke-tests public `/health` endpoints.
- **`deploy-local.sh`** — Legacy Fly.io / Cloudflare Pages entrypoint kept as a blocker. It always exits with instructions to use `deploy-hdc.sh`; restoring cloud deploys should be a deliberate code change after data is migrated back to cloud.
- **`deploy-local.staging.env.example`** — Legacy cloud deploy template kept only as a reference for a future migration back to Fly/Pages.
- **`docker-host-verify.sh`** — Validates the production Docker-host Compose stack under [`infra/docker-host`](../infra/docker-host/README.md) with a generated temporary env file. By default it runs `docker compose config` only; set `RUN_DOCKER_HOST_BUILD=1` to build backend/frontend host images and `RUN_DOCKER_HOST_STACK=1` to start isolated Postgres/Redis health checks, with API/frontend health checks enabled when images were built. Invoke it as `bash scripts/docker-host-verify.sh` so it does not depend on executable-bit preservation across host filesystems.
- **Research catalog gate (backend)** — quick Vitest-only check for the shared tech tree: from `backend/`, run `npm run research:catalog-check` (task **P2.1-417** / CI parity for structure and scaling assertions).

Related offline tooling: [`tools/balance-sim/README.md`](../tools/balance-sim/README.md) (economy simulator; not part of `ci-verify.sh` today). Epic **P2-EPIC-POLISH** ties simulator output, seed audit, and this regression suite together — see [`tasks/ROADMAP_COVERAGE_MATRIX.md`](../tasks/ROADMAP_COVERAGE_MATRIX.md) (*Phase 2 polish epic gate*).

## Conventions

- When CI steps change, update `ci-verify.sh` and [.github/workflows/ci.yml](../.github/workflows/ci.yml) together. Keep the `security` job and local `npm run security:check` step aligned, including any migration/seed prerequisites for database-backed security tests.
- When Playwright install/run commands change, update [.github/workflows/e2e.yml](../.github/workflows/e2e.yml) and the `RUN_PLAYWRIGHT_E2E` block in `ci-verify.sh` together.
- Keep `deploy-hdc.sh` and [`infra/docker-host/windows/deploy.ps1`](../infra/docker-host/windows/deploy.ps1) aligned for deploy order: build immutable images, stop worker, run migrations/seeders once, start API/frontend, start worker, smoke-test.
- Do not re-enable `deploy-local.sh` or GitHub cloud deploys until the active data path has been moved back from Windows Postgres to a cloud database.
- Do not report repository-wide “verification passed” without a green **`ci.yml`** run on the PR or a successful `./scripts/ci-verify.sh` when Docker is available.
