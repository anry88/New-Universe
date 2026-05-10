import { db } from '../../db/index.js';
import { colonies } from '../../db/schema/colonies.js';
import { ships, shipTypes } from '../../db/schema/ships.js';
import { buildings, buildingTypes } from '../../db/schema/buildings.js';
import { eq, and } from 'drizzle-orm';
import { colonyService } from './colonies.js';
import { bootstrapColony } from './bootstrap.js';
import { COLONIZATION_RULES } from '../../config/colonization-rules.js';
import { checkColonizationGates } from './colonization-rules.js';
import { spendResources } from '../resources/transactions.js';
import { systems } from '../../db/schema/world.js';

/**
 * Service to found a new colony using a colonizer ship.
 * Acceptance criteria:
 * 1. Only colonizer ships can found a colony.
 * 2. Target planet must be discovered and outside protected foreign home systems.
 * 3. Player must satisfy all colonization gates (limit, cooldown, distance).
 * 4. Ship is consumed.
 * 5. Founding costs are deducted from the home planet.
 * 6. Founding creates a colony and a level 1 command center.
 */
export async function foundColony(userId: string, shipId: string, planetId: string) {
  // 1. Initial gates check (before transaction for efficiency)
  const eligibility = await checkColonizationGates(userId, planetId);
  if (!eligibility.allowed) {
    throw new Error(eligibility.reason || 'Colonization requirements not met');
  }

  return await db.transaction(async (tx) => {
    // 2. Find home planet for resource deduction
    const homeSystem = await tx.query.systems.findFirst({
      where: and(eq(systems.ownerId, userId), eq(systems.isHome, true)),
      with: {
        planets: {
          limit: 1,
        }
      }
    });

    if (!homeSystem || !homeSystem.planets?.[0]) {
      throw new Error('Home planet not found');
    }
    const homePlanetId = homeSystem.planets[0].id;

    // 3. Deduct costs
    const resourceCosts = Object.entries(COLONIZATION_RULES.foundingCost).map(([resourceId, amount]) => ({
      resourceId,
      amount,
    }));

    const spendResult = await spendResources(homePlanetId, resourceCosts, tx);
    if (!spendResult.success) {
      throw new Error(`Insufficient resources on home planet: ${spendResult.error}`);
    }

    // 4. Validate ship
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

    // 5. Re-validate eligibility within transaction to prevent race conditions (especially colony limit)
    // We already checked it once, but inside tx is safer for counters.
    const planetEligibility = await colonyService.canColonize(userId, planetId);
    if (!planetEligibility.allowed) {
      throw new Error(planetEligibility.reason || 'Cannot colonize this planet');
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

    // 5. Establish initial infrastructure (Command Center L1 in build queue)
    const typeInfo = await tx.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, 'command_center'),
    });
    const buildTimeSec = typeInfo?.baseTimeSec || 600;
    const completesAt = new Date(Date.now() + buildTimeSec * 1000);

    await tx.insert(buildings).values({
      planetId: planetId,
      typeId: 'command_center',
      level: 1, // Will be finalized by worker
      slotIndex: 0, // Always starts at first slot
      queueAction: 'build',
      queueCompletesAt: completesAt,
    });

    // 6. Bootstrap economy (resources, storage, regen)
    await bootstrapColony(planetId, tx);

    return newColony;
  });
}
