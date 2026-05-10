import { db } from '../../db/index.js';
import { buildings, buildingTypes, planets, planetResources, notifications, systems } from '../../db/schema.js';
import { eq, and, sql, lte } from 'drizzle-orm';
import { BuildingType, ConstructionStatus } from '@shared/types/buildings.js';
import { spendResources } from '../resources/transactions.js';
import { applyBuildTimeSeconds, getResearchEffectsForUser } from '../research/effects.js';
import { BUILDING_RESEARCH_GATES } from '../../config/research-unlocks.js';
import { assertResearchRequirement, loadUserResearchLevels } from '../research/gates.js';
import { logger } from '../../lib/logger.js';

type BuildingOutput = {
  resourceId?: string;
  baseRate?: number;
};

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

    const researchGate = BUILDING_RESEARCH_GATES[typeId];
    if (researchGate) {
      const levels = await loadUserResearchLevels(userId, db);
      assertResearchRequirement(levels, researchGate, `Build ${typeId}`);
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

    const researchEffects = await getResearchEffectsForUser(userId, db);

    return db.transaction(async (tx) => {
      if (resourceCosts.length > 0) {
        const spendResult = await spendResources(planetId, resourceCosts, tx);
        if (!spendResult.success) {
          throw new Error(spendResult.error);
        }
      }

      const buildTimeSec = applyBuildTimeSeconds(typeInfo.baseTimeSec, researchEffects);
      const completesAt = new Date(Date.now() + buildTimeSec * 1000);
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
          { delay: buildTimeSec * 1000 },
        );
        await buildQueue.close();
        await redis.quit();
      } catch (err) {
        // Redis/BullMQ is optional in tests/local runs; ignore enqueue failures.
        void err;
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

    const researchEffects = await getResearchEffectsForUser(userId, db);

    return db.transaction(async (tx) => {
      if (resourceCosts.length > 0) {
        const spendResult = await spendResources(building.planetId, resourceCosts, tx);
        if (!spendResult.success) {
          throw new Error(spendResult.error);
        }
      }

      const baseUpgradeTime = Math.floor(typeInfo.baseTimeSec * multiplier);
      const buildTime = applyBuildTimeSeconds(baseUpgradeTime, researchEffects);
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
      } catch (err) {
        // Redis/BullMQ is optional in tests/local runs; ignore enqueue failures.
        void err;
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

  async finalizeBuildingConstruction(tx: any, buildingId: string, options: { skipNotification?: boolean } = {}): Promise<void> {
    const building = await tx.query.buildings.findFirst({
      where: eq(buildings.id, buildingId),
    });

    if (!building || !building.queueAction) return;

    const isBuild = building.queueAction === 'build';
    const newLevel = isBuild ? 1 : building.level + 1;

    await tx
      .update(buildings)
      .set({
        level: newLevel,
        queueAction: null,
        queueCompletesAt: null,
      })
      .where(eq(buildings.id, building.id));

    const bType = await tx.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, building.typeId),
    });

    if (bType?.baseOutput) {
      const output = bType.baseOutput as BuildingOutput;
      if (output.resourceId && typeof output.baseRate === 'number') {
        const totalRate = output.baseRate * newLevel;

        const existing = await tx.query.planetResources.findFirst({
          where: and(
            eq(planetResources.planetId, building.planetId),
            eq(planetResources.resourceId, output.resourceId),
          ),
        });

        if (existing) {
          await tx
            .update(planetResources)
            .set({ regenRate: totalRate.toFixed(4) })
            .where(
              and(
                eq(planetResources.planetId, building.planetId),
                eq(planetResources.resourceId, output.resourceId),
              ),
            );
        }
      }
    }

    if (options.skipNotification) return;

    const planet = await tx.query.planets.findFirst({
      where: eq(planets.id, building.planetId),
    });
    if (planet) {
      const system = await tx.query.systems.findFirst({
        where: eq(systems.id, planet.systemId),
      });
      if (system?.ownerId) {
        const actionLabel = isBuild ? 'built' : `upgraded to level ${newLevel}`;
        await tx.insert(notifications).values({
          userId: system.ownerId,
          type: 'building_done',
          payload: {
            buildingId: building.id,
            typeId: building.typeId,
            planetId: building.planetId,
            planetName: planet.name,
            action: isBuild ? 'build' : 'upgrade',
            level: newLevel,
          },
        });
        logger.info(
          { buildingId: building.id, typeId: building.typeId, action: actionLabel, userId: system.ownerId },
          'Building completion notification created',
        );
      }
    }
  }

  async syncPlanetBuildings(userId: string, planetId: string): Promise<void> {
    const now = new Date();
    const readyBuildings = await db.query.buildings.findMany({
      where: and(
        eq(buildings.planetId, planetId),
        lte(buildings.queueCompletesAt, now),
        sql`${buildings.queueAction} IS NOT NULL`
      ),
      with: {
        planet: {
          with: {
            system: true
          }
        }
      }
    });

    if (readyBuildings.length === 0) return;

    for (const building of readyBuildings) {
      if ((building.planet as any).system.ownerId !== userId) continue;

      await db.transaction(async (tx) => {
        await this.finalizeBuildingConstruction(tx, building.id, { skipNotification: true });
      });
    }
  }
}

export const buildingService = new BuildingService();
