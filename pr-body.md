# [P2-COL-007] Colonization constraints and cost balance

This PR implements the colonization rules framework, enforcing research prerequisites, colony limits, cooldowns, and distance constraints. It also includes the frontend UI to communicate these requirements to the player.

## Changes

### Backend
- **Rules Config**: Defined centralized colonization rules in `backend/src/config/colonization-rules.ts`.
- **Validation Engine**: Implemented `checkColonizationGates` in `backend/src/features/colonies/colonization-rules.ts`.
- **Enforcement**: Integrated gates into `foundColony` and added resource cost deduction from the home planet.
- **API**: Added `GET /colonies/eligibility/:planetId` endpoint.
- **Schema**: Added `x, y, z` coordinates to the `systems` table.

### Frontend
- **ColonizationRequirements**: New component for visualizing eligibility and costs.
- **FoundColonyDialog**: New modal for the colonization process.
- **System Map**: Integrated "Colonize" action for unowned planets.

## Verification
- **Unit Tests**: `src/features/colonies/found-colony.test.ts` (4/4 passed).
- **Service Tests**: `src/features/colonies/colonies.test.ts` (5/5 passed).
- **Linting**: Passed.
- **Manual**: Verified schema updates and API response structure.

Closes #60
