import { db as defaultDb } from '../../db/index.js';
import { buildings, buildingTypes, planets, systems } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { spendResources } from '../resources/transactions.js';

export interface UpgradeResult {
  success: boolean;
  status: number;
  building?: typeof buildings.$inferSelect;
  error?: string;
}

export async function upgradeBuilding(
  userId: string,
  buildingId: string,
): Promise<UpgradeResult> {
  const db = defaultDb;

  const building = await db.query.buildings.findFirst({
    where: eq(buildings.id, buildingId),
  });
  if (!building) {
    return { success: false, status: 404, error: 'Building not found' };
  }

  const planet = await db.query.planets.findFirst({
    where: eq(planets.id, building.planetId),
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

  if (building.queueAction) {
    return {
      success: false,
      status: 400,
      error: 'Building is already in a queue (build or upgrade)',
    };
  }

  const type = await db.query.buildingTypes.findFirst({
    where: eq(buildingTypes.id, building.typeId),
  });
  if (!type) {
    return { success: false, status: 404, error: `Unknown building type: ${building.typeId}` };
  }

  if (building.level >= type.maxLevel) {
    return {
      success: false,
      status: 400,
      error: `Building is already at max level (${type.maxLevel})`,
    };
  }

  const queuedBuildings = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(buildings)
    .where(
      and(
        eq(buildings.planetId, building.planetId),
        sql`${buildings.queueAction} IS NOT NULL`,
      ),
    );
  const queueCount = Number(queuedBuildings[0]?.count || 0);
  if (queueCount >= 1) {
    return {
      success: false,
      status: 400,
      error: 'Build queue is full (max 1 building at a time without premium)',
    };
  }

  /** Matches `BuildingService.upgrade`: scale from current completed level index. */
  const costMultiplier = Math.pow(1.6, building.level);
  const timeMultiplier = Math.pow(1.8, building.level);

  const baseCost = type.baseCost as Record<string, number>;
  const costEntries = Object.entries(baseCost);
  const scaledCosts: { resourceId: string; amount: number }[] = costEntries.map(
    ([resourceId, amount]) => ({
      resourceId,
      amount: Math.ceil(amount * costMultiplier),
    }),
  );

  const upgradeTimeSec = Math.ceil(type.baseTimeSec * timeMultiplier);
  const queueCompletesAt = new Date(Date.now() + upgradeTimeSec * 1000);

  const result = await db.transaction(async (tx) => {
    if (scaledCosts.length > 0) {
      const spendResult = await spendResources(building.planetId, scaledCosts, tx);
      if (!spendResult.success) {
        return { success: false, status: 400, error: spendResult.error } as UpgradeResult;
      }
    }

    const [updated] = await tx
      .update(buildings)
      .set({
        queueAction: 'upgrade',
        queueCompletesAt,
      })
      .where(eq(buildings.id, buildingId))
      .returning();

    try {
      const { Queue: BQueue } = await import('bullmq');
      const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
      const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      const buildQueue = new BQueue('buildings', { connection: redis });
      await buildQueue.add(
        'complete-upgrade',
        { buildingId, planetId: building.planetId },
        { delay: upgradeTimeSec * 1000 },
      );
      await buildQueue.close();
      await redis.quit();
    } catch {
      // Redis/BullMQ not available — worker handles completion via polling
    }

    return {
      success: true,
      status: 200,
      building: updated,
    } satisfies UpgradeResult;
  });

  return result;
}
