import { db } from '../../db/index.js';
import {
  buildings,
  buildingTypes,
  planets,
  planetResources,
  richness,
  notifications,
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
import {
  resolveBuildBlockedReason,
  formatBuildBlockedMessage,
  resolveBuildingProducedResourceIds,
  resolveBuildingProductionRateForResource,
  resolveExtractorSelectionBlockedReason,
  resolvePlanetResourceBlockedReason,
  isSelectableExtractorType,
} from '@shared/types/building-eligibility.js';
import {
  buildingUpgradeResourceCosts,
  buildingUpgradeTimeSeconds,
  COMMAND_CENTER_TYPE_ID,
  mergeResourceCostMaps,
} from '@shared/config/buildingUpgradeEconomy.js';
import { BuildingOperationError } from './building-operation-error.js';
import { countUserBuildingsOfType } from './count-user-buildings.js';
import { BUILDING_TYPE_CATALOG_ROWS } from '../../db/seed/catalog-rows.js';
import { getPlanetSettlementOwnerId, getPlayerPlanetSettlement } from '../colonies/ownership.js';
import {
  syncEnergyResourceRow,
  type PlanetEnergyRequestCache,
} from '../resources/energy.js';
import {
  scheduleBuildingCompletionJob,
  type BuildingCompletionJob,
} from './completion-queue.js';

type BuildingOutput = {
  resourceId?: string;
  baseRate?: number;
};

type BuildingTypeRow = InferSelectModel<typeof buildingTypes>;
type PlanetDeposit = { resourceId: string; value: number };
type BuildingProducerSnapshot = {
  id: string;
  typeId: string;
  level: number;
  queueAction: string | null;
  selectedResourceId: string | null;
};

async function loadPlanetDeposits(tx: any, planetId: string): Promise<PlanetDeposit[]> {
  const richnessRows = (await tx
    .select({ resourceId: richness.resourceId, value: richness.value })
    .from(richness)
    .where(eq(richness.planetId, planetId))) as PlanetDeposit[];

  const deposits = new Map<string, number>();
  for (const row of richnessRows) {
    if (row.value > 0) {
      deposits.set(row.resourceId, row.value);
    }
  }

  const legacyRegenRows = (await tx
    .select({ resourceId: planetResources.resourceId })
    .from(planetResources)
    .where(
      and(
        eq(planetResources.planetId, planetId),
        sql`${planetResources.regenRate} > 0`,
      ),
    )) as { resourceId: string }[];

  for (const row of legacyRegenRows) {
    if (!deposits.has(row.resourceId)) {
      deposits.set(row.resourceId, 1);
    }
  }

  return [...deposits.entries()].map(([resourceId, value]) => ({ resourceId, value }));
}

async function loadPlanetDepositResourceIds(tx: any, planetId: string): Promise<string[]> {
  const deposits = await loadPlanetDeposits(tx, planetId);
  return deposits.map((row) => row.resourceId);
}

function depositLimitsByResourceId(deposits: PlanetDeposit[]): Record<string, number> {
  return Object.fromEntries(deposits.map((row) => [row.resourceId, row.value]));
}

async function loadUsedExtractorCountsByResourceId(
  tx: any,
  planetId: string,
  planetDepositResourceIds: string[],
  options: { excludeBuildingId?: string } = {},
): Promise<Record<string, number>> {
  const buildingsOnPlanet = (await tx
    .select({
      id: buildings.id,
      typeId: buildings.typeId,
      level: buildings.level,
      queueAction: buildings.queueAction,
      selectedResourceId: buildings.selectedResourceId,
    })
    .from(buildings)
    .where(eq(buildings.planetId, planetId))) as BuildingProducerSnapshot[];

  const counts: Record<string, number> = {};
  for (const building of buildingsOnPlanet) {
    if (building.id === options.excludeBuildingId) continue;
    if (building.queueAction === 'destroy') continue;
    if (!isSelectableExtractorType(building.typeId)) continue;

    const producedResourceIds = resolveBuildingProducedResourceIds({
      typeId: building.typeId,
      planetResourceIds: planetDepositResourceIds,
      selectedResourceId: building.selectedResourceId,
    });

    for (const resourceId of producedResourceIds) {
      counts[resourceId] = (counts[resourceId] ?? 0) + 1;
    }
  }

  return counts;
}

async function assertExtractorSelectionAvailable(input: {
  tx: any;
  planetId: string;
  typeId: string;
  selectedResourceId?: string | null;
  excludeBuildingId?: string;
}): Promise<void> {
  const deposits = await loadPlanetDeposits(input.tx, input.planetId);
  const planetDepositResourceIds = deposits.map((row) => row.resourceId);
  if (input.selectedResourceId) {
    await input.tx
      .select({ resourceId: richness.resourceId })
      .from(richness)
      .where(
        and(
          eq(richness.planetId, input.planetId),
          eq(richness.resourceId, input.selectedResourceId),
        ),
      )
      .for('update');
  }

  const usedCounts = await loadUsedExtractorCountsByResourceId(
    input.tx,
    input.planetId,
    planetDepositResourceIds,
    { excludeBuildingId: input.excludeBuildingId },
  );

  const blocked = resolveExtractorSelectionBlockedReason({
    typeId: input.typeId,
    selectedResourceId: input.selectedResourceId,
    planetResourceIds: planetDepositResourceIds,
    depositLimitsByResourceId: depositLimitsByResourceId(deposits),
    usedExtractorCountsByResourceId: usedCounts,
  });

  if (blocked) {
    throw new BuildingOperationError(
      formatBuildBlockedMessage(blocked, 'en'),
      blocked.code,
      blocked.details as Record<string, unknown>,
    );
  }
}

async function recalculateProductionRegenForResources(
  tx: any,
  planetId: string,
  resourceIds: string[],
): Promise<void> {
  const targetResourceIds = [...new Set(resourceIds)].filter(Boolean);
  if (targetResourceIds.length === 0) return;

  const planetDepositResourceIds = await loadPlanetDepositResourceIds(tx, planetId);
  const buildingsOnPlanet = (await tx
    .select({
      typeId: buildings.typeId,
      level: buildings.level,
      queueAction: buildings.queueAction,
      selectedResourceId: buildings.selectedResourceId,
    })
    .from(buildings)
    .where(eq(buildings.planetId, planetId))) as {
      typeId: string;
      level: number;
      queueAction: string | null;
      selectedResourceId: string | null;
    }[];

  const typeIds = [...new Set(buildingsOnPlanet.map((b) => b.typeId))];
  const typeRows: BuildingTypeRow[] =
    typeIds.length > 0
      ? await tx.select().from(buildingTypes).where(inArray(buildingTypes.id, typeIds))
      : [];
  const typeMap = new Map<string, BuildingTypeRow>(typeRows.map((t) => [t.id, t]));

  for (const resourceId of targetResourceIds) {
    let totalRate = 0;

    for (const b of buildingsOnPlanet) {
      if (b.queueAction === 'build' || b.level <= 0) continue;
      const bt = typeMap.get(b.typeId);
      if (!bt) continue;
      const output = bt.baseOutput as BuildingOutput;
      totalRate += resolveBuildingProductionRateForResource({
        typeId: b.typeId,
        baseOutput: output,
        planetResourceIds: planetDepositResourceIds,
        selectedResourceId: b.selectedResourceId,
        resourceId,
      }) * b.level;
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
}

async function recalculateProductionRegenForBuildingType(
  tx: any,
  planetId: string,
  typeInfo: BuildingTypeRow,
): Promise<void> {
  const planetDepositResourceIds = await loadPlanetDepositResourceIds(tx, planetId);
  const output = typeInfo.baseOutput as BuildingOutput | null;
  const affectedResourceIds = resolveBuildingProducedResourceIds({
    typeId: typeInfo.id,
    baseOutput: output,
    planetResourceIds: planetDepositResourceIds,
  });
  await recalculateProductionRegenForResources(tx, planetId, affectedResourceIds);
}

async function loadCommandCenterLevel(tx: any, planetId: string): Promise<number> {
  const commandCenter = await tx.query.buildings.findFirst({
    where: and(
      eq(buildings.planetId, planetId),
      eq(buildings.typeId, COMMAND_CENTER_TYPE_ID),
      sql`${buildings.queueAction} IS DISTINCT FROM 'build'`,
    ),
    orderBy: (table: any, { desc }: any) => [desc(table.level)],
  });
  return commandCenter?.level ?? 0;
}

async function assertUpgradeWithinCommandCenterLevel(input: {
  tx: any;
  planetId: string;
  typeId: string;
  currentLevel: number;
}): Promise<void> {
  if (input.typeId === COMMAND_CENTER_TYPE_ID) return;

  const requiredLevel = input.currentLevel + 1;
  const commandCenterLevel = await loadCommandCenterLevel(input.tx, input.planetId);
  if (requiredLevel <= commandCenterLevel) return;

  const blocked = {
    code: 'building_blocked_command_center_level',
    details: { commandCenterLevel, requiredLevel },
  } as const;
  throw new BuildingOperationError(
    formatBuildBlockedMessage(blocked, 'en'),
    blocked.code,
    blocked.details,
  );
}

export class BuildingService {
  async getBuildingTypes(): Promise<BuildingType[]> {
    const types = await db.query.buildingTypes.findMany();
    const catalogOrder = new Map(BUILDING_TYPE_CATALOG_ROWS.map((row, idx) => [row.id, idx]));
    return [...(types as BuildingType[])].sort((a, b) => {
      const aOrder = catalogOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = catalogOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.id.localeCompare(b.id);
    });
  }

  async build(
    userId: string,
    planetId: string,
    typeId: string,
    slotIndex: number,
    selectedResourceId?: string | null,
  ): Promise<ConstructionStatus> {
    const settlement = await getPlayerPlanetSettlement(userId, planetId);
    const planet = settlement?.planet;

    if (!planet || !settlement.isSettled) {
      throw new Error('Planet not found or no active command center');
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

    const normalizedSelectedResourceId =
      typeof selectedResourceId === 'string' && selectedResourceId.trim().length > 0
        ? selectedResourceId.trim()
        : null;

    if (isSelectableExtractorType(typeId)) {
      await assertExtractorSelectionAvailable({
        tx: db,
        planetId,
        typeId,
        selectedResourceId: normalizedSelectedResourceId,
      });
    }

    const planetResourceBlocked = isSelectableExtractorType(typeId)
      ? null
      : resolvePlanetResourceBlockedReason({
          typeId,
          planetResourceIds: await loadPlanetDepositResourceIds(db, planetId),
        });

    if (planetResourceBlocked) {
      throw new BuildingOperationError(
        formatBuildBlockedMessage(planetResourceBlocked, 'en'),
        planetResourceBlocked.code,
        planetResourceBlocked.details as Record<string, unknown>,
      );
    }

    const costs = typeInfo.baseCost as Record<string, number>;
    const resourceCosts = Object.entries(costs).map(([resourceId, amount]) => ({
      resourceId,
      amount,
    }));

    const researchEffects = await getResearchEffectsForUser(userId, db);

    const result = await db.transaction(async (tx): Promise<{
      response: ConstructionStatus;
      completionJob: BuildingCompletionJob;
    }> => {
      if (isSelectableExtractorType(typeId)) {
        await assertExtractorSelectionAvailable({
          tx,
          planetId,
          typeId,
          selectedResourceId: normalizedSelectedResourceId,
        });
      }

      if (resourceCosts.length > 0) {
        const spendResult = await spendResources(planetId, resourceCosts, tx);
        if (!spendResult.success) {
          throw new BuildingOperationError(
            spendResult.error ?? 'Insufficient resources',
            spendResult.code ?? 'insufficient_resource',
            spendResult.details,
          );
        }
      }

      const buildTimeSec = applyBuildTimeSeconds(typeInfo.baseTimeSec, researchEffects);
      const completesAt = new Date(Date.now() + buildTimeSec * 1000);
      const queueStartedAt = new Date(completesAt.getTime() - buildTimeSec * 1000).toISOString();
      const [newBuilding] = await tx.insert(buildings).values({
        planetId,
        typeId,
        selectedResourceId: isSelectableExtractorType(typeId) ? normalizedSelectedResourceId : null,
        level: 1,
        slotIndex,
        queueAction: 'build',
        queueCompletesAt: completesAt,
      }).returning();

      return {
        response: {
          success: true,
          queueItem: {
            id: newBuilding.id,
            planetId,
            buildingTypeId: typeId,
            level: newBuilding.level,
            queueAction: 'build',
            queueCompletesAt: completesAt.toISOString(),
            completesAt: completesAt.toISOString(),
            queueStartedAt,
            rushCost: rushDiamondCost(rushRemainingSeconds(completesAt)),
            selectedResourceId: newBuilding.selectedResourceId,
            slotIndex: newBuilding.slotIndex,
          },
        },
        completionJob: {
          name: 'complete-build',
          buildingId: newBuilding.id,
          planetId,
          delayMs: buildTimeSec * 1000,
        },
      };
    });

    scheduleBuildingCompletionJob(result.completionJob);
    return result.response;
  }

  async changeExtractorResource(
    userId: string,
    buildingId: string,
    selectedResourceId: string,
  ): Promise<{ success: boolean; buildingId: string; selectedResourceId: string }> {
    const normalizedSelectedResourceId = selectedResourceId.trim();
    if (!normalizedSelectedResourceId) {
      throw new BuildingOperationError(
        'Selected resource is required',
        'building_blocked_resource_selection_required',
        { typeId: 'unknown', acceptedResourceIds: [] },
      );
    }

    const building = await db.query.buildings.findFirst({
      where: eq(buildings.id, buildingId),
    });
    const settlement = building
      ? await getPlayerPlanetSettlement(userId, building.planetId)
      : null;

    if (!building || !settlement?.isSettled) {
      throw new Error('Building not found or not owned by user');
    }

    if (building.queueAction) {
      throw new Error('Building is currently in queue');
    }

    if (!isSelectableExtractorType(building.typeId)) {
      throw new Error('Building does not support resource switching');
    }

    const typeInfo = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, building.typeId),
    });
    if (!typeInfo) {
      throw new Error('Building type not found');
    }

    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(buildings)
        .where(eq(buildings.id, buildingId))
        .for('update');

      if (!locked || locked.queueAction || !isSelectableExtractorType(locked.typeId)) {
        throw new Error('Building cannot switch resources right now');
      }

      const deposits = await loadPlanetDeposits(tx, locked.planetId);
      const planetDepositResourceIds = deposits.map((row) => row.resourceId);
      const output = typeInfo.baseOutput as BuildingOutput | null;
      const oldResourceIds = resolveBuildingProducedResourceIds({
        typeId: locked.typeId,
        baseOutput: output,
        planetResourceIds: planetDepositResourceIds,
        selectedResourceId: locked.selectedResourceId,
      });

      await assertExtractorSelectionAvailable({
        tx,
        planetId: locked.planetId,
        typeId: locked.typeId,
        selectedResourceId: normalizedSelectedResourceId,
        excludeBuildingId: locked.id,
      });

      await tx
        .update(buildings)
        .set({ selectedResourceId: normalizedSelectedResourceId })
        .where(eq(buildings.id, locked.id));

      const newResourceIds = resolveBuildingProducedResourceIds({
        typeId: locked.typeId,
        baseOutput: output,
        planetResourceIds: planetDepositResourceIds,
        selectedResourceId: normalizedSelectedResourceId,
      });

      await recalculateProductionRegenForResources(
        tx,
        locked.planetId,
        [...oldResourceIds, ...newResourceIds],
      );

      return {
        success: true,
        buildingId: locked.id,
        selectedResourceId: normalizedSelectedResourceId,
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

    const settlement = building
      ? await getPlayerPlanetSettlement(userId, building.planetId)
      : null;
    if (!building || !settlement?.isSettled) {
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
      const blocked = {
        code: 'building_blocked_max_level',
        details: { maxLevel: typeInfo.maxLevel },
      } as const;
      throw new BuildingOperationError(
        formatBuildBlockedMessage(blocked, 'en'),
        blocked.code,
        blocked.details,
      );
    }

    if (isSelectableExtractorType(building.typeId)) {
      await assertExtractorSelectionAvailable({
        tx: db,
        planetId: building.planetId,
        typeId: building.typeId,
        selectedResourceId: building.selectedResourceId,
        excludeBuildingId: building.id,
      });
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

    const costs = typeInfo.baseCost as Record<string, number>;
    const resourceCosts = Object.entries(buildingUpgradeResourceCosts({
      typeId: building.typeId,
      baseCost: costs,
      currentLevel: building.level,
    })).map(([resourceId, amount]) => ({
      resourceId,
      amount,
    }));

    const researchEffects = await getResearchEffectsForUser(userId, db);

    const result = await db.transaction(async (tx): Promise<{
      response: ConstructionStatus;
      completionJob: BuildingCompletionJob;
    }> => {
      if (isSelectableExtractorType(building.typeId)) {
        await assertExtractorSelectionAvailable({
          tx,
          planetId: building.planetId,
          typeId: building.typeId,
          selectedResourceId: building.selectedResourceId,
          excludeBuildingId: building.id,
        });
      }

      await assertUpgradeWithinCommandCenterLevel({
        tx,
        planetId: building.planetId,
        typeId: building.typeId,
        currentLevel: building.level,
      });

      if (resourceCosts.length > 0) {
        const spendResult = await spendResources(building.planetId, resourceCosts, tx);
        if (!spendResult.success) {
          throw new BuildingOperationError(
            spendResult.error ?? 'Insufficient resources',
            spendResult.code ?? 'insufficient_resource',
            spendResult.details,
          );
        }
      }

      const baseUpgradeTime = buildingUpgradeTimeSeconds(typeInfo.baseTimeSec, building.level);
      const buildTime = applyBuildTimeSeconds(baseUpgradeTime, researchEffects);
      const completesAt = new Date(Date.now() + buildTime * 1000);
      const queueStartedAt = new Date(completesAt.getTime() - buildTime * 1000).toISOString();

      await tx.update(buildings)
        .set({
          queueAction: 'upgrade',
          queueCompletesAt: completesAt,
        })
        .where(eq(buildings.id, buildingId));

      return {
        response: {
          success: true,
          queueItem: {
            id: buildingId,
            planetId: building.planetId,
            buildingTypeId: building.typeId,
            level: building.level,
            queueAction: 'upgrade',
            queueCompletesAt: completesAt.toISOString(),
            completesAt: completesAt.toISOString(),
            queueStartedAt,
            rushCost: rushDiamondCost(rushRemainingSeconds(completesAt)),
            selectedResourceId: building.selectedResourceId,
            slotIndex: building.slotIndex,
          },
        },
        completionJob: {
          name: 'complete-upgrade',
          buildingId,
          planetId: building.planetId,
          delayMs: buildTime * 1000,
        },
      };
    });

    scheduleBuildingCompletionJob(result.completionJob);
    return result.response;
  }

  async finalizeBuildingConstruction(
    tx: any,
    buildingId: string,
    options: { skipNotification?: boolean; energyCache?: PlanetEnergyRequestCache } = {},
  ): Promise<void> {
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
      await recalculateProductionRegenForBuildingType(tx, building.planetId, bType);
    }
    await syncEnergyResourceRow(building.planetId, tx, options.energyCache);

    if (options.skipNotification) return;

    const planet = await tx.query.planets.findFirst({
      where: eq(planets.id, building.planetId),
    });
    if (planet) {
      const ownerId = await getPlanetSettlementOwnerId(planet.id, tx);
      if (ownerId) {
        const actionLabel = isBuild ? 'built' : `upgraded to level ${newLevel}`;
        await tx.insert(notifications).values({
          userId: ownerId,
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
          { buildingId: building.id, typeId: building.typeId, action: actionLabel, userId: ownerId },
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

    const settlement = building
      ? await getPlayerPlanetSettlement(userId, building.planetId)
      : null;
    if (!building || !settlement?.isSettled) {
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

      await this.finalizeBuildingConstruction(tx, buildingId, { skipNotification: true });

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
    const settlement = await getPlayerPlanetSettlement(userId, planetId);
    if (!settlement?.isSettled) return;

    const now = new Date();
    const readyBuildings = await db.query.buildings.findMany({
      where: and(
        eq(buildings.planetId, planetId),
        lte(buildings.queueCompletesAt, now),
        sql`${buildings.queueAction} IS NOT NULL`
      ),
    });

    for (const building of readyBuildings) {
      await db.transaction(async (tx) => {
        await this.finalizeBuildingConstruction(tx, building.id, { skipNotification: true });
        // If a worker created a pending completion notification before manual sync won the race,
        // silence that stale push so active players do not receive redundant Telegram alerts.
        await tx
          .update(notifications)
          .set({
            pending: false,
            read: true,
          })
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.type, 'building_done'),
              sql`(${notifications.payload} ->> 'buildingId') = ${building.id}`,
              eq(notifications.pending, true),
            ),
          );
      });
    }

    const operatingBuildings = await db.query.buildings.findMany({
      where: and(
        eq(buildings.planetId, planetId),
        sql`${buildings.queueAction} IS NULL`,
      ),
      columns: {
        typeId: true,
      },
    });

    const readyTypeIds = readyBuildings
      .map((building) => building.typeId)
      .filter((id): id is string => typeof id === 'string');
    const operatingTypeIds = operatingBuildings
      .map((building) => building.typeId)
      .filter((id): id is string => typeof id === 'string');
    const typeIds = [...new Set([...readyTypeIds, ...operatingTypeIds])];
    if (typeIds.length === 0) return;

    const buildingTypesRows = await db
      .select()
      .from(buildingTypes)
      .where(inArray(buildingTypes.id, typeIds));
    const typeMap = new Map<string, BuildingTypeRow>(buildingTypesRows.map((type) => [type.id, type]));

    for (const typeId of typeIds) {
      const typeInfo = typeMap.get(typeId);
      if (typeInfo?.baseOutput) {
        await recalculateProductionRegenForBuildingType(db, planetId, typeInfo);
      }
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

    const settlement = building
      ? await getPlayerPlanetSettlement(userId, building.planetId)
      : null;
    if (!building || !settlement?.isSettled) {
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

    /** Refund is 50% of initial build plus completed upgrade spends. */
    const baseCosts = typeInfo.baseCost as Record<string, number>;
    let totalSpentByResource: Record<string, number> = { ...baseCosts };
    for (let currentLevel = 1; currentLevel < building.level; currentLevel++) {
      totalSpentByResource = mergeResourceCostMaps(
        totalSpentByResource,
        buildingUpgradeResourceCosts({
          typeId: building.typeId,
          baseCost: baseCosts,
          currentLevel,
        }),
      );
    }

    const refundChanges: { resourceId: string; amount: number }[] = [];
    const refundMap: Record<string, number> = {};

    for (const [resourceId, totalSpent] of Object.entries(totalSpentByResource)) {
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

      // 3. Recalculate production regen for affected resources (handles multiple producers / levels)
      if (typeInfo.baseOutput) {
        await recalculateProductionRegenForBuildingType(tx, building.planetId, typeInfo);
      }
      await syncEnergyResourceRow(building.planetId, tx);
    });

    return { success: true, refund: refundMap };
  }
}

export const buildingService = new BuildingService();
