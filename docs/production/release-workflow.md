# Production release workflow

Task: [P4-DEP-002](https://github.com/anry88/New-Universe/issues/82)
Created: 2026-05-13
Depends on: [P4-DEP-001](environment.md), [P0-006](../../.github/workflows/ci.yml)

This document describes the repository-side deployment workflow for the near-free closed-alpha topology chosen in [`environment.md`](environment.md). The workflow is deliberately manual and environment-gated: production must not be dispatched until staging deploy and rollback have both succeeded.

## Workflow entry point

Deployment runs through [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml), using `workflow_dispatch` only.

The workflow supports two actions:

- `deploy` - builds the backend and frontend, pauses the worker, runs Drizzle migrations/seeders when enabled, deploys the API, deploys the worker, deploys Cloudflare Pages, then creates a git tag and GitHub release changelog.
- `rollback` - redeploys previously tagged Fly images for the API and worker, rebuilds the frontend from the same git tag, and publishes that frontend build to Cloudflare Pages.

GitHub Environment protection is the approval gate. Configure two environments before dispatching:

| Environment | Required protection | Purpose |
| --- | --- | --- |
| `staging` | At least one required reviewer once external accounts exist. | First deployment target and rollback drill target. |
| `production` | Required reviewer, protected branch limited to `main`, admin bypass disabled if available. | Real player-facing target after a successful staging drill. |

GitHub environments hold secrets separately. Environment secrets are not available to jobs until the environment gate is approved.

## Required GitHub Environment values

Set these values on both `staging` and `production`, with separate provider resources for each environment.

| Name | Type | Used by | Notes |
| --- | --- | --- | --- |
| `FLY_API_TOKEN` | secret | Fly deploy / rollback | Use a Fly deploy token scoped as narrowly as practical. |
| `FLY_API_APP` | variable | Fly API deploy | Fly app name for the Fastify API. |
| `FLY_WORKER_APP` | variable | Fly worker deploy | Fly app name for the BullMQ worker. Keep it separate from the API app for closed alpha. |
| `FLY_PRIMARY_REGION` | variable, optional | Generated Fly configs | Defaults to `ams` in the workflow when unset. |
| `DATABASE_URL` | secret | Migration/seed step | Neon connection string for the target environment. |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare Pages deploy | Token with Pages deployment permission for the chosen project. |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Cloudflare Pages deploy | Cloudflare account id. |
| `CLOUDFLARE_PAGES_PROJECT` | variable | Cloudflare Pages deploy | Pages project name. |
| `VITE_API_URL` | variable | Frontend build | Public API HTTPS origin for the target environment. |
| `VITE_TG_BOT_NAME` | variable | Frontend build | Telegram bot username shown by the Mini App. |
| `VITE_SENTRY_DSN` | secret | Frontend build | Optional; leave empty to keep frontend Sentry disabled. |

Provider runtime secrets such as `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_SECRET`, `JWT_SECRET`, `SERVER_SECRET`, `REDIS_URL`, `PUBLIC_FRONTEND_URL`, and `TELEGRAM_APP_URL` remain Fly app secrets. They are not materialized into the workflow unless a step needs them directly.

## Deploy sequence

1. Dispatch **Deploy** from GitHub Actions.
2. Choose `action=deploy`.
3. Choose `target_environment=staging` first.
4. Leave `release_tag` empty for staging unless a specific tag is needed. The workflow generates `staging-<run_number>-<sha>`.
5. Keep `run_migrations=true` unless this is an intentional no-schema redeploy.
6. Approve the `staging` environment gate.
7. The workflow builds backend and frontend artifacts.
8. The deploy job stops the worker app with `flyctl scale count 0`.
9. If enabled, the deploy job runs `npm run db:migrate` and `npm run db:seed` against the target `DATABASE_URL`.
10. The API app deploys through `flyctl deploy` with the release tag as the Fly image label.
11. The worker app deploys from the same backend Docker context with `npm run worker` as the process command, then scales back to one machine.
12. The frontend artifact deploys through `npx wrangler pages deploy`.
13. After deployment succeeds, the release job creates a git tag and GitHub Release changelog.

The workflow copies `shared/` into `backend/shared` inside the runner before Fly builds. This keeps the current backend Dockerfile working with the `@shared/*` TypeScript path without committing generated build context files.

## Production gate

Production deploys add three hard checks:

- The workflow must be dispatched from `main`.
- `release_tag` must be explicit and semver-like, for example `v1.2.3`.
- `staging_drill_run_url` must link to the successful staging deploy and rollback drill run.

If any check fails, the workflow stops before environment secrets are used.

## Migration safety

The first deployment target has one worker process. The workflow handles migrations by pausing the worker before schema changes and restarting it only after the new worker image is deployed.

Rules:

- Prefer additive migrations.
- Do not run destructive migrations without a written forward-fix and restore plan.
- Do not run migrations from multiple places. The deployment workflow is the single migration actor for staging/production releases.
- Keep seeders idempotent; deployment runs `npm run db:seed` after migrations to keep reference catalogs aligned.
- If migration compatibility is unclear, deploy to staging, run a rollback drill, and stop before production.

## Rollback sequence

Use rollback when the current app image or frontend build is bad and the database schema is still compatible with the chosen rollback tag.

1. Open the last successful deployment run or GitHub Release.
2. Copy the previous good `release_tag`.
3. Dispatch **Deploy**.
4. Choose `action=rollback`.
5. Choose the same `target_environment` that needs rollback.
6. Set `rollback_release_tag` to the previous good tag.
7. Approve the environment gate.
8. The workflow stops the worker, redeploys `registry.fly.io/$FLY_API_APP:<tag>`, redeploys `registry.fly.io/$FLY_WORKER_APP:<tag>`, scales the worker back to one, builds the frontend from the git tag, and uploads it to Cloudflare Pages.

Rollback does not run database migrations. If the bad release changed the schema incompatibly, use a forward-fix migration or restore process instead of app-image rollback.

## Staging deployment and rollback drill

Run this drill before the first production deployment and after every material workflow change.

| Step | Evidence |
| --- | --- |
| Dispatch `action=deploy`, `target_environment=staging`. | Workflow run URL. |
| Confirm API health at the staging API URL. | `/health` response timestamp. |
| Confirm Telegram staging bot opens the staging Mini App. | Screenshot or manual note. |
| Confirm `/auth/telegram` and `/me` succeed in staging. | Manual note with time. |
| Confirm one worker-driven timer completes. | Building/research/ship/expedition completion note. |
| Confirm GitHub tag and release changelog were created. | Release URL. |
| Dispatch `action=rollback`, `target_environment=staging`, `rollback_release_tag=<previous-good-tag>`. | Rollback workflow run URL. |
| Confirm API/frontend return to the previous good version and worker is running. | Manual note with time. |

Current drill status: **not run**. Provider accounts, GitHub Environment secrets, staging Fly apps, Cloudflare Pages project, Neon database, Upstash Redis, and Telegram staging bot must be configured before this task can be marked fully accepted.

## Verification checklist

- [x] Deploy pipeline exists at `.github/workflows/deploy.yml`.
- [x] Pipeline is manual and environment-gated.
- [x] Production deploys are restricted to `main` and require staging drill evidence.
- [x] Database migrations and seeders run with the worker paused.
- [x] Release tags and GitHub Release changelogs are generated after deploy success.
- [x] Rollback procedure is documented and has workflow support.
- [ ] Staging deployment drill has been run.
- [ ] Staging rollback drill has been run.

## External references

- GitHub Environment protection rules and environment secrets: <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>
- GitHub `workflow_dispatch` inputs: <https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow>
- Fly.io GitHub Actions deploy guide: <https://fly.io/docs/launch/continuous-deployment-with-github-actions/>
- Fly.io app configuration, release commands, processes, and VM sizing: <https://fly.io/docs/reference/configuration/>
- Fly.io rollback guide: <https://fly.io/docs/blueprints/rollback-guide/>
- Cloudflare Pages Wrangler deploy command: <https://developers.cloudflare.com/workers/wrangler/commands/pages/>
