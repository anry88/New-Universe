# `infra/docker-host/windows` directory

Windows-host preparation and deployment artifacts for running New Universe on a purchased-domain Docker host. This directory contains no secrets. During the Windows-host phase, this is the active deployment target; the old cloud deployment workflow is disabled.

## Files

- **`README.md`** - describes the host-preparation files and operator conventions.
- **`host.env.example`** - copyable template for local `C:\new-universe\env\<environment>.env` files. The copied files contain secrets and stay outside git.
- **`prepare-host.ps1`** - idempotent PowerShell helper that creates the expected Windows directory layout, checks Docker/Compose availability, and writes a starter local env file only when it does not already exist.
- **`deploy.ps1`** - remote helper used by `scripts/deploy-hdc.sh`; updates `IMAGE_TAG`, stops the worker, runs migrations/seeders once, starts API/frontend, then starts the worker.

Related migration runbook: [`docs/production/windows-host-migration.md`](../../../docs/production/windows-host-migration.md).

## Conventions

- Use `prod` and `test` as environment names on the host.
- Use separate Compose project names: `new-universe-prod` and `new-universe-test`.
- Keep all real env files under `C:\new-universe\env\` or another private operator path.
- Do not expose Postgres or Redis ports publicly.
- Keep the cloud staging resources alive until the Windows-host data path has been rehearsed and accepted.

## First host command

From a checkout of the repository on the Windows host:

```powershell
pwsh .\infra\docker-host\windows\prepare-host.ps1 `
  -Environment prod `
  -Root C:\new-universe `
  -Domain tg-games.com
```

Run the same command with `-Environment test` to prepare the second instance.

## Routine deploy

Start routine deployments from the operator machine:

```bash
scripts/deploy-hdc.sh --environment prod
```
