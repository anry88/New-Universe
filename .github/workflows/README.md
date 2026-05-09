# GitHub Actions workflows

Short reference for agents — keep in sync when editing YAML.

## Workflows

- **`ci.yml`** — Runs on every PR to `main`: Docker Postgres/Redis, backend lint/build/migrate/seed/unit tests, frontend lint/build/unit tests. **Does not** run Playwright (fast feedback on small PRs).

- **`e2e.yml`** — Playwright Chromium against `frontend/tests/e2e`. Runs when:
  - **Workflow dispatch** (Actions → E2E → Run workflow).
  - **Pull request** to `main` **and** the PR has the explicit label **`run-e2e`** (add it when you want a full browser gate — e.g. epic wrap-up).  
    **Do not** match on `epic:…` labels: every imported task issue gets `epic:EPIC-…` from [`tasks/import_to_github_idempotent.sh`](../tasks/import_to_github_idempotent.sh), so that would trigger E2E on every issue close or mis-label every PR.

Agents **must** add **`run-e2e`** on PRs that close epic rollup tasks (`*-EPIC-*` ids in `tasks/tasks.json`) — see [`AGENTS.md`](../AGENTS.md) (Epic closure).

Required status checks in branch protection should include the **`ci.yml`** job (`check`) only if you want small PRs to stay fast; add the **`e2e.yml`** job only when you require browser E2E on every merge (not recommended with this layout).

- **`project-status.yml`** — Project automation (task IDs, board columns).
