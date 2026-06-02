# Production release workflow

Task: [P4-DEP-002](https://github.com/anry88/New-Universe/issues/82)
Created: 2026-05-13
Updated: 2026-06-02

## Current status

As of 2026-06-02, New Universe runs on the Windows Docker host documented in [`windows-host-migration.md`](windows-host-migration.md). The old GitHub Actions deployment path to Fly.io and Cloudflare Pages is disabled so it cannot accidentally roll code back onto cloud services while the live data path is Windows Postgres.

Active deploy command from the operator machine:

```bash
scripts/deploy-hdc.sh --environment prod
```

Do not deploy from GitHub Actions during the Windows-host phase. The workflow at [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) intentionally fails before checkout, secrets, Fly, Wrangler, migrations, or provider access.

## Local Windows-host deploy

`scripts/deploy-hdc.sh` is the only active deploy entry point.

Default target:

| Setting | Default |
| --- | --- |
| SSH host | `hdc` |
| Docker context | `hdc` |
| Windows root | `D:\new-universe` |
| Environment | `prod` |
| Env file | `D:\new-universe\env\prod.env` |
| Compose project | `new-universe-prod` |
| Image tag | `hdc-<git-short-sha>` |

The script refuses to run inside GitHub Actions. It uses the local checkout as the Docker build context and builds images on the remote Docker daemon through `docker --context hdc`.

## Deploy sequence

1. Generate a temporary non-secret build env from safe defaults plus public values read from the Windows env file.
2. Sync Docker-host infra files to `D:\new-universe\deploy\<env>\repo\infra\docker-host`.
3. Build `api`, `frontend`, and `migrate` images on Docker context `hdc`.
4. Run `infra/docker-host/windows/deploy.ps1` on the Windows host.
5. Back up the Windows env file and update `IMAGE_TAG`.
6. Stop the worker before schema work.
7. Run Drizzle migrations and idempotent seeders once via the `migrate` image.
8. Start API and frontend with `--no-build --wait`.
9. Start the worker with `--no-build --wait`.
10. Smoke-test public frontend and API `/health` endpoints.

Useful variants:

```bash
scripts/deploy-hdc.sh --environment prod --check
scripts/deploy-hdc.sh --environment prod --skip-migrate
scripts/deploy-hdc.sh --environment prod --skip-worker
scripts/deploy-hdc.sh --environment test
```

Use `--skip-worker` only when intentionally leaving the worker stopped for database maintenance or incident triage.

## GitHub Actions

The deploy workflow remains present only as an explicit blocker. It does not:

- check out repository code;
- read GitHub Environment secrets;
- install or call `flyctl`;
- install or call `wrangler`;
- run migrations;
- deploy Fly.io apps;
- deploy Cloudflare Pages.

Re-enabling cloud deployment requires a planned move back to cloud first:

1. Stop Windows worker.
2. Stop or gate Windows API writes.
3. Take a fresh dump from Windows Postgres.
4. Restore into Neon or the chosen cloud database.
5. Reconfigure cloud runtime secrets for the restored database and Redis.
6. Rebuild/redeploy cloud API, worker, and frontend.
7. Move Telegram webhook and Mini App URL back to cloud origins.
8. Start exactly one cloud worker after smoke tests.

## Legacy cloud scripts

`scripts/deploy-local.sh` is the old Fly.io / Cloudflare Pages entrypoint. It now exits immediately with instructions to use `scripts/deploy-hdc.sh`. Re-enabling cloud deploys should be a deliberate code change after the live data path has been migrated back to cloud.

The old GitHub Environment variables and secrets for Fly, Neon, Upstash, and Cloudflare Pages may remain configured as fallback inventory, but they are not the deployment source of truth while Windows is live.

## Rollback

Rollback within the Windows-host phase is not a blind GitHub rollback. Choose based on the failure:

| Failure | Preferred response |
| --- | --- |
| Bad app image, schema compatible | Deploy a known-good git checkout with `scripts/deploy-hdc.sh --tag <known-good-tag>`, or rebuild from the known-good checkout. |
| Worker causing repeated mutations | Stop worker through Windows compose, deploy/fix, then restart worker after queues and metrics are stable. |
| Bad migration or corrupted data | Stop worker and API writes, take a fresh backup, then restore from the latest known-good Windows/Postgres dump or apply a forward-fix migration. |
| Need to return to cloud | Treat as data migration from Windows Postgres back to Neon/cloud, not DNS-only rollback. |

Rollback rule: if a release includes a schema migration, decide compatibility before deploy. If compatibility is unknown, the safe rollback plan is stop writes, forward-fix, or restore from backup.

## Verification checklist

- [x] GitHub cloud deploy is blocked before secrets/provider access.
- [x] Local Windows deploy script exists.
- [x] Deploy order stops worker before migrations.
- [x] Migrations and seeders run as a single controlled step.
- [x] API/frontend start before worker.
- [x] Public `/health` smoke tests run after deploy.
- [ ] Add automated Windows Postgres backup before every routine deploy.
- [ ] Add a self-hosted runner only if deploys must later move back into GitHub without touching cloud providers.
