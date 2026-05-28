# `backend/src/features/research` directory

Research owns the server-side tech tree flow: catalog reads, start/rush mutations, completion processing, effect composition, and unlock gates used by other backend features.

## Files

- **`completion.ts`** — exports `processCompletedResearch(db, options?)`, the idempotent due-row processor for `research_progress`. It can scope work to one user, suppress notifications for online sync, and invalidate a provided request-scoped effects cache after a tier completes.
- **`completion.test.ts`** — Vitest coverage for exactly-once completions, future timers, scoped online completion, notification behavior, and effects-cache invalidation after completion.
- **`data.ts`** — exports `TECH_TREE` and `getResearchDef(branch, level)` from the shared research catalog.
- **`effects.ts`** — exports deterministic research effect composition, request-scoped effects-cache helpers, and apply helpers for resource production/storage, energy generation/storage/efficiency, ship speed, sensor range, weapon range, and build time.
- **`effects.test.ts`** — unit coverage for deterministic effect stacking, helper application, weapon-range scaling, unknown branch tolerance, and request-cache invalidation.
- **`gates.ts`** — exports research-level loading and requirement assertions used by buildings, ships, colonization, cargo routes, and jump travel.
- **`gates.test.ts`** — unit coverage for level maps and requirement assertions.
- **`research.test.ts`** — integration coverage for `POST /research/start`, lab gating, one-active-research queue rules, and resource spending.
- **`routes.ts`** — registers `POST /research/start` and `POST /research/rush` with mutation rate limits, schemas, auth, due-completion sync, prerequisite checks, localized insufficient-resource errors, and resource or diamond spending. Lab requirements ignore labs still in initial construction but keep the current completed level available while a lab upgrade timer is running.
- **`rush.ts`** — exports `rushActiveResearch(userId, branch)`, atomically spends diamonds, completes the active tier, and invalidates the research effects cache hook.
- **`rush.test.ts`** — integration coverage for rush success and insufficient-diamond rollback.

## Conventions

Research effects are cheap to recompute, but hot request paths such as `/me` should pass a request-scoped cache to avoid duplicate `research_progress` reads. Any code that completes or rushes a tier and then reuses the same cache must call `invalidateResearchEffectsCache` or pass the cache through `processCompletedResearch`.
