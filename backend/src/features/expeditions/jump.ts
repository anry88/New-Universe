import { db as defaultDb } from '../../db/index.js';
import { ships, researchProgress, discoveredSystems, planets, discoveredPlanets } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getOrCreateSector } from '../world/sectors.js';
import { generateSystemsInSector } from '../world/sector-generator.js';

export interface JumpRequest {
  shipId: string;
  targetSector: {
    x: number;
    y: number;
    z: number;
  };
}

export interface JumpResult {
  success: boolean;
  status: number;
  error?: string;
  targetSystem?: any;
  targetPlanet?: any;
}

const JUMP_FUEL_COST = 50;

export async function jumpShip(userId: string, req: JumpRequest): Promise<JumpResult> {
  const { shipId, targetSector } = req;
  const db = defaultDb;

  // 1. Load ship and type
  const shipRow = await db.query.ships.findFirst({
    where: and(eq(ships.id, shipId), eq(ships.ownerId, userId)),
  });

  if (!shipRow) {
    return { success: false, status: 404, error: 'Ship not found' };
  }

  if (shipRow.typeId !== 'jump_ship') {
    return { success: false, status: 400, error: 'Only Jump Ships can perform jumps' };
  }

  if (shipRow.status !== 'idle') {
    return { success: false, status: 400, error: 'Ship must be idle to jump' };
  }

  // 2. Check Research (Jump Drive level 1+)
  const research = await db.query.researchProgress.findFirst({
    where: and(
      eq(researchProgress.userId, userId),
      eq(researchProgress.branch, 'jump_drive')
    ),
  });

  if (!research || research.level < 1) {
    return { success: false, status: 400, error: 'Jump Drive research level 1 required' };
  }

  // 3. Check Jump Fuel in tank
  if (Number(shipRow.fuel) < JUMP_FUEL_COST) {
    return { success: false, status: 400, error: `Insufficient Jump Fuel in tank (required ${JUMP_FUEL_COST})` };
  }

  // 4. Lazy-generate sector and pick target system
  const sector = await getOrCreateSector(targetSector.x, targetSector.y, targetSector.z);
  const sectorSystems = await generateSystemsInSector(sector);
  if (sectorSystems.length === 0) {
    return { success: false, status: 500, error: 'No systems generated in target sector' };
  }

  // Pick the first system in the sector
  const targetSystem = sectorSystems[0];

  // Get planets in the target system
  const systemPlanets = await db.query.planets.findMany({
    where: eq(planets.systemId, targetSystem.id),
  });

  if (systemPlanets.length === 0) {
    return { success: false, status: 500, error: 'Target system has no planets' };
  }

  // Pick the first planet
  const targetPlanet = systemPlanets[0];

  // 5. Perform the jump
  const result = await db.transaction(async (tx) => {
    // Deduct fuel and move ship
    await tx.update(ships)
      .set({
        fuel: (Number(shipRow.fuel) - JUMP_FUEL_COST).toFixed(2),
        locationPlanetId: targetPlanet.id,
      })
      .where(eq(ships.id, shipId));

    // Discover the target system
    await tx.insert(discoveredSystems)
      .values({
        userId,
        systemId: targetSystem.id,
      })
      .onConflictDoNothing();

    // Discover all planets in the target system
    for (const p of systemPlanets) {
      await tx.insert(discoveredPlanets)
        .values({
          userId,
          planetId: p.id,
        })
        .onConflictDoNothing();
    }

    return {
      success: true,
      status: 200,
      targetSystem,
      targetPlanet,
    };
  });

  return result;
}
