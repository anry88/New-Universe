import { db as defaultDb } from '../../db/index.js';
import {
  expeditions,
  planets,
  colonies,
  ships,
  shipTypes,
  systems,
} from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { spendResources } from '../resources/transactions.js';
import { applyShipSpeed, getResearchEffectsForUser } from '../research/effects.js';

export interface CargoTransferRequest {
  shipId: string;
  targetPlanetId: string;
  resources: { resourceId: string; amount: number }[];
}

/**
 * Service to launch a cargo transfer between two player-owned planets.
 */
export async function launchCargoTransfer(
  userId: string,
  request: CargoTransferRequest,
) {
  if (!request) throw new Error('Request body is missing');
  const { shipId, targetPlanetId, resources } = request;
  if (!resources) throw new Error('Resources are missing');

  return await defaultDb.transaction(async (tx) => {
    // 1. Validate ship ownership and state
    const shipRows = await tx
      .select({
        id: ships.id,
        ownerId: ships.ownerId,
        status: ships.status,
        locationPlanetId: ships.locationPlanetId,
        typeId: ships.typeId,
        cargoCapacity: shipTypes.cargo,
        speed: shipTypes.speed,
      })
      .from(ships)
      .innerJoin(shipTypes, eq(ships.typeId, shipTypes.id))
      .where(and(eq(ships.id, shipId), eq(ships.ownerId, userId)))
      .limit(1);

    const ship = shipRows[0];
    if (!ship) throw new Error('Ship not found or access denied');
    if (ship.status !== 'idle') throw new Error('Ship is not idle');
    if (!ship.locationPlanetId) throw new Error('Ship is not on a planet');

    // 2. Validate target planet ownership
    const targetRows = await tx
      .select({
        id: planets.id,
        ownerId: colonies.ownerId,
        x: systems.sectorX,
        y: systems.sectorY,
        z: systems.sectorZ,
      })
      .from(planets)
      .innerJoin(systems, eq(planets.systemId, systems.id))
      .leftJoin(colonies, eq(planets.id, colonies.planetId))
      .where(eq(planets.id, targetPlanetId))
      .limit(1);

    const target = targetRows[0];
    if (!target) throw new Error('Target planet not found');
    if (target.ownerId !== userId) throw new Error('Target planet is not owned by you');
    if (target.id === ship.locationPlanetId) throw new Error('Target planet must be different from origin');

    // 3. Get origin coordinates
    const originRows = await tx
      .select({
        x: systems.sectorX,
        y: systems.sectorY,
        z: systems.sectorZ,
      })
      .from(planets)
      .innerJoin(systems, eq(planets.systemId, systems.id))
      .where(eq(planets.id, ship.locationPlanetId))
      .limit(1);

    const origin = originRows[0];
    if (!origin) throw new Error('Origin planet not found');

    // 4. Validate cargo capacity
    const totalCargo = resources.reduce((sum, r) => sum + r.amount, 0);
    if (totalCargo > ship.cargoCapacity) {
      throw new Error(`Cargo (${totalCargo}) exceeds ship capacity (${ship.cargoCapacity})`);
    }

    // 5. Calculate travel time (ETA)
    const distance = Math.sqrt(
      Math.pow(target.x - origin.x, 2) +
      Math.pow(target.y - origin.y, 2) +
      Math.pow(target.z - origin.z, 2)
    );
    
    const researchEffects = await getResearchEffectsForUser(userId, tx);
    const speed = applyShipSpeed(Number(ship.speed), researchEffects);
    const etaSeconds = Math.max(10, Math.ceil((distance * 60) / speed));
    const eta = new Date(Date.now() + etaSeconds * 1000);

    // 6. Atomic resource reservation on origin
    const spendResult = await spendResources(ship.locationPlanetId, resources, tx);
    if (!spendResult.success) {
      throw new Error(spendResult.error || 'Failed to reserve resources');
    }

    // 7. Create expedition record
    const [expedition] = await tx
      .insert(expeditions)
      .values({
        shipId: ship.id,
        type: 'cargo_transfer',
        originPlanetId: ship.locationPlanetId,
        targetPlanetId: target.id,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z,
        status: 'in_flight',
        eta,
        result: {
          resources,
          totalCargo,
          distance,
        },
      })
      .returning();

    // 8. Update ship state
    const cargoJson: Record<string, number> = {};
    for (const r of resources) {
      cargoJson[r.resourceId] = (cargoJson[r.resourceId] || 0) + r.amount;
    }

    await tx
      .update(ships)
      .set({
        status: 'moving',
        cargoJson,
      })
      .where(eq(ships.id, ship.id));

    // 9. Enqueue arrival (BullMQ)
    try {
      const { Queue: BullQueue } = await import('bullmq');
      const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
      const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      const expeditionQueue = new BullQueue('expeditions', { connection: redis });
      await expeditionQueue.add('arrive_cargo', { expeditionId: expedition.id, shipId: ship.id }, { delay: etaSeconds * 1000 });
      await expeditionQueue.close();
      await redis.quit();
    } catch (err) {}

    return { success: true, expedition };
  });
}
