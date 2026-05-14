# AGENTS.md

## Project

New Universe is a Telegram Mini App game with a Fastify + TypeScript backend, a Vite + React frontend, Postgres, Redis, Drizzle ORM, BullMQ workers, and Docker Compose for local development.

Primary links:

- GitHub repository: https://github.com/anry88/New-Universe
- Git SSH remote: `git@github.com:anry88/New-Universe.git`
- GitHub Project: https://github.com/users/anry88/projects/3
- Local task source of truth: `tasks/tasks.json`
- Human-readable task docs: `tasks/New_Universe_Microtasks.pdf`
- Roadmap P2-P5 verification doc: `tasks/ROADMAP_P2_P5.md`
- Roadmap P2.3 Jump Gate verification doc: `tasks/ROADMAP_P2_3_JUMP_GATE.md`
- Roadmap coverage matrix: `tasks/ROADMAP_COVERAGE_MATRIX.md`
- GDD: `Stellar_Forge_GDD.pdf`
- GDD addendum: `New_Universe_GDD_Addendum_v1.1.pdf`
- Local dev guide: `README.md` in the implementation repo; `dev/README.md` only exists in the planning bundle before files are moved.

## Documentation Split

- `README.md` — human-facing product overview, local-development quickstart, and links to GDD/tasks.
- `CHANGELOG.md` — project-level change register. Agents keep notable task, release, operational, and workflow changes there before PR handoff.
- `DOCUMENTATION.md` — engineering architecture overview. Lists every top-level area (backend, frontend, shared) and links to the package READMEs that describe individual files and functions.
- `AGENTS.md` (this file) — repository-wide rules and workflows for AI coding assistants.
- `backend/src/README.md`, `backend/src/<package>/README.md`, `frontend/src/README.md`, `shared/README.md` — low-level code navigation. Each README describes every file in that directory with a short description of its responsibilities and the key exports/functions other code calls into.
- `docs/` — product/design materials (GDD PDFs, infrastructure cost notes, architecture diagrams). Generated planning PDFs and CSV files in `docs/` and `tasks/` are not implementation code.
- `infra/production/README.md` — production infrastructure plan and runbook. Starts as documentation only: no production secrets or irreversible deployment automation belong there.

## Repository Map

- `backend/src/index.ts` — Fastify entry point. Loads Sentry, builds the Pino-backed Fastify instance with request IDs, registers `@fastify/cors` and `@fastify/helmet`, and mounts `routes/health`, `routes/bot`, and `features/auth/routes` (at `/auth`).
- `backend/src/db/` — Drizzle ORM client, per-domain schema modules (`users`, `resources`, `world`, `buildings`, `research`, `ships`, `discovery`, `expeditions`), generated SQL migrations, and idempotent seeders for resources, research branches, building types, and ship types.
- `backend/src/features/` — feature modules. `auth/` handles Telegram-Mini-App login and JWT issuance plus first-time home-system creation. `world/` contains biome data and the deterministic home-system generator used by the auth flow.
- `backend/src/lib/` — env validation (Zod), Pino logger, Sentry init, and Telegram `initData` HMAC verification.
- `backend/src/middleware/` — `request-id.ts` UUID generator and `telegram-auth.ts` `preHandler` that attaches `request.user`.
- `backend/src/routes/` — generic non-feature routes (`/health`, `/webhook/telegram`).
- `frontend/src/` — Vite + React 18 Telegram Mini App. `main.tsx` boots the SDK and renders `App.tsx`; `lib/sentry.ts` initializes Sentry; `mockEnv.ts` injects a fake Telegram environment for plain-browser dev.
- `shared/types/` — cross-package TypeScript contracts shared between backend and frontend (currently empty; add new contracts here when features need them).
- `tasks/` — task plan (`tasks.json`), GitHub Project automation scripts, and the imported microtasks docs.
- `tools/balance-sim/` — offline deterministic economy simulator (see `tools/balance-sim/README.md`); writes comparison artifacts under `tools/balance-sim/artifacts/`.
- `docs/` — GDD, addenda, infrastructure costs, architecture diagrams.
- `infra/production/` — near-free production environment plan and deployment/rollback runbook for the first closed-alpha target.
- `dev/` — starter Docker/dev scaffolding from the planning bundle.
- `docker-compose.yml` — local stack: Postgres 16, Redis 7, Backend (Fastify, hot reload), optional Worker/Frontend/devtools profiles.
- `.github/workflows/ci.yml` — default PR CI: separate `security` job (backend migrate/seed + security/economy exploit checks) plus `check` job for lint, type-check, migrate, seed, unit tests (backend + frontend). **No Playwright.**
- `.github/workflows/e2e.yml` — Playwright E2E (see [.github/workflows/README.md](.github/workflows/README.md)): manual dispatch, or PR labeled **`run-e2e`** only (task issues already carry `epic:EPIC-…` from import — never auto-trigger on that substring).
- `.github/workflows/deploy.yml` — manual, GitHub-Environment-gated deployment and rollback workflow for staging/production (see [docs/production/release-workflow.md](docs/production/release-workflow.md)). Requires staging deploy + rollback drill evidence before production dispatch.
- `scripts/ci-verify.sh` — local automation mirror of `ci.yml`; set `RUN_PLAYWRIGHT_E2E=1` to include the same Playwright step as `e2e.yml`.
- `CHANGELOG.md` — chronological register of notable unreleased and released changes. It is maintained by agents as part of task completion and release preparation.

