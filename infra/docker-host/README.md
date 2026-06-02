# `infra/docker-host` directory

Docker-host infrastructure for running New Universe on a single host while keeping the existing cloud deployment path available.

This directory is intentionally separate from the root `docker-compose.yml`, which remains the local development stack. The Docker-host stack uses production images, no fixed `container_name` values, private Postgres/Redis networking, the existing Home Data Center Cloudflare Tunnel for public ingress, and separate Compose project names so `prod` and `test` can run on the same machine.

## Files

- **`README.md`** - describes the Docker-host infrastructure surface and its verification commands.
- **`backend.Dockerfile`** - backend/worker production image plus a separate migration target from the repository root, including `backend/` and `shared/`.
- **`compose.yml`** - production-oriented Compose stack for Postgres, Redis, backend API, worker, frontend, shared tunnel-network aliases, and one-off migration/seed runs.
- **`frontend.Dockerfile`** - production frontend static image build from the repository root, including `frontend/` and `shared/`.
- **`frontend-static-server.mjs`** - dependency-free Node static server for the frontend image, with `/health`, SPA fallback, and static asset caching.
- **`windows/`** - Windows host preparation helper and env template.

The repository root [`.dockerignore`](../../.dockerignore) keeps local dependencies, build outputs, task docs, and private env files out of the Docker-host build context.

Related runbook: [`docs/production/windows-host-migration.md`](../../docs/production/windows-host-migration.md).

## Verification

Validate Compose interpolation and service wiring without starting containers:

```bash
bash scripts/docker-host-verify.sh
```

Build images, run the migration image against an isolated database, and run API/frontend health checks when Docker and network access are available:

```bash
RUN_DOCKER_HOST_BUILD=1 RUN_DOCKER_HOST_STACK=1 bash scripts/docker-host-verify.sh
```

Run the same isolated check against the Home Data Center Docker context:

```bash
DOCKER_CONTEXT=hdc RUN_DOCKER_HOST_BUILD=1 RUN_DOCKER_HOST_STACK=1 bash scripts/docker-host-verify.sh
```

The stack test uses a temporary env file and an isolated Compose project name. It must not be pointed at live staging data.

## Deployment

The active deployment path while New Universe runs on the Windows host is local-only from the operator machine:

```bash
scripts/deploy-hdc.sh --environment prod
```

The script builds `api`, `frontend`, and `migrate` images on Docker context `hdc`, syncs this infrastructure directory to `D:\new-universe\deploy\prod\repo\infra\docker-host`, updates `IMAGE_TAG` in `D:\new-universe\env\prod.env`, stops the worker, runs migrations and seeders once, starts API/frontend, starts the worker, and smoke-tests public health endpoints.

GitHub Actions cloud deploy is intentionally disabled during the Windows-host phase. Do not deploy Fly.io or Cloudflare Pages again until a reverse migration back to cloud has been executed.

## Operator Notes

- Use `--env-file C:\new-universe\env\prod.env` or `--env-file C:\new-universe\env\test.env` on the Windows host.
- Use `docker compose --profile tools run --rm migrate` for the single controlled migration/seed step.
- The migration image intentionally keeps dev tooling such as `tsx`; API and worker images stay production-pruned.
- Ensure the Home Data Center `hdc-cloudflared` service is attached to the shared `hdc-tunnel` Docker network before public hostname routing.
- Route Cloudflare public hostnames to `http://nu-prod-frontend:8080` and `http://nu-prod-api:3000` for prod; use the `nu-test-*` aliases for test.
- Keep the worker stopped while restoring Postgres dumps or changing schema.
- For the real Windows host, set `POSTGRES_DATA_TYPE=bind` and `POSTGRES_DATA_SOURCE=D:/new-universe/state/<env>/postgres` so database files live outside the container in a host directory.
- Do not publish Postgres, Redis, API, or frontend ports. The stack intentionally has no `ports:` bindings so it can coexist with other Docker workloads on the same host; Cloudflare Tunnel should be the public ingress path.
