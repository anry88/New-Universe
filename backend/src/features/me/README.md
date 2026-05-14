# `backend/src/features/me` directory

This feature handles the retrieval of the current player's state. It is the primary "single source of truth" for the frontend.

## Files

- **`online-sync.ts`** — `syncDuePlayerState(userId)` is the active-session completion path used by `/me`. It finalizes due building queues, production processes (including pause/resume checks), ship builds, research tiers, and expedition/colonization arrivals for the current user with notification suppression, then marks any stale pending completion notifications as read/non-pending so Telegram pushes are not sent after an online acknowledgement.
- **`routes.ts`** — `meRoutes(app)` registers `GET /me` and `PATCH /me/preferences`.
  - It requires a valid JWT in the `Authorization: Bearer <token>` header.
  - It validates the token using `JWT_SECRET` from the environment.
  - On success, it first runs `syncDuePlayerState(userId)`, creates request-scoped research/effects snapshots, then tutorial progression sync, then returns the full player state:
    - `user`: the User object with `tgId` converted to string plus `preferredLocale` and onboarding fields (`tutorialStep`, `tutorialCompletedAt`)
    - `homeSystem`: the player's home system (includes derived **`shortTag`** from the system UUID for localized titles) with **`planets` filtered to `discovered_planets` rows for this user** (capital plus any bodies surveyed by scout); per-planet resources (lazy-computed amounts, `regenRate`, and `richness` deposit level) and buildings (queue status plus server-derived `queueStartedAt`, energy state, and active/paused production processes) follow that list. Visible planets share one batched resource/richness/production read and one in-memory energy computation per planet instead of calling `computeCurrentResources` / `resolvePlanetEnergyState` separately for every planet.
    - `ships`: list of player's ships with `queueStartedAt` when a build timer is active.
    - `expeditions`: list of active expeditions.
    - `research`: research progress rows with `startedAt` while a tier timer is active.
    - `rushPricing`: account-wide rush pricing metadata for live diamond-cost previews.
  - `PATCH /me/preferences` is mutation-rate-limited, JSON-schema-validated, accepts `{ preferredLocale: 'en' | 'ru' }`, updates `users.preferredLocale`, and returns the persisted locale for frontend refetch/sync.
- **`me.test.ts`** — Vitest coverage for the `me` feature. It tests both authorized (with token) and unauthorized (missing token) access paths.

## Adding to player state

The `/me` endpoint is the "single source of truth" for the frontend. When new features are added (e.g., ships, expeditions, research), update the `GET /me` handler in `routes.ts` to include these in the response so the frontend receives them during the initial boot sequence.