## First Pass For Any Agent

1. Read [README.md](README.md) for product positioning and local quickstart.
2. Read [AGENTS.md](AGENTS.md) and [DOCUMENTATION.md](DOCUMENTATION.md) for repo structure, runtime boundaries, and the file-level navigation map.
3. Read the package README closest to the area you are about to change:
   - [backend/src/README.md](backend/src/README.md)
   - [backend/src/db/README.md](backend/src/db/README.md)
   - [backend/src/features/README.md](backend/src/features/README.md)
   - [backend/src/lib/README.md](backend/src/lib/README.md)
   - [backend/src/middleware/README.md](backend/src/middleware/README.md)
   - [backend/src/routes/README.md](backend/src/routes/README.md)
   - [frontend/src/README.md](frontend/src/README.md)
   - [shared/README.md](shared/README.md)
4. If the task touches the economy balance simulator or scenario fixtures, read [tools/balance-sim/README.md](tools/balance-sim/README.md) and update `tools/balance-sim/src/catalog.ts` when seeds/config drift.
5. If the task touches the database schema, also read [backend/src/db/README.md](backend/src/db/README.md) end-to-end and the affected `schema/<file>.ts`.
6. If the task touches a request/response contract used by the frontend, also read [shared/README.md](shared/README.md) and put the type in `shared/types/`.
7. If the task touches Telegram auth or session handling, also read `backend/src/lib/telegram.ts` and `backend/src/middleware/telegram-auth.ts`.
8. If the task touches production, deployment, domains, or secrets, also read [docs/production/environment.md](docs/production/environment.md) and [infra/production/README.md](infra/production/README.md).
9. Skim the related test files (`*.test.ts` in the same folder) before changing behavior — they document the current contract precisely.

## Main Agent Prompt

You are the implementation agent for New Universe. When the user explicitly asks to start or continue work on a task, for example "take task P1-141", "возьми таску P1-141", or "сделай issue #22", resolve the task from GitHub and `tasks/tasks.json`, then implement it according to this file, the task acceptance criteria, the GDD, and the existing project architecture.

Do not ask the user to repeat the project context, repository links, task plan, stack, or workflow. Treat this `AGENTS.md` as the default project prompt.

Your goal is not just to edit files. Your goal is to complete the task end to end: understand the issue, check dependencies, make the smallest coherent implementation, run the relevant verification, update the GitHub issue/project status when appropriate, and clearly report what changed and what remains.

## Task Start Gate

- Start implementation only when the latest user message clearly asks to start or continue a concrete task or issue. A bare token, secret, URL, project name, clarification, status question, or other config value is input for the current task, not permission to start the next task.
- After completing, blocking, or reporting a task, stop and wait for the next explicit task instruction. Do not automatically pick up the next task from the backlog.
- If the user provides a secret such as a Telegram bot token, use it only for the current task's local configuration or verification. Never print it back, commit it, put it in task metadata, or treat it as a new task command.

## Multi-Agent Workflow

- Assume multiple agents may be working in parallel. Before changing branches, stashing, formatting, generating migrations, installing dependencies, or committing, run `git status --short --branch` and check whether the dirty files belong to your current task.
- Do not switch branches, run `git stash`, or otherwise move another agent's uncommitted work out of the shared checkout. If unrelated dirty files are present, leave that checkout alone and create a separate `git worktree` from the appropriate base branch for your own task.
- Prefer one branch and one worktree per active task: `task/<TASK_ID>-short-slug` for implementation tasks, `chore/<short-slug>` for repository maintenance, and a separate directory such as `../New-Universe-<task-id>`.
- Commit only the files you intentionally changed for your task. Review `git diff` and `git status --short` before `git add`; never use broad staging when unrelated files are dirty.
- If two agents need the same files, coordinate through PRs. The branch owner rebases or merges the latest `main`, resolves conflicts, reruns the relevant verification, and explains the conflict resolution in the PR or final report.
- Keep generated artifacts scoped to the task. Database migrations, lockfiles, generated clients, and formatted files are common conflict sources; generate them only in your task worktree and commit them only when they are part of the requested change.
- When a PR merges, other agents should update their own worktrees from `origin/main` before continuing if their task depends on the merged files.

