# `backend/src/features/colonies` directory

Player colony and settlement management. Discovery only reveals a planet; a planet becomes buildable after the capital Command Center exists or a colonizer creates a colony record and Command Center on arrival.

## Files

- **`colonies.ts`** — `ColonyService` singleton. Centralizes colonization rules like discovery checks, home system protection, and per-player colony limits.
- **`ownership.ts`** — settlement ownership helpers. `getPlayerPlanetSettlement(userId, planetId, db?)` returns whether a planet is the user's capital or an active colony, and `getPlanetSettlementOwnerId(planetId, db?)` resolves completion-notification ownership for both home capitals and colony planets.
- **`found-colony.ts`** — `foundColony(userId, shipId, planetId)` action module. Implements the atomic colonization transaction:
  - Validates ship role is `colonization`.
  - Verifies ship is at the target planet.
  - Consumes the ship.
  - Inserts the `colonies` row.
  - Constructs the initial `command_center` (Level 1).
  - Triggers the colony bootstrap flow.
- **`bootstrap.ts`** — `bootstrapColony(planetId, tx?)` action module. Initializes the colony's economy:
  - Grants initial resource stock from `config/colony-bootstrap.ts`.
  - Creates `planet_resources` rows for known richness deposits, but leaves `regenRate = 0` until extractor buildings complete.
- **`colonies.test.ts`** — Integration tests for generic colonization rules and limits.
- **`found-colony.test.ts`** — Integration tests for the founding flow and ship consumption.
- **`bootstrap.test.ts`** — Integration tests for economy initialization.

## Colonization Rules

1. **Discovery**: A player can only colonize a planet they have discovered.
2. **Protection**: Foreign home systems (marked with `isHome: true` and another owner) are protected. A player's own discovered home-system bodies can be settled by colonizer, but discovery alone does not permit construction.
3. **Limit**: Players have a default limit of 5 colonies (configurable via service).
4. **Ship**: founding a colony requires a `colonizer` ship, which is consumed in the process.
5. **Infrastructure**: Every new colony starts with a completed Command Center at level 1 on slot 0; the colonizer is consumed as that base hull.
6. **Economy**: New colonies receive a one-time grant of basic resources (iron, silicon, etc.) to enable early development without home-world shipments, but they do not passively harvest deposits until the player builds matching extractor infrastructure.
