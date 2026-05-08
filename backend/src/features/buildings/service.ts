import { db as defaultDb } from '../../db/index.js';
import { buildings, buildingTypes, planets, systems } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { spendResources } from '../resources/transactions.js';

export interface BuildRequest {
  planetId: string;
  typeSlug: string;
}

export interface BuildResult {
  success: boolean;
  status: number;
  building?: typeof buildings.$inferSelect;
  error?: string;
}

export class BuildingService {
  async build(
    userId: string,
    req: BuildRequest,
  ): Promise<BuildResult> {
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

    const type = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, typeSlug),
    });
    if (!type) {
      return { success: false, status: 404, error: `Unknown building type: ${typeSlug}` };
    }

    const existingBuildings = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(buildings)
      .where(eq(buildings.planetId, planetId));
    const buildingCount = Number(existingBuildings[0]?.count || 0);
    if (buildingCount >= planet.slotCount) {
      return {
        success: false,
        status: 400,
        error: `No free slots on this planet (${buildingCount}/${planet.slotCount} used)`,
      };
    }

    const queuedBuildings = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(buildings)
      .where(
        and(
          eq(buildings.planetId, planetId),
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

    const deps = type.deps as { typeId: string; level: number }[] | null;
    if (deps && deps.length > 0) {
      for (const dep of deps) {
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
            error: `Missing dependency: ${dep.typeId} level ${dep.level}`,
          };
        }
      }
    }

    const costs = type.baseCost as Record<string, number>;
    const costEntries = Object.entries(costs);

    const result = await db.transaction(async (tx) => {
      if (costEntries.length > 0) {
        const resourceCosts = costEntries.map(([resourceId, amount]) => ({
          resourceId,
          amount,
        }));

        const spendResult = await spendResources(planetId, resourceCosts, tx);
        if (!spendResult.success) {
          return { success: false, status: 400, error: spendResult.error } as BuildResult;
        }
      }

      const queueCompletesAt = new Date(Date.now() + type.baseTimeSec * 1000);
      const [newBuilding] = await tx
        .insert(buildings)
        .values({
          planetId,
          typeId: typeSlug,
          level: 1,
          queueAction: 'build',
          queueCompletesAt,
        })
        .returning();

      // Enqueue BullMQ job for delayed completion (gracefully handles missing Redis)
      try {
        const { Queue: BQueue } = await import('bullmq');
        const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
          maxRetriesPerRequest: null,
          lazyConnect: true,
        });
        const buildQueue = new BQueue('buildings', { connection: redis });
        await buildQueue.add(
          'complete-build',
          { buildingId: newBuilding.id, planetId },
          { delay: type.baseTimeSec * 1000 },
        );
        await buildQueue.close();
        await redis.quit();
      } catch {
        // Redis/BullMQ not available - worker (P1-162) handles completion via polling
      }

      return {
        success: true,
        status: 200,
        building: newBuilding,
      } satisfies BuildResult;
    });

    return result;
  }
}

export const buildingService = new BuildingService();
