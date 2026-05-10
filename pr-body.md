## Description
Implemented instant building completion when the game is open. The client now triggers a sync when the construction timer expires, bypassing the background worker for active sessions.

### Changes
- **Backend**:
  - Refactored building completion logic into `BuildingService.finalizeBuildingConstruction`.
  - Added `BuildingService.syncPlanetBuildings` to handle batch synchronization for a planet.
  - Added `POST /buildings/sync/:planetId` endpoint.
  - Included `planetId` in `/buildings/queue` response.
  - Updated notifications to include `planetName` and skip push notifications if synced online.
  - Updated notification formatter to display the human-readable planet name.
- **Frontend**:
  - `BuildQueue` component now monitors the construction timer.
  - When the timer reaches zero, it calls the `/sync` endpoint and invalidates the 'me' query to refresh the UI.

### Verification
- Added unit test in `service.test.ts` for the sync functionality.
- Ran backend lint, build, and tests (buildings and notifications): PASS.
- Ran frontend build: PASS.

Closes #207
