import { db } from '../../db/index.js';
import { buildings, buildingTypes, planets, planetResources, systems } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { BuildingType, ConstructionStatus, BuildRequest, UpgradeRequest } from '@shared/types/buildings.js';
import { spendResources } from '../resources/transactions.js';

export class BuildingService {
  async getBuildingTypes(): Promise<BuildingType[]> {
    const types = await db.query.buildingTypes.findMany();
    return types as BuildingType[];
  }

  async build(userId: string, planetId: string, typeId: string, slotIndex: number): Promise<ConstructionStatus> {
    const planet = await db.query.planets.findFirst({
      where: eq(planets.id, planetId),
      with: {
        system: true,
        buildings: true,
      }
    });

    if (!planet || (planet.system as any).ownerId !== userId) {
      throw new Error('Planet not found or not owned by user');
    }

    if (slotIndex < 0 || slotIndex >= planet.slotCount) {
      throw new Error('Invalid slot index');
    }

    const existingAtSlot = planet.buildings?.find((b: any) => b.slotIndex === slotIndex);
    if (existingAtSlot) {
      throw new Error('Slot already occupied');
    }

    const typeInfo = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, typeId),
    });

    if (!typeInfo) {
      throw new Error('Building type not found');
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
      throw new Error('Build queue is full (max 1 building at a time)');
    }

    const deps = typeInfo.deps as { typeId: string; level: number }[] | null;
    if (deps && deps.length > 0) {
      for (const dep of deps) {
        const depBuilding = planet.buildings?.find((b: any) => b.typeId === dep.typeId);
        if (!depBuilding || depBuilding.level < dep.level) {
          throw new Error(`Missing dependency: ${dep.typeId} level ${dep.level}`);
        }
      }
    }

    const costs = typeInfo.baseCost as Record<string, number>;
    const resourceCosts = Object.entries(costs).map(([resourceId, amount]) => ({
      resourceId,
      amount,
    }));

    return db.transaction(async (tx) => {
      if (resourceCosts.length > 0) {
        const spendResult = await spendResources(planetId, resourceCosts, tx);
        if (!spendResult.success) {
          throw new Error(spendResult.error);
        }
      }

      const completesAt = new Date(Date.now() + typeInfo.baseTimeSec * 1000);
      const [newBuilding] = await tx.insert(buildings).values({
        planetId,
        typeId,
        level: 1,
        slotIndex,
        queueAction: 'build',
        queueCompletesAt: completesAt,
      }).returning();

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
          { delay: typeInfo.baseTimeSec * 1000 },
        );
        await buildQueue.close();
        await redis.quit();
      } catch {
      }

      return {
        success: true,
        queueItem: {
          id: newBuilding.id,
          completesAt: completesAt.toISOString(),
        }
      };
    });
  }

  async upgrade(userId: string, buildingId: string): Promise<ConstructionStatus> {
    const building = await db.query.buildings.findFirst({
      where: eq(buildings.id, buildingId),
      with: {
        planet: {
          with: {
            system: true
          }
        }
      }
    });

    if (!building || (building.planet as any).system.ownerId !== userId) {
      throw new Error('Building not found or not owned by user');
    }

    if (building.queueAction) {
      throw new Error('Building already in queue');
    }

    const typeInfo = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, building.typeId),
    });

    if (!typeInfo) {
      throw new Error('Building type not found');
    }

    if (building.level >= typeInfo.maxLevel) {
      throw new Error('Maximum level reached');
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
      throw new Error('Build queue is full (max 1 building at a time)');
    }

    const multiplier = Math.pow(2, building.level);
    const costs = typeInfo.baseCost as Record<string, number>;
    const resourceCosts = Object.entries(costs).map(([resourceId, amount]) => ({
      resourceId,
      amount: Math.floor(amount * multiplier),
    }));

    return db.transaction(async (tx) => {
      if (resourceCosts.length > 0) {
        const spendResult = await spendResources(building.planetId, resourceCosts, tx);
        if (!spendResult.success) {
          throw new Error(spendResult.error);
        }
      }

      const buildTime = Math.floor(typeInfo.baseTimeSec * multiplier);
      const completesAt = new Date(Date.now() + buildTime * 1000);

      await tx.update(buildings)
        .set({
          queueAction: 'upgrade',
          queueCompletesAt: completesAt,
        })
        .where(eq(buildings.id, buildingId));

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
          { delay: buildTime * 1000 },
        );
        await buildQueue.close();
        await redis.quit();
      } catch {
      }

      return {
        success: true,
        queueItem: {
          id: buildingId,
          completesAt: completesAt.toISOString(),
        }
      };
    });
  }
}

export const buildingService = new BuildingService();
