## Description
Implement the colony management frontend, enabling players to view owned colonies, switch focus between planets, and initiate cargo transfers via a mobile-first interface in the Telegram Mini App.

### Changes
- **Backend**: Updated GET /me to return all owned planets (home + colonies).
- **Shared**: Added planets field to User type.
- **Frontend**:
  - New useColonies hook for state management of owned planets and focal planet.
  - New ColoniesPage for listing and switching planets.
  - New CargoTransferDialog for interplanetary logistics.
  - Updated HomePage, PlanetDetailPage, and PlanetView to support switching focus across all owned colonies.
  - Updated CosmicBottomNav with 'Colonies' tab.

### Verification
- Frontend build and lint passed (npm run build && npm run lint).
- Architecture documented in DOCUMENTATION.md and frontend/src/README.md.

Closes #22
