# `backend/src/features/me` directory

This feature handles the retrieval of the current player's state. It is the primary "single source of truth" for the frontend.

## Files

- **`online-sync.ts`** — `syncDuePlayerState(userId)` is the active-session completion path used by `/me`. It finalizes due building queues, production processes (including pause/resume checks), ship builds, research tiers, discovery/expedition/colonization arrivals, cargo delivery, and combat ticks for the current user with notification suppression, then marks any stale pending completion notifications as read/non-pending so Telegram pushes are not sent after an online acknowledgement.
- **`routes.ts`** — `meRoutes(app)` registers `GET /me` and `PATCH /me/preferences`.
  - It requires a valid JWT in the `Authorization: Bearer <token>` header.
  - It validates the token using `JWT_SECRET` from the environment.
  - On success, it first runs `syncDuePlayerState(userId)`, creates request-scoped research/effects snapshots, then tutorial progression sync, then returns the full player state:
    - `user`: the User object with `tgId` converted to string plus `preferredLocale`, normalized `notificationPreferences`, and onboarding fields (`tutorialStep`, `tutorialCompletedAt`, `tutorialRewardsClaimed`)
    - `homeSystem`: the player's home system (includes derived **`shortTag`** from the system UUID for localized titles) with **`planets` filtered to `discovered_planets` rows for this user** (capital plus any bodies surveyed by scout); per-planet resources (lazy-computed amounts, `regenRate`, and `richness` deposit level) and buildings (queue status plus server-derived `queueStartedAt`, energy state, and active/paused production processes) follow that list. Visible planets share one batched resource/richness/production read and one in-memory energy computation per planet instead of calling `computeCurrentResources` / `resolvePlanetEnergyState` separately for every planet.
    - `ships`: list of player's non-destroyed ships with `queueStartedAt` when a build timer is active. Destroyed ship rows stay in Postgres for combat history/auditing but are not sent back to the player state.
    - `expeditions`: list of active expeditions, including `stationed` one-way Jump Gate point deployments so maps and combat can keep rendering ships in common systems after arrival.
    - `research`: research progress rows with `startedAt` while a tier timer is active.
    - `colonization`: current server-counted colony total, current Logistics-scaled colony cap, cooldown metadata, and the per-Logistics-level slot increase used by the frontend shipyard and mission preflight warnings.
    - `rushPricing`: account-wide rush pricing metadata for live diamond-cost previews.
  - `PATCH /me/preferences` is mutation-rate-limited, JSON-schema-validated, accepts `{ preferredLocale?: 'en' | 'ru', notificationPreferences?: Partial<NotificationPreferences> }`, updates `users.preferredLocale` and/or `users.notificationPreferences`, and returns the persisted locale plus normalized notification toggles for frontend refetch/sync.
- **`me.test.ts`** — Vitest coverage for the `me` feature. It tests both authorized (with token) and unauthorized (missing token) access paths.

## Adding to player state

The `/me` endpoint is the "single source of truth" for the frontend. When new features are added (e.g., ships, expeditions, research), update the `GET /me` handler in `routes.ts` to include these in the response so the frontend receives them during the initial boot sequence.
