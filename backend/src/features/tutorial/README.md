# `backend/src/features/tutorial` directory

Tutorial progression and manually claimed diamond rewards for first-time users.

## Files

- **`routes.ts`** — `tutorialRoutes(app)` registers mutation-rate-limited `POST /tutorial/sync` and `POST /tutorial/claim` (mounted at `/tutorial`). `sync` validates the JWT and returns `{ tutorialStep, tutorialCompletedAt, tutorialRewardsClaimed }` after syncing progress from current game state without granting rewards. `claim` accepts `{ stepId }`, requires that step to be complete, grants 100 account diamonds once, and returns the updated tutorial state plus diamond balance.
- **`service.ts`** — `syncTutorialProgress(userId)` inspects user actions (completed mine → completed storage → scout ready → scout sent), advances `users.tutorialStepCompleted`, and clears/sets `tutorialCompletedAt` based on whether all five rewards are claimed. `claimTutorialReward(userId, stepId)` locks the user row, uses `users.tutorialRewardsClaimed` as a bitmask for steps 0..4, and applies the one-time diamond grant atomically.
- **`tutorial.test.ts`** — integration coverage for sync without auto-grants, five one-time diamond claims, final completion after all claims, repeat-claim idempotency, and queued milestones staying locked.

## Verification commands

- `npm test -- tutorial`
