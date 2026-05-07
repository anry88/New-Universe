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
- Roadmap coverage matrix: `tasks/ROADMAP_COVERAGE_MATRIX.md`
- GDD: `Stellar_Forge_GDD.pdf`
- GDD addendum: `New_Universe_GDD_Addendum_v1.1.pdf`
- Local dev guide: `README.md` in the implementation repo; `dev/README.md` only exists in the planning bundle before files are moved.

## Main Agent Prompt

You are the implementation agent for New Universe. When the user explicitly asks to start or continue work on a task, for example "take task P1-141", "возьми таску P1-141", or "сделай issue #22", resolve the task from GitHub and `tasks/tasks.json`, then implement it according to this file, the task acceptance criteria, the GDD, and the existing project architecture.

Do not ask the user to repeat the project context, repository links, task plan, stack, or workflow. Treat this `AGENTS.md` as the default project prompt.

Your goal is not just to edit files. Your goal is to complete the task end to end: understand the issue, check dependencies, make the smallest coherent implementation, run the relevant verification, update the GitHub issue/project status when appropriate, and clearly report what changed and what remains.

## Task Start Gate

- Start implementation only when the latest user message clearly asks to start or continue a concrete task or issue. A bare token, secret, URL, project name, clarification, status question, or other config value is input for the current task, not permission to start the next task.
- After completing, blocking, or reporting a task, stop and wait for the next explicit task instruction. Do not automatically pick up the next task from the backlog.
- If the user provides a secret such as a Telegram bot token, use it only for the current task's local configuration or verification. Never print it back, commit it, put it in task metadata, or treat it as a new task command.

## Task Workflow

1. Sync the repository before starting a task.
   - Work in the real git checkout, not the planning bundle.
   - Run `git status --short --branch` first. If there are uncommitted changes you did not make, preserve them and either work around them or ask before touching the affected files.
   - Before creating a new task branch, run `git fetch origin`, switch to `main`, and update it with `git pull --ff-only`.
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

6. Verify.
   - Run the command listed in the task `verify` field when possible.
   - Also run the nearest relevant tests/build/type-check for changed code.
   - If verification cannot run because dependencies, secrets, Docker, or local services are missing, state exactly what blocked it and what command should be run after the blocker is fixed.

7. Finish the task record.
   - Summarize implementation and verification in the final response.
   - If GitHub access is available, link the implementation PR to the completed issue/task and update the GitHub issue/Project record according to the rules below.

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

## Useful Commands

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

Run common checks:

```bash
docker compose exec backend npm test
docker compose exec frontend npm test
docker compose exec backend npm run build
docker compose exec frontend npm run build
```

Database commands:

```bash
docker compose exec backend npm run db:generate
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed
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
- Do not create duplicate GitHub issues for existing task IDs.
- Use `rg`/`rg --files` for search.
- Use structured parsers and project tooling instead of ad hoc text manipulation where practical.
- Keep changes scoped to the task and its dependencies.
- Add or update tests when behavior, schemas, routes, services, or frontend flows change.
- Prefer clear, boring implementation over new abstractions.
- Do not commit secrets. `.env` stays local and must not be committed.

## GitHub Bookkeeping Rules

- Repository owner/name: `anry88/New-Universe`.
- Default branch: `main`.
- Project owner/number: `anry88`, project `3`.
- Project views currently configured:
  - `Execution Board`: `phase:P0,P1`
  - `Phase 0 Setup`: `phase:P0`
  - `Phase 1 Core`: `phase:P1`
  - `Roadmap P2-P5`: `phase:P2,P3,P4,P5`
  - `Phase 2 Expansion`: `phase:P2`
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
  - `Phase`: `P0`, `P1`, `P2`, `P3`, `P4`, `P5`
  - `Epic`: one of the `EPIC-*` ids from `tasks/tasks.json`
  - `Size`: `S`, `M`, `L`, `XL`
  - `Work Type`: `Epic`, `Infra`, `Schema`, `API`, `Worker`, `UI`, `Test`, `Bot`, `Docs`, `Feature`, `Chore`, `Spike`, `Deploy`, `Ops`, `Security`, `Analytics`, `Monetization`, `Live Ops`, `Content`, `Balance`, `Support`
  - `Area`: `Infra`, `DB`, `Auth`, `World`, `Economy`, `Buildings`, `Ships`, `Expeditions`, `Frontend`, `Bot`, `QA`, `Phase 2 Outline`, `Colonization`, `Market`, `Research`, `Balance`, `Phase 3 Outline`, `Multiplayer Map`, `Alliances`, `Player Market`, `Production`, `Ops`, `Security`, `Analytics`, `Monetization`, `Live Ops`, `Content`, `Support`
  - `Priority`: `Now`, `High`, `Medium`, `Low`
  - `Estimate`: numeric story points where `S=1`, `M=3`, `L=5`, `XL=8`
  - `Verification`: `Not run`, `Local pass`, `CI pass`, `Manual needed`, `Accepted`, `Blocked`
  - `Depends On`: comma-separated task ids
- Issue labels use:
  - `epic:<EPIC_ID>`
  - `phase:P0`, `phase:P1`, `phase:P2`, `phase:P3`
  - `size:S`, `size:M`, `size:L`, `size:XL`
- Before creating anything in GitHub, search existing issues by task ID.
- If continuing a partially completed import or task setup, use idempotent behavior.
- When starting a task, move the Project item from `Ready` to `In Progress`.
- When opening a PR, move it to `Review`.
- When blocked, set `Status=Blocked` and `Verification=Blocked`, then comment on the issue with the blocker.
- When verified locally, set `Verification=Local pass`; when CI is green, set `Verification=CI pass`.
- Only set `Status=Done` and close the issue after verification is accepted.

## Response Expectations

When finishing a task, report:

- Task ID and GitHub issue number/link.
- Files changed.
- Verification commands run and their result.
- Any blocker or follow-up that remains.

Keep the report concise and factual.
