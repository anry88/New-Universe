# `backend/src/features/colonies` directory

Player colonies management outside the home system.

## Files

- **`colonies.ts`** — `ColonyService` singleton. Centralizes colonization rules like discovery checks, home system protection, and per-player colony limits.
- **`found-colony.ts`** — `foundColony(userId, shipId, planetId)` action module. Implements the atomic colonization transaction:
  - Validates ship role is `colonization`.
  - Verifies ship is at the target planet.
  - Consumes the ship.
  - Inserts the `colonies` row.
  - Constructs the initial `command_center` (Level 1).
- **`colonies.test.ts`** — Integration tests for generic colonization rules and limits.
- **`found-colony.test.ts`** — Integration tests for the founding flow and ship consumption.

## Colonization Rules

1. **Discovery**: A player can only colonize a planet they have discovered.
2. **Protection**: Home systems (marked with `isHome: true`) are protected and cannot be colonized by others.
3. **Limit**: Players have a default limit of 5 colonies (configurable via service).
4. **Ship**: founding a colony requires a `colonizer` ship, which is consumed in the process.
5. **Infrastructure**: Every new colony starts with a Command Center at level 1 on slot 0.
