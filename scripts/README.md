# `scripts` directory

Automation entry points used by AI agents and CI parity checks — not imported by application runtime code.

## Files

- **`ci-verify.sh`** — runs the same sequence as [.github/workflows/ci.yml](../.github/workflows/ci.yml): Docker Postgres/Redis, backend lint/build/migrate/seed/test via `docker compose run`, frontend lint/build/unit tests via the `frontend` Compose profile, then host-side `npm ci` + Playwright Chromium install + `npm run test:e2e` in `frontend/`. Always ends with `docker compose down -v` (via `trap`) so volumes match a clean CI runner.

## Conventions

- Keep this script aligned with `ci.yml`: when adding or reordering CI steps, update both in one change.
- Agents must not report repository-wide “verification passed” without either green GitHub Actions on the PR or a successful `./scripts/ci-verify.sh` run when Docker is available.