## Task Workflow

1. Sync the repository before starting a task.
   - Work in the real git checkout, not the planning bundle.
   - Run `git status --short --branch` first. If there are uncommitted changes you did not make, do not stash them or switch branches in that checkout; create a separate worktree or ask the user before touching the affected files.
   - Before creating a new task branch in a clean checkout, run `git fetch origin`, switch to `main`, and update it with `git pull --ff-only`.
   - Create the task branch from the updated base. If a required dependency branch or PR is not merged into `main`, base on that dependency only when necessary and state that choice in the final report.

2. Resolve the task.
   - If the user gives a task ID such as `P1-141`, find it in `tasks/tasks.json`.
   - Also find the matching GitHub issue in `anry88/New-Universe`, usually titled `[P1-141] ...`.
   - If the user gives an issue number, read that GitHub issue and map it back to the task ID in the title/body.

3. Read the task before coding.
   - Use the task `description`, `acceptance`, `files`, `deps`, `verify`, `notes`, and `prompt` fields from `tasks/tasks.json`.
   - Read the GitHub issue body too, because it is the shared execution record.
   - Check dependent task IDs listed in `deps`. If a dependency is not implemented locally, either implement the prerequisite first if it is small and necessary, or stop and report the blocker.

4. Work in the repository, not in the planning bundle.
   - The intended code repository is `anry88/New-Universe`.
   - If the current folder is only the planning bundle and not a git checkout, clone or switch to the real repo before implementing code.
   - Keep `tasks/` as planning/import material unless the task explicitly asks to change task metadata.

5. Implement narrowly.
   - Follow existing structure and naming once code exists.
   - Prefer TypeScript strictness, typed boundaries, Zod validation for config/input, Drizzle for database access, and small feature modules.
   - Keep business logic in backend feature/service modules, route handlers thin, and database schema changes explicit.
   - Keep frontend state and API calls in clear `lib/`, `pages/`, and `components/` boundaries.
   - When adding or changing behavior, write or update focused unit tests in the same change before reporting the task as complete.

