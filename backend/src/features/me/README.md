# `backend/src/features/me` directory

This feature handles the retrieval of the current player's state. It is the primary "single source of truth" for the frontend.

## Files

- **`routes.ts`** — `meRoutes(app)` registers `GET /me`. 
  - It requires a valid JWT in the `Authorization: Bearer <token>` header.
  - It validates the token using `JWT_SECRET` from the environment.
  - On success, it returns the current player's record from the `users` table, with `tgId` converted to a string.
- **`me.test.ts`** — Vitest coverage for the `me` feature. It tests both authorized (with token) and unauthorized (missing token) access paths.

## Adding to player state

When new features are added (e.g., resources, buildings, expeditions), update the `GET /me` handler in `routes.ts` to include these in the response so the frontend receives them during the initial boot sequence.
