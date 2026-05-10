## Description
Implemented building demolition with a 50% resource refund of all construction and upgrade costs.

### Changes
- **Shared**:
  - Added `DemolishRequest` and `DemolishStatus` types.
- **Backend**:
  - Implemented `BuildingService.demolish`:
    - Calculates total costs spent: `baseCost * (2^level - 1)`.
    - Refunds 50% (floor) of the total spent for each resource.
    - Atomically updates planet resources and removes the building.
    - Recalculates resource regeneration rates if a production building is demolished.
  - Added `POST /buildings/demolish` endpoint.
- **Frontend**:
  - Added "Demolish Installation" button to `UpgradeDialog` with confirmation prompt.
  - Implemented `handleDemolish` in `PlanetDetailPage` with optimistic UI handling and React Query invalidation.

### Verification
- Added unit test in `service.test.ts` to verify the refund calculation and resource update: PASS.
- Ran backend lint, build, and tests: PASS.
- Ran frontend build in Docker: PASS.

Closes #208
