# `backend/src/features/me` directory

This feature handles the retrieval of the current player's state. It is the primary "single source of truth" for the frontend.

## Files

- **`routes.ts`** — `meRoutes(app)` registers `GET /me`. 
  - It requires a valid JWT in the `Authorization: Bearer <token>` header.
  - It validates the token using `JWT_SECRET` from the environment.
  - On success, it returns the full player state:
    - `user`: the User object with `tgId` converted to string
    - `homeSystem`: the player's home system with planets, their resources (with lazy-computed current amounts), and buildings (with queue status)
- **`me.test.ts`** — Vitest coverage for the `me` feature. It tests both authorized (with token) and unauthorized (missing token) access paths.

## Adding to player state

The `/me` endpoint is the "single source of truth" for the frontend. When new features are added (e.g., ships, expeditions, research), update the `GET /me` handler in `routes.ts` to include these in the response so the frontend receives them during the initial boot sequence.
