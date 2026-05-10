# `backend/src/features/me` directory

This feature handles the retrieval of the current player's state. It is the primary "single source of truth" for the frontend.

## Files

- **`routes.ts`** — `meRoutes(app)` registers `GET /me`. 
  - It requires a valid JWT in the `Authorization: Bearer <token>` header.
  - It validates the token using `JWT_SECRET` from the environment.
  - On success, it runs tutorial progression sync, then returns the full player state:
    - `user`: the User object with `tgId` converted to string plus onboarding fields (`tutorialStep`, `tutorialCompletedAt`)
    - `homeSystem`: the player's home system (includes derived **`shortTag`** from the system UUID for localized titles) with **`planets` filtered to `discovered_planets` rows for this user** (capital plus any bodies surveyed by scout); per-planet resources (lazy-computed amounts) and buildings (queue status) follow that list
    - `ships`: list of player's ships.
    - `expeditions`: list of active expeditions.
- **`me.test.ts`** — Vitest coverage for the `me` feature. It tests both authorized (with token) and unauthorized (missing token) access paths.

## Adding to player state

The `/me` endpoint is the "single source of truth" for the frontend. When new features are added (e.g., ships, expeditions, research), update the `GET /me` handler in `routes.ts` to include these in the response so the frontend receives them during the initial boot sequence.
