### Summary
This PR fixes a bug where building construction would fail with "not enough resources" even when the UI showed sufficient amounts.

### Key Changes
- **Backend Accrual**: Added `syncPlanetResources` to `accrual.ts` and integrated it into `spendResources` and `gainResources` transactions. This ensures the server accounts for resources regenerated since the last update before checking costs.
- **Drizzle Refactor**: Replaced raw SQL in `transactions.ts` with type-safe Drizzle query builder and added row locking (`FOR UPDATE`).
- **Frontend URL Fix**: Corrected the planetary resources URL in `ResourceBar.tsx` (`/resources/planets/:id`). This prevents the UI from falling back to stale home-planet data from `/me`.
- **Defensive Parsing**: Updated `ResourceBar` to handle both string and number types for resource amounts to prevent NaN issues.

### Verification
- Created a reproduction test case confirming that stale DB balances caused failures.
- Verified that the fix allows spending accrued resources correctly.
- Updated existing tests to handle minor precision differences from real-time accrual.
- Ran all resource tests in Docker: 15 passed.

Closes #411
