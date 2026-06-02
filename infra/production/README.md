# `infra/production` directory

This directory is the production infrastructure planning surface for New Universe. It intentionally starts with documentation only; no Terraform, Compose overrides, provider manifests, deploy keys, or generated secrets belong here until the first environment plan has been reviewed.

## Files

- **`README.md`** - production infrastructure runbook. It now tracks the Windows Docker host as the active deployment target and keeps the old cloud topology as fallback inventory.
- **`docs/production/windows-host-migration.md`** - Windows Docker host preparation and staging-data migration runbook for the purchased-domain single-host track.
- **`infra/docker-host/`** - Docker-host compose stack, production image Dockerfiles, Node frontend static server, Windows host preparation helper, and non-secret env template.
- **`.github/workflows/deploy.yml`** - disabled cloud deploy blocker. It exists so accidental manual dispatches fail before checkout, secrets, migrations, Fly.io, or Cloudflare Pages.

Related production plan: [`docs/production/environment.md`](../../docs/production/environment.md).
Observability runbook: [`docs/production/observability.md`](../../docs/production/observability.md).
Release workflow: [`docs/production/release-workflow.md`](../../docs/production/release-workflow.md).

## Active target

As of 2026-06-02, the active production-like environment is the purchased-domain Windows Docker host:

- Docker-host frontend container served through Cloudflare Tunnel at `new-universe.tg-games.com`.
- Docker-host API container served through Cloudflare Tunnel at `new-universe-api.tg-games.com`.
- One Docker-host worker container.
- Postgres 17 container with data stored on the Windows host outside the container.
- Redis container with append-only data stored on the Windows host outside the container.
- VictoriaMetrics/Grafana scraping the API internally over Docker network alias `nu-prod-api:3000`.
- Sentry Free for backend/frontend exception capture, plus VictoriaMetrics/vmalert/Grafana for the `/metrics` scrape surface documented in [`docs/production/observability.md`](../../docs/production/observability.md).

Cloudflare Pages, Fly.io, Neon, and Upstash resources remain available only as fallback inventory. Do not deploy to them again until a reverse data migration back to cloud has been executed.

## Windows host migration track

The Windows migration was executed on 2026-06-02. The runbook is [`docs/production/windows-host-migration.md`](../../docs/production/windows-host-migration.md). It preserves these deployment safety boundaries:

- the Fly.io / Neon / Upstash / Cloudflare Pages resources stay available as cloud fallback inventory;
- Postgres remains the durable source of truth and migrations run once with the worker stopped;
- Redis is treated as queue/cache state unless a later audit proves otherwise;
- the app remains portable through `DATABASE_URL`, `REDIS_URL`, `PUBLIC_FRONTEND_URL`, `TELEGRAM_APP_URL`, and `VITE_API_URL`;
- the Windows host supports two instances through separate Compose project names, env files, domains, and volumes.

## Deploy order

Routine deploys run from the operator machine:

```bash
scripts/deploy-hdc.sh --environment prod
```

The script builds images on Docker context `hdc`, syncs Docker-host infra files to the Windows checkout, stops the worker, runs Drizzle migrations/seeders once, starts API/frontend, starts the worker, then smoke-tests public `/health` endpoints.

## Environment ownership

Backend and worker runtime values live in the backend/worker provider secret store:

- `DATABASE_URL`
- `REDIS_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_SECRET`
- `JWT_SECRET`
- `SERVER_SECRET`
- `SENTRY_DSN`
- `PUBLIC_FRONTEND_URL`
- `TELEGRAM_APP_URL`
- `ADMIN_TELEGRAM_IDS`
- `ADMIN_TELEGRAM_CHAT_IDS`
- `RATE_LIMIT_WINDOW`
- `RATE_LIMIT_GLOBAL_MAX`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_MUTATION_MAX`
- `RATE_LIMIT_WEBHOOK_MAX`
- `DIAMOND_STARTING_GRANT`
- `DIAMOND_RUSH_PER_MINUTE`
- `DIAMOND_RUSH_MAX_PER_ACTION`

Frontend build-time values are embedded when `scripts/deploy-hdc.sh` builds the Docker-host frontend image. Public values are read from the Windows env file:

- `VITE_API_URL`
- `VITE_TG_BOT_NAME`
- `VITE_SENTRY_DSN`

Never store production values in committed `.env` files. `.env.example` remains a local-development template only.

## Deploy runbook

For routine deploys:

1. Record the git SHA being deployed.
2. Run `scripts/deploy-hdc.sh --environment prod`.
3. Confirm the script's smoke tests pass.
4. Confirm `/metrics` shows `nu_api_up`, `nu_db_available`, and `nu_redis_available` as `1`.
5. Record the image tag, usually `hdc-<git-short-sha>`.

Do not run migrations from multiple places. Do not start the worker until migrations are complete.

## Rollback runbook

1. If the incident involves duplicated jobs, resource mutation, or schema mismatch, stop the worker first.
2. If the schema is compatible, redeploy a previous known-good checkout or image tag through `scripts/deploy-hdc.sh`.
3. If only the worker is unsafe, leave it stopped with `--skip-worker` until a fix is deployed.
4. If schema compatibility is unknown, keep writes stopped and ship a forward fix.
5. Use Windows Postgres dump restore only after taking a fresh backup and accepting the data-loss window.
6. Reset the Telegram webhook only if the API origin changed or the current webhook target is unhealthy.

## Automation boundaries

Provider manifests and future deploy helpers may be added here, but they must preserve these boundaries:

- Secrets are referenced by name only, never materialized in git.
- Migrations run as an explicit single step before worker rollout.
- Worker rollout is independent from API rollout.
- Rollback uses immutable image tags or known-good git SHAs.
- Billing alerts are configured before moving back to managed cloud services.
- Production automation must update this README and [`docs/production/environment.md`](../../docs/production/environment.md) in the same change.

## Review checklist

- [x] This directory contains no secrets.
- [x] GitHub cloud deploy is disabled while Windows is live.
- [x] The active target is aligned with the Windows-host runbook.
- [x] Deploy and rollback responsibilities are documented before automation work starts.
