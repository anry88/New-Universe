# GitHub Actions workflows

Short reference for agents — keep in sync when editing YAML.

## Workflows

- **`ci.yml`** — Runs on PRs and pushes to `main` only when code/tooling paths change (`backend/`, `frontend/`, `shared/`, `scripts/`, `tools/`, `dev/`, `docker-compose.yml`, or this workflow). Docs-only / README-only changes do not trigger it:
  - `security` job: Docker-backed backend migrations/seed data plus `npm run security:check` for route security metadata/schema audits, rate-limit key checks, Telegram initData replay-window tests, and economy exploit regressions.
  - `check` job: Docker Postgres/Redis, backend lint/build/migrate/seed/unit tests, frontend lint/build/unit tests.
    **Does not** run Playwright (fast feedback on small PRs).

- **`e2e.yml`** — Playwright Chromium against `frontend/tests/e2e`. Pull request events are path-filtered to the same code/tooling paths as `ci.yml`, so docs-only / README-only changes do not trigger it. Runs when:
  - **Workflow dispatch** (Actions → E2E → Run workflow).
  - **Pull request** to `main` **and** the PR has the explicit label **`run-e2e`** (add it when you want a full browser gate — e.g. epic wrap-up).  
    The label must exist in the repository (create **`run-e2e`** once under *Issues → Labels* or via `gh label create run-e2e`); without it, GitHub cannot attach it to a PR and E2E will never satisfy the workflow `if:` guard.
    **Do not** match on `epic:…` labels: every imported task issue gets `epic:EPIC-…` from [`tasks/import_to_github_idempotent.sh`](../tasks/import_to_github_idempotent.sh), so that would trigger E2E on every issue close or mis-label every PR.

Agents **must** add **`run-e2e`** on PRs that close epic rollup tasks (`*-EPIC-*` ids in `tasks/tasks.json`) — see [`AGENTS.md`](../AGENTS.md) (Epic closure).

Required status checks in branch protection should include the **`ci.yml`** jobs (`security` and `check`) if you want small PRs to stay fast while still blocking obvious launch-security regressions; add the **`e2e.yml`** job only when you require browser E2E on every merge (not recommended with this layout).

- **`project-status.yml`** — Project automation (task IDs, board columns). Runs on PR events, issue closed, and **`workflow_dispatch`** (Actions → Project Status → Run workflow) to call `node tasks/project_status.mjs sync-ready` without opening a PR. On **manual dispatch**, the PR sync and issue-close sync steps are **skipped** (`if: github.event_name == 'pull_request'` / `issues`) — only `sync-ready` runs; this is expected. The job sets **`TASKS_JSON`** to `${{ github.workspace }}/tasks/tasks.json` so the script always reads the checked-out plan file.
