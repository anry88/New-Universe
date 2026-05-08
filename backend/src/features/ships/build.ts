import { db as defaultDb } from '../../db/index.js';
import { ships, shipTypes, buildings, planets, systems } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { spendResources } from '../resources/transactions.js';

export interface BuildShipRequest {
  planetId: string;
  typeSlug: string;
}

export interface BuildShipResult {
  success: boolean;
  status: number;
  ship?: typeof ships.$inferSelect;
  error?: string;
}

const MAX_QUEUED_SHIPS = 1;

export async function buildShip(
  userId: string,
  req: BuildShipRequest,
): Promise<BuildShipResult> {
  const { planetId, typeSlug } = req;
  const db = defaultDb;

  const planet = await db.query.planets.findFirst({
    where: eq(planets.id, planetId),
  });
  if (!planet) {
    return { success: false, status: 404, error: 'Planet not found' };
  }

  const system = await db.query.systems.findFirst({
    where: eq(systems.id, planet.systemId),
  });
  if (!system || system.ownerId !== userId) {
    return { success: false, status: 403, error: 'Planet does not belong to you' };
  }

  const shipyard = await db.query.buildings.findFirst({
    where: and(
      eq(buildings.planetId, planetId),
      eq(buildings.typeId, 'shipyard'),
    ),
  });
  if (!shipyard) {
    return {
      success: false,
      status: 400,
      error: 'Shipyard required to build ships',
    };
  }

  const type = await db.query.shipTypes.findFirst({
    where: eq(shipTypes.id, typeSlug),
  });
  if (!type) {
    return { success: false, status: 404, error: `Unknown ship type: ${typeSlug}` };
  }

  const requiredBldgs = type.requiredBuildings as { typeId: string; level: number }[];
  for (const dep of requiredBldgs) {
    const depBuilding = await db.query.buildings.findFirst({
      where: and(
        eq(buildings.planetId, planetId),
        eq(buildings.typeId, dep.typeId),
      ),
    });
    if (!depBuilding || depBuilding.level < dep.level) {
      return {
        success: false,
        status: 400,
        error: `Missing required building: ${dep.typeId} level ${dep.level}`,
      };
    }
  }

  const queuedShips = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(ships)
    .where(
      and(
        eq(ships.locationPlanetId, planetId),
        eq(ships.status, 'building'),
      ),
    );
  const queueCount = Number(queuedShips[0]?.count || 0);
  if (queueCount >= MAX_QUEUED_SHIPS) {
    return {
      success: false,
      status: 400,
      error: `Shipyard queue is full (max ${MAX_QUEUED_SHIPS} ship at a time)`,
    };
  }

  const costs = type.buildCost as Record<string, number>;
  const costEntries = Object.entries(costs);

  const result = await db.transaction(async (tx) => {
    if (costEntries.length > 0) {
      const resourceCosts = costEntries.map(([resourceId, amount]) => ({
        resourceId,
        amount,
      }));
      const spendResult = await spendResources(planetId, resourceCosts, tx);
      if (!spendResult.success) {
        return { success: false, status: 400, error: spendResult.error } as BuildShipResult;
      }
    }

    const [newShip] = await tx
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: typeSlug,
        locationPlanetId: planetId,
        status: 'building',
        cargoJson: {},
        fuel: '0',
      })
      .returning();

    try {
      const { Queue: BQueue } = await import('bullmq');
      const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
      const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      const shipQueue = new BQueue('ships', { connection: redis });
      await shipQueue.add(
        'complete-build',
        { shipId: newShip.id, planetId },
        { delay: type.buildTimeSec * 1000 },
      );
      await shipQueue.close();
      await redis.quit();
    } catch {
      // Redis/BullMQ not available — worker handles completion via polling
    }

    return {
      success: true,
      status: 200,
      ship: newShip,
    } satisfies BuildShipResult;
  });

  return result;
}
