# `backend/src/features/tutorial` directory

Tutorial progression and per-milestone rewards for first-time users.

## Files

- **`routes.ts`** — `tutorialRoutes(app)` registers mutation-rate-limited `POST /tutorial/sync` (mounted at `/tutorial`). The endpoint validates the JWT and returns `{ tutorialStep, tutorialCompletedAt }` after syncing progress from current game state.
- **`service.ts`** — `syncTutorialProgress(userId)` inspects user actions (mine → storage → scout → expedition), advances `users.tutorialStepCompleted`, and applies **resource grants atomically** in one transaction:
  - Per-step bundles from [`shared/config/tutorialRewards.ts`](../../../../shared/config/tutorialRewards.ts) (`TUTORIAL_STEP_RESOURCE_GRANTS` for steps 1–4 as each threshold is crossed).
  - Completion bundle `TUTORIAL_COMPLETION_RESOURCE_GRANTS` when an expedition row exists (same moment `tutorial_completed_at` is set).
  - Totals remain **+200 iron** and **+100 water** to the home capital vs starting balances when all milestones complete in one sync (see `tutorial.test.ts`).
- **`tutorial.test.ts`** — integration coverage for completion sync, idempotent rewards, and intermediate grants.

## Verification commands

- `npm test -- tutorial`
