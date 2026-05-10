import { db } from '../../db/index.js';
import {
  buildings,
  buildingTypes,
  planets,
  planetResources,
  notifications,
  systems,
  users,
} from '../../db/schema.js';
import { eq, and, sql, lte, inArray, gte, type InferSelectModel } from 'drizzle-orm';
import { rushDiamondCost, rushRemainingSeconds } from '../../lib/diamonds.js';
import { BuildingType, ConstructionStatus, DemolishStatus } from '@shared/types/buildings.js';
import { spendResources, gainResources } from '../resources/transactions.js';
import { applyBuildTimeSeconds, getResearchEffectsForUser } from '../research/effects.js';
import { BUILDING_RESEARCH_GATES } from '../../config/research-unlocks.js';
import { loadUserResearchLevels } from '../research/gates.js';
import { logger } from '../../lib/logger.js';
import { resolveBuildBlockedReason, formatBuildBlockedMessage } from '@shared/types/building-eligibility.js';
import { BuildingOperationError } from './building-operation-error.js';
import { countUserBuildingsOfType } from './count-user-buildings.js';

type BuildingOutput = {
  resourceId?: string;
  baseRate?: number;
};

type BuildingTypeRow = InferSelectModel<typeof buildingTypes>;

async function upsertProductionRegen(tx: any, planetId: string, resourceId: string): Promise<void> {
  const buildingsOnPlanet = (await tx
    .select({ typeId: buildings.typeId, level: buildings.level })
    .from(buildings)
    .where(eq(buildings.planetId, planetId))) as { typeId: string; level: number }[];

  let totalRate = 0;
  if (buildingsOnPlanet.length > 0) {
    const typeIds = [...new Set(buildingsOnPlanet.map((b) => b.typeId))];
    const typeRows: BuildingTypeRow[] =
      typeIds.length > 0
        ? await tx.select().from(buildingTypes).where(inArray(buildingTypes.id, typeIds))
        : [];
    const typeMap = new Map<string, BuildingTypeRow>(typeRows.map((t) => [t.id, t]));

    for (const b of buildingsOnPlanet) {
      const bt = typeMap.get(b.typeId);
      if (!bt) continue;
      const output = bt.baseOutput as BuildingOutput | Record<string, unknown>;
      const rid = output.resourceId as string | undefined;
      const br = output.baseRate as number | undefined;
      if (rid === resourceId && typeof br === 'number') {
        totalRate += br * b.level;
      }
    }
  }

  const existing = await tx.query.planetResources.findFirst({
    where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
  });

  if (existing) {
    await tx
      .update(planetResources)
      .set({ regenRate: totalRate.toFixed(4) })
      .where(and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)));
  } else if (totalRate > 0) {
    await tx.insert(planetResources).values({
      planetId,
      resourceId,
      amount: '0',
      regenRate: totalRate.toFixed(4),
      lastUpdateAt: new Date(),
    });
  }
}

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

    const researchLevels = await loadUserResearchLevels(userId, db);
    const researchGate = BUILDING_RESEARCH_GATES[typeId];

    let globalCountForType = 0;
    if (typeInfo.maxGlobal != null) {
      globalCountForType = await countUserBuildingsOfType(userId, typeId);
    }

    const planetBuilt =
      planet.buildings?.map((b: any) => ({ typeId: b.typeId as string, level: b.level as number })) ?? [];
    const dependencyBuildings =
      planet.buildings
        ?.filter((b: any) => b.queueAction !== 'build')
        .map((b: any) => ({ typeId: b.typeId as string, level: b.level as number })) ?? [];

    const blocked = resolveBuildBlockedReason({
      typeId,
      deps: (typeInfo.deps ?? []) as { typeId: string; level: number }[],
      maxPerPlanet: typeInfo.maxPerPlanet ?? null,
      maxGlobal: typeInfo.maxGlobal ?? null,
      planetBuildings: planetBuilt,
      dependencyBuildings,
      globalCountForType,
      researchLevels,
      researchGate,
    });

    if (blocked) {
      throw new BuildingOperationError(
        formatBuildBlockedMessage(blocked, 'en'),
        blocked.code,
        blocked.details as Record<string, unknown>,
      );
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

    /**
     * Upgrade cost and time scaling:
     * - Cost multiplier: 1.6 ^ current_level
     * - Time multiplier: 1.8 ^ current_level
     * This provides a steeper curve than the initial 1.5, reaching 24h+ build times around level 11.
     */
    const costMultiplier = Math.pow(1.6, building.level);
    const timeMultiplier = Math.pow(1.8, building.level);
    const costs = typeInfo.baseCost as Record<string, number>;
    const resourceCosts = Object.entries(costs).map(([resourceId, amount]) => ({
      resourceId,
      amount: Math.floor(amount * costMultiplier),
    }));

    const researchEffects = await getResearchEffectsForUser(userId, db);

    return db.transaction(async (tx) => {
      if (resourceCosts.length > 0) {
        const spendResult = await spendResources(building.planetId, resourceCosts, tx);
        if (!spendResult.success) {
          throw new Error(spendResult.error);
        }
      }

      const baseUpgradeTime = Math.floor(typeInfo.baseTimeSec * timeMultiplier);
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
        await upsertProductionRegen(tx, building.planetId, output.resourceId);
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

  async rushQueuedBuilding(
    userId: string,
    buildingId: string,
  ): Promise<{ success: boolean; cost: number; diamondsRemaining: number }> {
    const building = await db.query.buildings.findFirst({
      where: eq(buildings.id, buildingId),
      with: {
        planet: {
          with: {
            system: true,
          },
        },
      },
    });

    if (!building || (building.planet as any).system.ownerId !== userId) {
      throw new Error('Building not found or not owned by user');
    }

    if (!building.queueAction || !building.queueCompletesAt) {
      throw new Error('Building is not in the construction queue');
    }

    const remainingSec = rushRemainingSeconds(building.queueCompletesAt);
    const cost = rushDiamondCost(remainingSec);

    return await db.transaction(async (tx) => {
      if (cost > 0) {
        const rows = await tx
          .update(users)
          .set({ diamonds: sql`${users.diamonds} - ${cost}` })
          .where(and(eq(users.id, userId), gte(users.diamonds, cost)))
          .returning({ diamonds: users.diamonds });

        if (!rows.length) {
          throw new BuildingOperationError('Not enough diamonds', 'insufficient_diamonds', {
            required: cost,
          });
        }
      }

      await this.finalizeBuildingConstruction(tx, buildingId);

      const userAfter = await tx.query.users.findFirst({
        where: eq(users.id, userId),
      });

      return {
        success: true,
        cost,
        diamondsRemaining: userAfter!.diamonds,
      };
    });
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

  async demolish(userId: string, buildingId: string): Promise<DemolishStatus> {
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
      throw new Error('Building is currently in queue');
    }

    const typeInfo = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, building.typeId),
    });

    if (!typeInfo) {
      throw new Error('Building type not found');
    }

    /**
     * Total cost spent on building of level L:
     * baseCost + baseCost * 2^1 + baseCost * 2^2 + ... + baseCost * 2^(L-1)
     * = baseCost * (1 + 2 + 4 + ... + 2^(L-1))
     * = baseCost * (2^L - 1)
     * 
     * Refund is 50% of total spent. Rounding is floor (in favor of bank).
     */
    const baseCosts = typeInfo.baseCost as Record<string, number>;
    const refundChanges: { resourceId: string; amount: number }[] = [];
    const refundMap: Record<string, number> = {};

    for (const [resourceId, amount] of Object.entries(baseCosts)) {
      let totalSpent = 0;
      for (let l = 0; l < building.level; l++) {
        totalSpent += Math.floor(amount * Math.pow(1.6, l));
      }
      const refundAmount = Math.floor(totalSpent * 0.5);
      if (refundAmount > 0) {
        refundChanges.push({ resourceId, amount: refundAmount });
        refundMap[resourceId] = refundAmount;
      }
    }

    await db.transaction(async (tx) => {
      // 1. Give resources back
      if (refundChanges.length > 0) {
        const result = await gainResources(building.planetId, refundChanges, tx);
        if (!result.success) {
          throw new Error(result.error || 'Failed to refund resources');
        }
      }

      // 2. Remove building
      await tx.delete(buildings).where(eq(buildings.id, buildingId));

      // 3. Recalculate production regen for this resource (handles multiple producers / levels)
      if (typeInfo.baseOutput) {
        const output = typeInfo.baseOutput as BuildingOutput;
        if (output.resourceId && typeof output.baseRate === 'number') {
          await upsertProductionRegen(tx, building.planetId, output.resourceId);
        }
      }
    });

    return { success: true, refund: refundMap };
  }
}

export const buildingService = new BuildingService();
