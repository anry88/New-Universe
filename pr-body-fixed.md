### Summary
This PR resolves critical resource validation failures during building construction and colonization by correctly calculating planetary storage capacity and ensuring real-time resource synchronization.

### Key Changes
- **Storage Capacity Aggregation**: Fixed `computeCurrentResources` in `backend/src/features/resources/accrual.ts` to correctly sum capacity from all 'storage' buildings on a planet, including research multipliers.
- **Over-cap Resource Preservation**: Updated accrual logic to preserve existing resource balances that exceed current storage capacity (e.g., from starting bonuses or test seeding), only pausing further production.
- **Accrual-Aware Transactions**: Integrated `syncPlanetResources` into `spendResources` and `gainResources` transactions. This ensures costs are validated against synchronized balances.
- **Schema Relations**: Added missing relations to `buildings` (to `buildingTypes`) and `planets` (to `planetResources`) to enable robust relational queries in the accrual system.
- **Test Stability**: Updated `upgrade.test.ts`, `research.test.ts`, and colonization E2E tests to use `toBeCloseTo` for resource assertions, accommodating real-time accrual variations.

### Verification
- **Unit Tests**: All feature tests passed (including resource and building services).
- **E2E Tests**: `colonization.test.ts`, `first-day.test.ts`, and `phase2-regression.test.ts` passed green.
- **Full Suite**: Verified via `docker compose run --rm backend npm test` (162 tests passed).

Closes #22
