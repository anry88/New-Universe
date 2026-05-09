# `backend/src/features/tutorial` directory

Tutorial progression and completion reward logic for first-time users.

## Files

- **`routes.ts`** — `tutorialRoutes(app)` registers `POST /tutorial/sync` (mounted at `/tutorial`). The endpoint validates the JWT and returns `{ tutorialStep, tutorialCompletedAt }` after syncing progress from current game state.
- **`service.ts`** — `syncTutorialProgress(userId)` inspects user actions (mine/storage/scout/expedition), updates `users.tutorialStepCompleted`, and grants a one-time completion reward (`+200 iron`, `+100 water`) to the home planet through `gainResources(...)` in the same DB transaction when step 5 is reached.
- **`tutorial.test.ts`** — integration coverage for completion sync and one-time reward behavior.

## Verification commands

- `npm test -- tutorial`
