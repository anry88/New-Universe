import { db } from '../../db/index.js';
import { colonies } from '../../db/schema/colonies.js';
import { ships, shipTypes } from '../../db/schema/ships.js';
import { buildings } from '../../db/schema/buildings.js';
import { eq, and } from 'drizzle-orm';
import { colonyService } from './colonies.js';
import { bootstrapColony } from './bootstrap.js';

/**
 * Service to found a new colony using a colonizer ship.
 * Acceptance criteria:
 * 1. Only colonizer ships can found a colony.
 * 2. Target planet must be discovered and outside protected foreign home systems.
 * 3. Ship is consumed.
 * 4. Founding creates a colony and a level 1 command center.
 */
export async function foundColony(userId: string, shipId: string, planetId: string) {
  return await db.transaction(async (tx) => {
    // 1. Validate ship
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

    // 2. Validate planet eligibility
    // Note: canColonize handles discovery, home system protection, and user limits.
    const eligibility = await colonyService.canColonize(userId, planetId);
    if (!eligibility.allowed) {
      throw new Error(eligibility.reason || 'Cannot colonize this planet');
    }

    // 3. Consume the ship (deleted to avoid duplication exploits)
    await tx.delete(ships).where(eq(ships.id, shipId));

    // 4. Create the colony record
    const [newColony] = await tx
      .insert(colonies)
      .values({
        ownerId: userId,
        planetId: planetId,
      })
      .returning();

    // 5. Establish initial infrastructure (Command Center L1)
    await tx.insert(buildings).values({
      planetId: planetId,
      typeId: 'command_center',
      level: 1,
      slotIndex: 0, // Always starts at first slot
    });

    // 6. Bootstrap economy (resources, storage, regen)
    await bootstrapColony(planetId, tx);

    return newColony;
  });
}
