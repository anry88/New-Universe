# `frontend/src/pages/onboarding` directory

Onboarding tutorial pages shown to first-time players.

## Files

- **`Onboarding.tsx`** — page-level wrapper around `Tutorial`. Builds the five tutorial steps from `/me` state, syncs `POST /tutorial/sync` once when the page opens, shows either the active objective or the next claimable reward as a toast-like hint, claims 100-diamond rewards via `POST /tutorial/claim`, supports skip, and routes users back to the home screen (or resume from Profile).

## Adding a new onboarding step

1. Extend the `steps` array in `Onboarding.tsx`.
2. Ensure the backend sync logic updates the matching `tutorialStep`.
3. Keep completion messaging aligned with the awarded diamonds and `tutorialRewardsClaimed` bitmask.