6. Verify.
   - Follow **[Verification contract (agents & CI)](#verification-contract-agents--ci)** and align PR/task verification text with CI steps or document deliberate deviations.
   - Default merge gate on GitHub is [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (`security` and `check`). Playwright runs only from [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml) when someone adds label **`run-e2e`** to the PR or runs the workflow manually — do not expect browser E2E on every small PR.
   - Before claiming repository-wide **Local pass** when Docker is available, run `./scripts/ci-verify.sh` from the repo root (matches default CI). Use `RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh` when you must reproduce `e2e.yml`, or confirm a green **`ci.yml`** run on the PR.
   - Run the command listed in the task `verify` field when possible (must stay compatible with default CI unless the task explicitly requires E2E).
   - If the task is an **epic rollup** (task `id` matches `*-EPIC-*` in `tasks/tasks.json`, e.g. `P2-EPIC-COLONIZE`), add GitHub label **`run-e2e`** on the closing PR before merge so [`e2e.yml`](.github/workflows/e2e.yml) runs Playwright; confirm green or document why E2E was skipped.
   - Also run the nearest relevant tests/build/type-check for changed code during iteration.
   - Check the code you wrote immediately after implementation: run the smallest relevant unit tests first, then broader build/type-check/lint commands as appropriate.
   - If verification cannot run because Docker disk/images, Playwright browsers, or other infra are missing, state exactly what blocked it and why CI/GitHub would still be authoritative once merged — never substitute improvised flows when documenting parity.


7. Finish the task record.
   - Summarize implementation and verification in the final response.
   - If GitHub access is available, link the implementation PR to the completed issue/task and update the GitHub issue/Project record according to the rules below.

## GitHub API Rate-Limit Policy

Чтобы меньше бить лимиты GitHub API, каждый агент выполняет только целевые `gh`-операции.

- По умолчанию используем `gh` только для действий с высоким приоритетом:
  - создание/переключение задачи на ветку (`gh issue develop`) при явном старте из issue;
  - создание PR (`gh pr create`);
  - единичное закрытие/слияние PR, комментарии по статусам и переходы проекта, которые реально меняют состояние работы.
- Всё, что можно решить локально, выполняем без `gh`:
  - чтение задач и зависимостей — через `tasks/tasks.json`, локальные task notes и git branch;
  - проверка соответствия задач и зависимостей — через `jq`/`rg` в репозитории;
  - повседневные проверки состояния CI — через результаты локального `ci-verify` и вывод команд, уже выполненных в чате.
- Не используем `gh` для частых поллинг-команд между шагами: `gh issue list`, `gh issue view`, `gh pr status`, `gh project item-list` без явной необходимости.
- Обязательные минимальные точки записи в GitHub:
  - при старте задачи: `node tasks/project_status.mjs start <TASK_ID> --branch <branch>` (или его эквивалент);
  - при блокировке: `node tasks/project_status.mjs task <TASK_ID> --status "Blocked" --verification "Blocked" --comment "..."`;
  - при создании PR и переходе в review: один `node tasks/project_status.mjs task <TASK_ID> --status "Review" --verification "Local pass|CI pass" ...`;
  - при финальном закрытии/готовности к закрытию: обновление проверки и `Closes` в PR.
- Если `gh` сообщает о лимите:
  - не запускаем повторные `gh`-попытки в цикле (без паузы 60s+ это не спасает);
  - продолжаем локальную работу и фиксируем отложенные GH-операции в последнем сообщении пользователю;
  - после восстановления лимита выполняем только отложенные изменения статусов/комментариев по списку.

## Missing Inputs And Secrets

- If a task needs a token, Sentry DSN/project name, Telegram bot username, public tunnel URL, deployment URL, or other external value that is not available locally, stop and ask the user directly.
- The request to the user must be concrete: say exactly what they need to create or open, which value to send back, and whether it belongs in local `.env`, GitHub secrets, Sentry, Telegram BotFather, or another service.
- Do not invent external project names, production URLs, bot names, or secrets. Use placeholders only in committed examples such as `.env.example`.
- If the missing value is optional for local verification, keep that integration disabled and say so instead of blocking the task.

## Pull Request And Issue Closing Rules

Every implementation task must stay connected to its GitHub issue and Project item.

Branch naming:

- Use `task/<TASK_ID>-short-slug` for task branches, for example `task/P1-141-home-system`.
- If working from an issue number and the task ID is not obvious, use `issue/<ISSUE_NUMBER>-short-slug`.

PR naming:

- Use a PR title that starts with the task ID, for example `[P1-141] Generate Home System`.
- If one PR covers multiple tasks, include the primary task ID in the title and list all linked issues in the body.

PR body:

- If the task is complete and should close on merge, include `Closes #<issue_number>`.
- If the PR is partial, exploratory, or blocked, use `Refs #<issue_number>` instead of `Closes`.
- Include a short verification section with the commands that passed or the blocker that prevented verification.
- Include the task acceptance checklist or a concise mapping from acceptance criteria to implementation.

Closing policy:

- Do not close a GitHub issue just because code was edited locally.
- Prefer automatic closure by merging a PR whose body contains `Closes #<issue_number>`.
- If the repo workflow requires manual closure, close the issue only after implementation is verified and the user confirms the task is done.
- When closing manually, add a final issue comment with the PR link, verification evidence, and any known follow-up before closing.
- Move/update the GitHub Project item to `Done` only after the same completion confirmation. If status fields are not configured or the CLI cannot resolve them safely, leave a clear comment instead of guessing.

Epic closure (Playwright):

- When merging the PR that **closes an epic rollup task** — task `id` matching `*-EPIC-*` in [`tasks/tasks.json`](tasks/tasks.json) (examples: `P2-EPIC-COLONIZE`, `P2-EPIC-POLISH`) — add label **`run-e2e`** on that PR before merge (create the label in the repo once if it does not exist). This triggers [.github/workflows/e2e.yml](.github/workflows/e2e.yml). Wait for it to pass or note the failure in the PR/issue.
- Do **not** add **`run-e2e`** on ordinary microtask PRs (`P2-COL-003`, `P2-RES-003`, etc.) unless the task explicitly requires browser E2E or the user asked for it.

Status policy:

- Use the Project status lifecycle exactly:
  - `Backlog`: not ready because dependencies, planning, or prerequisites are not satisfied.
  - `Ready`: dependencies are satisfied and the task can be taken by an agent.
  - `In Progress`: an agent has started work and created/checked out the implementation branch.
  - `Review`: a PR exists and is waiting for review, CI, manual validation, or merge.
  - `Blocked`: the task cannot proceed because a dependency, secret, environment, external account, or decision is missing.
  - `Done`: the PR is merged, verification is accepted, and the GitHub issue is closed.
- When starting work, immediately move the Project item to `In Progress` and comment with the branch name.
- When opening a PR, move the Project item to `Review`. The `Project Status` GitHub Action also does this automatically for PRs that mention the task ID in the title/body/branch.
- When local verification passes, set `Verification=Local pass`; when CI is green, set `Verification=CI pass`; when manual user acceptance is still needed, set `Verification=Manual needed`.
- When blocked, set `Status=Blocked` and `Verification=Blocked`, then comment on the issue with exact user actions needed to unblock it.
- When a PR is merged, the `Project Status` GitHub Action moves linked task IDs to `Done`, sets `Verification=Accepted`, and promotes newly unblocked tasks from `Backlog` to `Ready`.
- If GitHub automation cannot access the Project, check that repository secret `PROJECT_TOKEN` is a classic PAT with `repo`, `project`, and `read:org` scopes. Then run the local Project status script manually if needed. If that fails too, comment on the issue and report the blocker.

## Verification contract (agents & CI)

- **Default PR pipeline** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml): `security` job for backend migrations/seed plus security/economy exploit checks, and `check` job for lint, build, Drizzle migrate/seed, backend + frontend unit tests. When adding or reordering these steps, update [`scripts/ci-verify.sh`](scripts/ci-verify.sh) in the same change. **Do not** add Playwright here — use `e2e.yml`.
- **Playwright E2E** — [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml). Runs on workflow dispatch or on PRs labeled **`run-e2e`** (see [.github/workflows/README.md](.github/workflows/README.md)). Task labels like `epic:EPIC-P2-RES` apply to **every** imported issue — they must **not** auto-trigger E2E.
- **Local** — `./scripts/ci-verify.sh` mirrors `ci.yml` (Docker Compose with `up --wait`; ends with `docker compose down -v`). `RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh` adds the Playwright install/run block used in `e2e.yml`.
- **Backend/db** — migrations and seeds must succeed via `docker compose run --rm backend npm run db:migrate` and `docker compose run --rm backend npm run db:seed`. Skipping them after schema edits is invalid unless the task/PR documents why.
- **GitHub reporting** — set Project `Verification=CI pass` after **`ci.yml`** succeeds on the PR. Note a green **`e2e.yml`** run when the task required full browser verification.

## CI and Playwright E2E (GitHub)

- **Small PRs** — require the `security` and `check` jobs from `ci.yml` in branch protection so browser installs do not block every review.
- **Epic rollup PRs** — agents **must** add **`run-e2e`** when closing an epic (`*-EPIC-*` task ids); see **Epic closure (Playwright)** under Pull Request rules above.
- **Other full UI smoke** — add **`run-e2e`** on any PR where you need Playwright without merging an epic, or run **Actions → E2E → Run workflow** against the branch you want.
- **Optional blocking** — add the `playwright` job from `e2e.yml` as a required check only if you want Playwright to gate every merge (usually omit).

## Useful Commands

> В этом разделе команды `gh` применяются только в тех точках, где нужно зафиксировать изменение статуса/PR в GitHub. Для чтения контекста и зависимостей используем локальные `tasks/tasks.json` и `rg`.

Inspect a task from the local source of truth:

```bash
jq -r '.tasks[] | select(.id == "P1-141") | .prompt' tasks/tasks.json
```

Find the matching GitHub issue:

```bash
gh issue list --repo anry88/New-Universe --state all --search "P1-141 in:title" --json number,title,url,state,labels
```

Read a GitHub issue:

```bash
gh issue view 22 --repo anry88/New-Universe --comments
```

Create or switch to an implementation branch for an issue:

```bash
gh issue develop 22 --repo anry88/New-Universe --checkout --name task/P1-141-home-system
```

Create a PR linked to the issue:

```bash
gh pr create --repo anry88/New-Universe --title "[P1-141] Generate Home System" --body-file /tmp/pr-body.md
```

Move a task through the GitHub Project lifecycle:

```bash
node tasks/project_status.mjs start P1-141 --branch task/P1-141-home-system
node tasks/project_status.mjs task P1-141 --status "In Progress" --verification "Not run" --comment "Started in branch task/P1-141-home-system."
node tasks/project_status.mjs task P1-141 --status "Blocked" --verification "Blocked" --comment "Blocked: provide TELEGRAM_BOT_TOKEN in local .env."
node tasks/project_status.mjs task P1-141 --status "Review" --verification "Local pass" --comment "PR opened: <url>. Verification: <commands>."
node tasks/project_status.mjs sync-ready
```

Manual issue close after verified user confirmation:

```bash
gh issue comment 22 --repo anry88/New-Universe --body "Implemented in PR #<number>. Verification: <commands/results>."
gh issue close 22 --repo anry88/New-Universe --reason completed
```

Clone the implementation repo if the current directory is only the planning bundle:

```bash
git clone git@github.com:anry88/New-Universe.git
```

Start local development services from the repo root after the dev files are in place:

```bash
docker compose up -d
```

Prepare a fresh branch for a new task:

```bash
git status --short --branch
git fetch origin
git switch main
git pull --ff-only
git switch -c task/P1-141-home-system
```

Mirror CI locally (preferred verification gate):

```bash
./scripts/ci-verify.sh
# Optional — same stack plus Playwright as e2e.yml:
# RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh
```

Incremental Compose-backed checks without wiping volumes manually:

```bash
docker compose up -d --wait postgres redis
docker compose run --rm backend npm run lint
docker compose run --rm backend npm run build
docker compose run --rm backend npm run db:migrate
docker compose run --rm backend npm run db:seed
docker compose run --rm backend npm test
docker compose --profile frontend run --rm frontend npm test
```

Schema edits plus Drizzle artifacts:

```bash
docker compose run --rm backend npm run db:generate
docker compose run --rm backend npm run db:migrate
docker compose run --rm backend npm run db:seed
```

## Current Planned Stack

- Backend: Node.js 20+, Fastify v5, TypeScript strict, ESM, Pino, Zod, Sentry.
- Database: Postgres 16, Drizzle ORM, generated migrations.
- Queue/cache: Redis 7, BullMQ workers.
- Frontend: Vite, React 18, Telegram Mini App SDK, Tailwind CSS, TanStack Query, Zustand, Pixi.js, lucide-react.
- Local environment: Docker Compose with backend, worker, frontend, postgres, redis, optional Adminer and Redis Commander.

## Local Planning Bundle

This folder may contain planning artifacts before the actual repository is fully populated:

- This `AGENTS.md` should be copied into the root of the actual implementation repository and kept committed there.
- `dev/` contains the starter Docker/dev environment to move into the repository.
- `tasks/tasks.json` contains 53 task definitions and per-task prompts.
- `tasks/import_to_github_idempotent.sh` safely creates/reuses GitHub issues and Project items.
- `tasks/tasks.csv` is only an external import fallback.

Do not treat generated planning PDFs or CSV files as implementation code.

## Engineering Rules

- Preserve user work. Do not reset, delete, or overwrite unrelated changes.
- Do not add startup-time migrations, cleanup hooks, retention jobs, queue purges, Redis/BullMQ metadata cleanup, or similar automated maintenance that can delete or mutate persisted data on every restart. Destructive or data-shaping maintenance must be a deliberately scoped one-shot operation with an explicit task, narrow allowlist/predicate, dry-run or audit logging where practical, rollback/runbook notes, and explicit user approval before it can run against production.
- Do not create duplicate GitHub issues for existing task IDs.
- Use `rg`/`rg --files` for search.
- Use structured parsers and project tooling instead of ad hoc text manipulation where practical.
- Keep changes scoped to the task and its dependencies.
- Add or update focused unit tests immediately when behavior, schemas, routes, services, or frontend flows change; do not leave tests as a follow-up unless a concrete blocker prevents it.
- Prefer clear, boring implementation over new abstractions.
- Если вы встречаете не локализованные тексты (включая подписи кнопок, описания, ошибки и сообщения состояния), их нужно локализовать на все доступные в игре языки (как минимум RU/EN) до закрытия задачи, вместо того чтобы оставлять hardcoded-строки или English-плейсхолдеры.
- Если для сущности, которой в UI нужен визуальный ассет (здания, исследования, корабли, ресурсы и т.д.), отсутствует финальное изображение, нужно сгенерировать/добавить его в стиле Cosmic Atlas из дизайна проекта и подключить в работу, а не использовать заглушки.
- Do not commit secrets. `.env` stays local and must not be committed.
- When running `scripts/deploy-local.sh` from a workstation, assume the current shell may contain local Docker/build variables. Do not `source` deployment env files into the shared shell. Run the script from a clean environment with explicit allowlisted process variables, for example `env -i HOME="$HOME" PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" scripts/deploy-local.sh --env-file scripts/deploy-local.staging.env --full`, so local `DATABASE_URL`, `REDIS_URL`, `VITE_API_URL`, `PUBLIC_FRONTEND_URL`, or similar values cannot leak into staging/production deploys.
- Update the matching `README.md` files (see "Documentation Update Rules" below) in the same change as the code, so the documentation tree never drifts out of sync with the source tree.

## Documentation Update Rules

Documentation lives next to the code it describes. The structure mirrors `RiverKing` (an internal reference project) and is the contract every agent must keep current:

- `README.md` — product-facing overview and local-dev quickstart.
- `DOCUMENTATION.md` — engineering architecture overview. Lists every top-level area and links to package READMEs.
- `<package>/README.md` — file-level navigation for every directory that contains source code. The current set is:
  - `backend/src/README.md`
  - `backend/src/db/README.md`
  - `backend/src/features/README.md`
  - `backend/src/lib/README.md`
  - `backend/src/middleware/README.md`
  - `backend/src/routes/README.md`
  - `frontend/src/README.md`
  - `shared/README.md`
  - [`scripts/README.md`](scripts/README.md) (repo-root automation helpers; keep aligned with `ci.yml` / `e2e.yml`)
  - [`tools/balance-sim/README.md`](tools/balance-sim/README.md) (offline economy simulator; optional CI hook)
  - [`.github/workflows/README.md`](.github/workflows/README.md) (workflow intent and E2E triggers)

Required behavior whenever you change the codebase:

1. **New file in an existing documented directory** — add a bullet to that directory's `README.md` describing the file's responsibilities and its key exports/functions. Place the bullet alphabetically inside the most appropriate subsection (e.g. "Files", "Schema modules", "Top-level files").
2. **New directory under `backend/src/` or `frontend/src/`** — create `<dir>/README.md` following the existing template (short header, "Files" / "Layout" sections, "Adding a …" / "Conventions" trailing sections). Link to it from the parent `README.md` and from `DOCUMENTATION.md`.
3. **Renamed or removed file** — rename or delete the matching bullet in the relevant `README.md`. If a file is removed, also remove any references to it from sibling READMEs and from `DOCUMENTATION.md`.
4. **Renamed or removed export/function** — update every README that previously referenced the old name. Use `rg "<oldName>"` over `*.md` to find references quickly.
5. **Behavioral change in an existing function** — update the bullet for that function so the description still matches the implementation. Do not let outdated function summaries linger.
6. **New database table or seeded reference data** — update `backend/src/db/README.md` (table list and seeders), and add a one-line description in `DOCUMENTATION.md` under "Database (Drizzle ORM + Postgres)".
7. **New HTTP route or feature module** — update `backend/src/features/README.md` (or `backend/src/routes/README.md` for non-feature routes) and `DOCUMENTATION.md` under "Runtime composition".
8. **New shared contract** — add a module under `shared/types/`, document it in `shared/README.md`, and link from `DOCUMENTATION.md` if it changes the public API surface.
9. **New product surface** (worker, second frontend, mobile client, etc.) — add a top-level `README.md` for that surface, link it from `DOCUMENTATION.md`, and update the "Repository Map" section of `AGENTS.md` so future agents discover it.

Style guarantees that keep the docs uniform across the repo:

- Each package `README.md` starts with a level-1 heading of the form `` # `<path>` directory `` followed by one short paragraph describing the role of that directory.
- Each file bullet uses **`fileName`** as the lead label (Markdown bold + inline code), then a short phrase, then a sentence-level description. Multi-step responsibilities go on their own indented bullets so they stay scannable.
- Function/method names are wrapped in backticks. Mention the most useful exported symbols, not every private helper.
- Closing sections name "Adding a new …" steps and any verification commands so agents can act without context-hopping.
- Do not duplicate the GDD or product spec inside engineering READMEs. Link to `docs/` instead.
- Do not document secrets, internal URLs, or credentials inside any README.

Verification that documentation stays in sync:

- Before opening a PR, run `git diff --name-only $(git merge-base HEAD origin/main) HEAD` and check that every changed `*.ts`, `*.tsx`, `*.sql`, and `*.json` schema/seed file has a matching update in the closest `README.md`.
- If you renamed an exported symbol, run `rg "<oldName>" -- '*.md'` and update every hit.
- If you added a new package directory, confirm it appears in `DOCUMENTATION.md` and in the "Repository Map" / "First Pass For Any Agent" sections of `AGENTS.md`.
- Treat doc updates as part of the task: a PR that ships code without the matching README updates is not "done" under these rules.

## Changelog Rules

`CHANGELOG.md` is the project-level record of notable changes. It complements GitHub issues, PRs, and Project status fields; it does not replace them.

- Keep the file in a Keep-a-Changelog-style structure: `## [Unreleased]` first, then dated sections such as `## [2026-05-14]`, with category headings only when they have entries (`Added`, `Changed`, `Fixed`, `Removed`, `Security`, `Docs`, `Chore`).
- Every task PR must add or update a concise bullet under `## [Unreleased]` when it changes player-visible behavior, API contracts, database schema or seeds, generated assets, CI/deploy/security posture, task planning, or agent workflow rules.
- Purely mechanical refactors, formatting-only changes, and test-only changes do not need changelog entries unless they change an operational contract or risk profile. Documentation-only changes need an entry when they alter how agents or maintainers are expected to work.
- Write entries for humans, not as file lists. Mention the task id and issue/PR number when known, summarize the observable effect, and avoid copying acceptance criteria verbatim.
- Keep task-planning changes traceable: when adding, splitting, reordering, or blocking tasks, include the affected task ids and the dependency direction if relevant.
- Never put secrets, tokens, private environment URLs, customer/user data, or detailed exploit instructions in `CHANGELOG.md`. Security-sensitive entries should describe the mitigation at a high level and link only to the appropriate private record if one exists.
- Preserve other agents' bullets during merges. If two branches edit `## [Unreleased]`, keep both sets of entries and group them under the correct category instead of choosing one side.
- When preparing a release, move the relevant `## [Unreleased]` entries into a new dated section, leave a fresh empty `## [Unreleased]` section at the top, and make sure the release notes match the PRs/issues actually included.
- Do not use `CHANGELOG.md` as a scratchpad, task tracker, or replacement for `tasks/tasks.json`. It records decisions and delivered changes after they become part of a branch or release.

## GitHub Bookkeeping Rules

- Repository owner/name: `anry88/New-Universe`.
- Default branch: `main`.
- Project owner/number: `anry88`, project `3`.
- Project views currently configured:
  - `Execution Board`: `phase:P0,P1,P1.1`
  - `Phase 0 Setup`: `phase:P0`
  - `Phase 1 Core`: `phase:P1`
  - `Phase 1.1 Post-fixes`: `phase:P1.1`
  - `Roadmap P0-P5`: `phase:P0,P1,P1.1,P2,P2.1,P2.2,P2.3,P3,P4,P5`
  - `Roadmap P2-P5`: `phase:P2,P2.1,P2.2,P2.3,P3,P4,P5`
  - `Phase 2 Expansion`: `phase:P2,P2.1,P2.2,P2.3`
  - `Phase 2.1 Gameplay`: `phase:P2.1`
  - `Phase 2.2 Building Economy`: `phase:P2.2`
  - `Phase 2.3 Jump Gate`: `phase:P2.3`
  - `Phase 3 Multiplayer`: `phase:P3`
  - `Launch Readiness`: `phase:P4`
  - `Live Ops`: `phase:P5`
  - `Review`: `status:Review`
  - `Blocked`: `status:Blocked`
  - `Epics`: `work-type:Epic`
  - `Frontend`: `area:Frontend`
  - `Backend/Core`: `area:DB,Auth,World,Economy,Buildings,Ships,Expeditions,Bot`
  - `QA`: `area:QA`
- Project fields:
  - `Status`: `Backlog`, `Ready`, `In Progress`, `Review`, `Blocked`, `Done`
  - `Phase`: `P0`, `P1`, `P1.1`, `P2`, `P2.1`, `P2.2`, `P2.3`, `P3`, `P4`, `P5` (опции совпадают с `tasks/tasks.json` → `epics[].phase`)
  - `Epic`: one of the `EPIC-*` ids from `tasks/tasks.json`
  - `Size`: `S`, `M`, `L`, `XL`
  - `Work Type`: `Epic`, `Infra`, `Schema`, `API`, `Worker`, `UI`, `Test`, `Bot`, `Docs`, `Feature`, `Chore`, `Spike`, `Deploy`, `Ops`, `Security`, `Analytics`, `Monetization`, `Live Ops`, `Content`, `Balance`, `Support`
  - `Area`: `Infra`, `DB`, `Auth`, `World`, `Economy`, `Buildings`, `Ships`, `Expeditions`, `Frontend`, `Bot`, `QA`, `Phase 2 Outline`, `Colonization`, `Research`, `Balance`, `Phase 3 Outline`, `Multiplayer Map`, `Alliances`, `Production`, `Ops`, `Security`, `Analytics`, `Monetization`, `Live Ops`, `Content`, `Support`
  - `Priority`: `Now`, `High`, `Medium`, `Low`
  - `Estimate`: numeric story points where `S=1`, `M=3`, `L=5`, `XL=8`
  - `Verification`: `Not run`, `Local pass`, `CI pass`, `Manual needed`, `Accepted`, `Blocked`
  - `Depends On`: comma-separated task ids
- Issue labels use:
  - `epic:<EPIC_ID>`
  - `phase:P0`, `phase:P1`, `phase:P1.1`, `phase:P2`, `phase:P2.1`, `phase:P2.2`, `phase:P2.3`, `phase:P3`, `phase:P4`, `phase:P5`
  - `size:S`, `size:M`, `size:L`, `size:XL`
- Before creating anything new in GitHub, first validate task-id mapping locally (`tasks/tasks.json`, local notes, and existing branch names); call GitHub search only when the local source-of-truth is missing a mapping.
- If continuing a partially completed import or task setup, use idempotent behavior.
- When starting a task, move the Project item from `Ready` to `In Progress`.
- When opening a PR, move it to `Review`.
- When blocked, set `Status=Blocked` and `Verification=Blocked`, then comment on the issue with the blocker.
- When verified locally, set `Verification=Local pass`; when CI is green, set `Verification=CI pass`.
- Only set `Status=Done` and close the issue after verification is accepted.

## Response Expectations

When finishing a task, report:

- Task ID and GitHub issue number/link.
- Files changed (including the `README.md` / `DOCUMENTATION.md` updates required by "Documentation Update Rules").
- Verification commands run and their result.
- Any blocker or follow-up that remains.

Keep the report concise and factual.
