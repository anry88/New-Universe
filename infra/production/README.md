# `infra/production` directory

This directory is the production infrastructure planning surface for New Universe. It intentionally starts with documentation only; no Terraform, Compose overrides, provider manifests, deploy keys, or generated secrets belong here until the first environment plan has been reviewed.

## Files

- **`README.md`** - production infrastructure runbook for the initial near-free deployment target. Describes the chosen providers, bootstrap order, environment-variable ownership, deploy/rollback flow, and the boundaries for future automation.
- **`.github/workflows/deploy.yml`** - manual GitHub Actions deployment workflow for staging and production. It is environment-gated, pauses the worker before migrations, deploys Fly.io API/worker runtimes, deploys Cloudflare Pages, creates release tags/changelogs, and supports tagged rollback.

Related production plan: [`docs/production/environment.md`](../../docs/production/environment.md).
Release workflow: [`docs/production/release-workflow.md`](../../docs/production/release-workflow.md).

## Chosen first target

The first production-like environment is a closed-alpha, near-free setup:

- Cloudflare Pages Free for the Vite frontend.
- Fly.io Machines for the backend API and worker process.
- Neon Free for Postgres while tester data volume is small.
- Upstash Redis Free while BullMQ command volume stays under quota.
- Cloudflare DNS/TLS when a custom domain is ready; provider HTTPS hostnames are acceptable for the earliest internal test.
- Sentry Free for backend/frontend exception capture.

Do not add irreversible automation before the manual path has been executed once and the review checklist in the production plan is still accurate.

## Bootstrap order

1. Create the provider accounts/projects.
2. Register or choose domains and HTTPS origins.
3. Create Neon Postgres and Upstash Redis.
4. Create backend and worker runtime apps.
5. Add runtime secrets to the target GitHub Environment; the deploy workflow stages them into the Fly app secret stores before each deploy.
6. Run local CI parity before first deploy when Docker is available:

```bash
./scripts/ci-verify.sh
```

7. Deploy backend API.
8. Run Drizzle migrations against the production database from a controlled one-off backend runtime.
9. Start the worker after migrations complete.
10. Deploy frontend.
11. Configure BotFather Mini App URL and Telegram webhook secret.
12. Smoke test API health, Telegram auth, `/me`, one due worker timer, and one notification path.

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

Frontend build-time values live in Cloudflare Pages encrypted variables:

- `VITE_API_URL`
- `VITE_TG_BOT_NAME`
- `VITE_SENTRY_DSN`

Never store production values in committed `.env` files. `.env.example` remains a local-development template only.

## Deploy runbook

For the first manual deploy, use immutable image or deployment identifiers even if the exact tooling is still manual:

1. Record the git SHA being deployed.
2. Build backend from `backend/Dockerfile` target `prod`.
3. Deploy the API runtime with command `node dist/index.js`.
4. Run migrations once against `DATABASE_URL`.
5. Deploy the worker runtime from the same image with command `npm run worker`.
6. Build frontend with `npm run build` in `frontend/`.
7. Deploy `frontend/dist` through Cloudflare Pages.
8. Record the deployed backend image/deployment id, worker image/deployment id, frontend deployment id, and migration version in the release notes or PR.

Do not run migrations from multiple places. Do not start the worker until migrations are complete.

Once the provider projects and GitHub Environments exist, prefer dispatching [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) over running the steps manually. The workflow mirrors approved GitHub Environment runtime values into Fly secrets before deployment. The manual sequence remains the fallback for diagnosing provider setup problems.

## Rollback runbook

1. If the incident involves duplicated jobs, resource mutation, or schema mismatch, stop the worker first.
2. Roll frontend back through the previous Cloudflare Pages deployment.
3. Roll backend and worker back to the previous known-good image/deployment id only if the database schema is still compatible.
4. If schema compatibility is unknown, keep writes stopped and ship a forward fix.
5. Use Neon restore/branching only for disaster recovery, after taking a fresh dump/snapshot and accepting the data-loss window.
6. Reset the Telegram webhook only if the API origin changed or the current webhook target is unhealthy.

## Automation boundaries

Provider manifests and future deploy helpers may be added here, but they must preserve these boundaries:

- Secrets are referenced by name only, never materialized in git.
- Migrations run as an explicit single step before worker rollout.
- Worker rollout is independent from API rollout.
- Rollback uses immutable deploy identifiers.
- Billing alerts are configured before scaling out of the near-free tier.
- Production automation must update this README and [`docs/production/environment.md`](../../docs/production/environment.md) in the same change.

## Review checklist

- [x] This directory contains no secrets.
- [x] This directory contains no irreversible deployment automation.
- [x] The first target is aligned with the near-free plan in `docs/production/environment.md`.
- [x] Deploy and rollback responsibilities are documented before automation work starts.
