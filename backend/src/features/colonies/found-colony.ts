import { db } from '../../db/index.js';
import { colonies } from '../../db/schema/colonies.js';
import { ships, shipTypes } from '../../db/schema/ships.js';
import { buildings } from '../../db/schema/buildings.js';
import { eq, and } from 'drizzle-orm';
import { colonyService } from './colonies.js';
import { bootstrapColony } from './bootstrap.js';
import { checkColonizationGates } from './colonization-rules.js';

/**
 * Service to found a new colony from a colonizer ship that has arrived
 * at the target planet.
 *
 * Game model (post P3-EPIC-STARTER-SYSTEM-REWORK):
 *  - Discovery ≠ colonization. A discovered planet stays read-only until
 *    a colonizer is delivered.
 *  - On arrival the colonizer **is** the command center: the ship is
 *    consumed and a level 1 command_center is created instantly at slot 0.
 *  - No extra resources are deducted from the home planet — the
 *    colonizer's build cost already paid for that step.
 *  - The colony is bootstrapped (starting stock + regen rates) so the
 *    player can begin building on the new planet immediately.
 *
 * Acceptance criteria (updated):
 *  1. Only colonizer ships can found a colony.
 *  2. Target planet must be discovered and outside protected foreign home systems.
 *  3. Player must satisfy all colonization gates (limit, cooldown, distance).
 *  4. Ship is consumed.
 *  5. A level-1 command_center is created instantly (no queue).
 *  6. Colony economy is bootstrapped.
 */
export async function foundColony(userId: string, shipId: string, planetId: string) {
  // 1. Initial gates check (before transaction for efficiency)
  const eligibility = await checkColonizationGates(userId, planetId);
  if (!eligibility.allowed) {
    throw new Error(eligibility.reason || 'Colonization requirements not met');
  }

  return await db.transaction(async (tx) => {
    // 2. Validate ship
    const [ship] = await tx
      .select({
        id: ships.id,
        typeId: ships.typeId,
        ownerId: ships.ownerId,
        locationPlanetId: ships.locationPlanetId,
        role: shipTypes.role,
        status: ships.status,
      })
      .from(ships)
      .innerJoin(shipTypes, eq(ships.typeId, shipTypes.id))
      .where(and(eq(ships.id, shipId), eq(ships.ownerId, userId)))
      .limit(1);

    if (!ship) {
      throw new Error('Ship not found');
    }

    if (ship.role !== 'colonization') {
      throw new Error('Only colonizer ships can found a colony');
    }

    if (ship.status !== 'idle') {
      throw new Error('Ship must be idle to found a colony');
    }

    if (ship.locationPlanetId !== planetId) {
      throw new Error('Ship is not at the target planet');
    }

    // 3. Re-validate eligibility within transaction to prevent race conditions
    // (especially colony-count limits, which are racy under concurrent calls).
    const planetEligibility = await colonyService.canColonize(userId, planetId);
    if (!planetEligibility.allowed) {
      throw new Error(planetEligibility.reason || 'Cannot colonize this planet');
    }

    // 4. Consume the ship (deleted to avoid duplication exploits)
    await tx.delete(ships).where(eq(ships.id, shipId));

    // 5. Create the colony record
    const [newColony] = await tx
      .insert(colonies)
      .values({
        ownerId: userId,
        planetId: planetId,
      })
      .returning();

    // 6. Instantly stand up a level-1 command_center. The colonizer ship
    // **is** the command-center hull on arrival — there is no construction
    // queue, no founding cost, and no waiting period.
    await tx.insert(buildings).values({
      planetId: planetId,
      typeId: 'command_center',
      level: 1,
      slotIndex: 0,
    });

    // 7. Bootstrap economy (starting stock, storage caps, regen rates)
    await bootstrapColony(planetId, tx);

    return newColony;
  });
}
