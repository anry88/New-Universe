# `backend/src/features/me` directory

This feature handles the retrieval of the current player's state. It is the primary "single source of truth" for the frontend.

## Files

- **`online-sync.ts`** — `syncDuePlayerState(userId, options?)` is the active-session completion path used around `/me`. The full path finalizes due building queues, production processes (including pause/resume checks), ship builds, research tiers, discovery/expedition/colonization arrivals, and cargo delivery for the current user with notification suppression, then marks any stale pending completion notifications as read/non-pending so Telegram pushes are not sent after an online acknowledgement. `queueDuePlayerStateSync(userId)` runs a deduplicated lightweight version after `GET /me` has already sent its snapshot: it still completes due work, but skips expensive non-due expedition visibility scans and completed-building regeneration recomputation. Combat is intentionally excluded: ship/building damage is advanced only by the authoritative combat worker, so opening the game from multiple devices cannot double-apply damage.
- **`routes.ts`** — `meRoutes(app)` registers `POST /me/session/start`, `GET /me`, and `PATCH /me/preferences`.
  - It requires a valid JWT in the `Authorization: Bearer <token>` header.
  - It validates the token using `JWT_SECRET` from the environment.
  - `POST /me/session/start` creates the explicit online-session baseline used by aggregate activity metrics. Later authenticated requests from the visible frontend carry `X-NU-Online-Activity: 1`; the application hook adds the full elapsed time since the previous online request without using construction/research worker completions, inactivity-gap splitting, or a five-minute heartbeat cap.
  - On success, it creates request-scoped research/effects snapshots, runs tutorial progression sync, returns the full player state, then queues lightweight due-state sync in the background so the boot snapshot is not blocked by worker-style completion scans:
    - `user`: the User object with `tgId` converted to string plus `preferredLocale`, normalized `notificationPreferences`, and onboarding fields (`tutorialStep`, `tutorialCompletedAt`, `tutorialRewardsClaimed`)
    - `homeSystem`: the player's home system (includes derived **`shortTag`** from the system UUID for localized titles) with **`planets` filtered to `discovered_planets` rows for this user** (capital plus any bodies surveyed by scout); planet rows include stable `orbitIndex` metadata so map layout, route math, and solar previews do not depend on mutable display names. Per-planet resources (lazy-computed amounts, `regenRate`, and `richness` deposit level) and buildings (queue status plus server-derived `queueStartedAt`, energy state, and active/paused production processes) follow that list. Visible planets share one batched resource/richness/production read and one in-memory energy computation per planet instead of calling `computeCurrentResources` / `resolvePlanetEnergyState` separately for every planet.
    - `ships`: list of player's non-destroyed ships with `queueStartedAt` when a build timer is active. Destroyed ship rows stay in Postgres for combat history/auditing but are not sent back to the player state.
    - `expeditions`: list of active expeditions, including `stationed` one-way Jump Gate point deployments so maps and combat can keep rendering ships in common systems after arrival.
    - `research`: research progress rows with `startedAt` while a tier timer is active.
    - `colonization`: current server-counted colony total, current Logistics-scaled colony cap, cooldown metadata, and the per-Logistics-level slot increase used by the frontend shipyard and mission preflight warnings.
    - `rushPricing`: account-wide rush pricing metadata for live diamond-cost previews.
  - `PATCH /me/preferences` is mutation-rate-limited, JSON-schema-validated, accepts `{ preferredLocale?: 'en' | 'ru', notificationPreferences?: Partial<NotificationPreferences> }`, updates `users.preferredLocale` and/or `users.notificationPreferences`, and returns the persisted locale plus normalized notification toggles for frontend refetch/sync.
- **`me.test.ts`** — Vitest coverage for the `me` feature. It tests both authorized (with token) and unauthorized (missing token) access paths.

## Adding to player state

The `/me` endpoint is the "single source of truth" for the frontend. When new features are added (e.g., ships, expeditions, research), update the `GET /me` handler in `routes.ts` to include these in the response so the frontend receives them during the initial boot sequence.
