# `frontend/src/pages/onboarding` directory

Onboarding tutorial pages shown to first-time players.

## Files

- **`Onboarding.tsx`** — page-level wrapper around `Tutorial`. Builds the five tutorial steps from `/me` state, supports skip, and routes users back to the home screen.

## Adding a new onboarding step

1. Extend the `steps` array in `Onboarding.tsx`.
2. Ensure the backend sync logic updates the matching `tutorialStep`.
3. Keep completion messaging aligned with the awarded resources.
