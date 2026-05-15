import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { PRODUCTION_RECIPES, findProductionRecipe, recipesForBuildingType } from '@shared/config/productionRecipes.js';
import type {
  ProductionOrder,
  ProductionPreviewResponse,
  ProductionRecipeSummary,
  ResourceAmount,
} from '@shared/types/production.js';
import { db as defaultDb } from '../../db/index.js';
import { buildings, buildingTypes, planetResources, productionOrders, resources } from '../../db/schema.js';
import {
  applyBuildTimeSeconds,
  applyEnergyRequirement,
  applyEnergyGeneration,
  applyStorageCap,
  getResearchEffectsForUser,
  type ResearchEffects,
} from '../research/effects.js';
import { getPlayerPlanetSettlement } from '../colonies/ownership.js';
import { spendResources, gainResources } from './transactions.js';
import {
  ENERGY_RESOURCE_ID,
  isEnergyFreePlanet,
  PROCESS_ENERGY_CONSUMER_TYPES,
  resolveEnergyOutputCapacity,
  resolvePlanetEnergyState,
  STORED_ENERGY_PROCESS_TYPES,
  syncEnergyResourceRow,
} from './energy.js';

const RESOURCE_SCALE = 10000;

export class ProductionOperationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function roundResourceAmount(value: number): number {
  return Math.ceil(value * RESOURCE_SCALE) / RESOURCE_SCALE;
}

function normalizeQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return Number.NaN;
  return roundResourceAmount(quantity);
}

function recipeSummary(recipe: (typeof PRODUCTION_RECIPES)[number]): ProductionRecipeSummary {
  return {
    id: recipe.id,
    buildingTypeId: recipe.buildingTypeId,
    name: recipe.name,
    description: recipe.description,
    output: recipe.output,
    inputs: recipe.inputs,
    baseDurationSec: recipe.baseDurationSec,
  };
}

function materialEfficiencyMultiplier(level: number, effects: ResearchEffects): number {
  const buildingEfficiency = 1 + Math.max(0, level - 1) * 0.05;
  const researchEfficiency = Math.max(1, effects.resourceProductionMultiplier);
  return Math.max(0.55, 1 / (buildingEfficiency * researchEfficiency));
}

function durationForQuantity(baseDurationSec: number, quantity: number, level: number, effects: ResearchEffects): number {
  const levelSpeed = 1 + Math.max(0, level - 1) * 0.08;
  const baseSeconds = Math.max(1, Math.ceil((baseDurationSec * quantity) / levelSpeed));
  return applyBuildTimeSeconds(baseSeconds, effects);
}

function productionEnergyPerHour(input: {
  recipeOutputResourceId: string;
  buildingTypeId: string;
  buildingLevel: number;
  energyConsumption: number;
  effects: ResearchEffects;
}): number {
  if (input.recipeOutputResourceId === ENERGY_RESOURCE_ID || STORED_ENERGY_PROCESS_TYPES.has(input.buildingTypeId)) return 0;
  if (!PROCESS_ENERGY_CONSUMER_TYPES.has(input.buildingTypeId)) return 0;
  return roundResourceAmount(
    applyEnergyRequirement(
      Math.max(0, input.energyConsumption) * Math.max(1, input.buildingLevel),
      input.effects,
    ),
  );
}

function mapOrder(row: typeof productionOrders.$inferSelect, energyPerHour?: number): ProductionOrder {
  return {
    id: row.id,
    userId: row.userId,
    planetId: row.planetId,
    buildingId: row.buildingId,
    recipeId: row.recipeId,
    quantity: Number(row.quantity),
    status: row.status,
    inputs: row.inputs,
    outputs: row.outputs,
    startedAt: row.startedAt.toISOString(),
    completesAt: row.completesAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    energyPerHour,
  };
}

export class ProductionService {
  listRecipes(): ProductionRecipeSummary[] {
    return PRODUCTION_RECIPES.map(recipeSummary);
  }

  async preview(
    userId: string,
    input: { planetId: string; buildingId: string; recipeId: string; quantity: number },
    database: any = defaultDb,
  ): Promise<ProductionPreviewResponse> {
    const quantity = normalizeQuantity(input.quantity);
    const recipe = findProductionRecipe(input.recipeId);
    const effects = await getResearchEffectsForUser(userId, database);

    const baseResponse = (patch: Partial<ProductionPreviewResponse>): ProductionPreviewResponse => ({
      recipeId: input.recipeId,
      buildingId: input.buildingId,
      planetId: input.planetId,
      quantity: Number.isFinite(quantity) ? quantity : input.quantity,
      output: { resourceId: recipe?.output.resourceId ?? 'iron', amount: 0 },
      inputs: [],
      durationSec: 0,
      completesAt: new Date().toISOString(),
      energyPerHour: 0,
      canStart: false,
      ...patch,
    });

    if (!recipe) {
      return baseResponse({
        blockedReason: {
          code: 'production_recipe_not_found',
          message: { ru: 'Рецепт не найден.', en: 'Recipe not found.' },
          details: { recipeId: input.recipeId },
        },
      });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return baseResponse({
        output: { resourceId: recipe.output.resourceId, amount: 0 },
        blockedReason: {
          code: 'production_invalid_quantity',
          message: { ru: 'Количество должно быть больше нуля.', en: 'Quantity must be greater than zero.' },
        },
      });
    }

    const settlement = await getPlayerPlanetSettlement(userId, input.planetId, database);
    const building = await database.query.buildings.findFirst({
      where: and(
        eq(buildings.id, input.buildingId),
        eq(buildings.planetId, input.planetId),
      ),
    });

    if (!settlement?.isSettled || !building || building.queueAction === 'build' || building.typeId !== recipe.buildingTypeId) {
      return baseResponse({
        output: { resourceId: recipe.output.resourceId, amount: 0 },
        blockedReason: {
          code: 'production_building_required',
          message: {
            ru: 'Для этого рецепта нужно действующее производственное здание.',
            en: 'This recipe requires an operational production building.',
          },
          details: { requiredTypeId: recipe.buildingTypeId },
        },
      });
    }

    const inputMultiplier = materialEfficiencyMultiplier(building.level, effects);
    const recipeInputs = recipe.inputs.map((change) => ({
      resourceId: change.resourceId,
      amount: roundResourceAmount(change.amount * quantity * inputMultiplier),
    }));
    const baseOutputAmount = recipe.output.amount * quantity;
    const output = {
      resourceId: recipe.output.resourceId,
      amount: roundResourceAmount(
        recipe.output.resourceId === ENERGY_RESOURCE_ID
          ? applyEnergyGeneration(baseOutputAmount, effects)
          : baseOutputAmount,
      ),
    };
    const durationSec = durationForQuantity(recipe.baseDurationSec, quantity, building.level, effects);
    const completesAt = new Date(Date.now() + durationSec * 1000).toISOString();
    const buildingType = await database.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, building.typeId),
    });
    const energyPerHour = isEnergyFreePlanet(settlement.planet)
      ? 0
      : productionEnergyPerHour({
          recipeOutputResourceId: recipe.output.resourceId,
          buildingTypeId: building.typeId,
          buildingLevel: building.level,
          energyConsumption: Number(buildingType?.energyConsumption ?? 0),
          effects,
        });
    const inputs = recipeInputs;

    const currentRows = await database
      .select({
        resourceId: planetResources.resourceId,
        amount: planetResources.amount,
      })
      .from(planetResources)
      .where(
        and(
          eq(planetResources.planetId, input.planetId),
          inArray(planetResources.resourceId, inputs.map((row) => row.resourceId)),
        ),
      );
    const balance = new Map<string, number>(
      currentRows.map((row: { resourceId: string; amount: string }) => [row.resourceId, Number(row.amount)]),
    );
    const missing = inputs.find((change) => (balance.get(change.resourceId) ?? 0) < change.amount);
    if (missing) {
      return baseResponse({
        output,
        inputs,
        durationSec,
        completesAt,
        energyPerHour,
        blockedReason: {
          code: 'production_insufficient_resources',
          message: { ru: `Недостаточно ресурса ${missing.resourceId}.`, en: `Not enough ${missing.resourceId}.` },
          details: {
            resourceId: missing.resourceId,
            required: missing.amount,
            available: balance.get(missing.resourceId) ?? 0,
          },
        },
      });
    }

    if (energyPerHour > 0) {
      const energyState = await resolvePlanetEnergyState(input.planetId, database);
      const netAfterStart = energyState.produced - energyState.consumed - energyPerHour;
      if (energyState.stored <= 0 && netAfterStart < 0) {
        return baseResponse({
          output,
          inputs,
          durationSec,
          completesAt,
          energyPerHour,
          blockedReason: {
            code: 'production_insufficient_energy',
            message: {
              ru: 'Недостаточно доступной энергии для запуска процесса.',
              en: 'Not enough available energy to start this process.',
            },
            details: {
              energyPerHour,
              stored: energyState.stored,
              netAfterStart,
            },
          },
        });
      }
    }

    const capacity = await this.resolveOutputCapacity(input.planetId, output.resourceId, effects, database);
    if (capacity.currentAmount + output.amount > capacity.storageCap) {
      return baseResponse({
        output,
        inputs,
        durationSec,
        completesAt,
        energyPerHour,
        blockedReason: {
          code: 'production_output_capacity',
          message: { ru: 'Недостаточно места на складе для результата.', en: 'Not enough storage capacity for the output.' },
          details: {
            resourceId: output.resourceId,
            amount: output.amount,
            currentAmount: capacity.currentAmount,
            storageCap: capacity.storageCap,
          },
        },
      });
    }

    return baseResponse({
      output,
      inputs,
      durationSec,
      completesAt,
      energyPerHour,
      canStart: true,
      blockedReason: undefined,
    });
  }

  async start(
    userId: string,
    input: { planetId: string; buildingId: string; recipeId: string; quantity: number },
  ): Promise<ProductionOrder> {
    return defaultDb.transaction(async (tx) => {
      const preview = await this.preview(userId, input, tx);
      if (!preview.canStart || preview.blockedReason) {
        throw new ProductionOperationError(
          preview.blockedReason?.message.en ?? 'Production cannot start',
          400,
          preview.blockedReason?.code ?? 'production_blocked',
          preview.blockedReason?.details ?? {},
        );
      }

      const spendResult = await spendResources(input.planetId, preview.inputs, tx);
      if (!spendResult.success) {
        throw new ProductionOperationError(spendResult.error ?? 'Not enough resources', 400, 'production_insufficient_resources');
      }

      await this.ensureResourceRows(input.planetId, [preview.output], tx);
      const startedAt = new Date();
      const completesAt = new Date(startedAt.getTime() + preview.durationSec * 1000);
      const [order] = await tx.insert(productionOrders).values({
        userId,
        planetId: input.planetId,
        buildingId: input.buildingId,
        recipeId: input.recipeId,
        quantity: preview.quantity.toFixed(4),
        inputs: preview.inputs,
        outputs: [preview.output],
        status: 'queued',
        startedAt,
        completesAt,
      }).returning();

      await syncEnergyResourceRow(input.planetId, tx);

      return mapOrder(order, preview.energyPerHour);
    });
  }

  async listOrders(userId: string, planetId?: string): Promise<ProductionOrder[]> {
    const conditions = planetId
      ? and(eq(productionOrders.userId, userId), eq(productionOrders.planetId, planetId))
      : eq(productionOrders.userId, userId);
    const rows = await defaultDb.query.productionOrders.findMany({
      where: conditions,
      orderBy: (orders, { desc }) => [desc(orders.startedAt)],
    });
    return rows.map((row) => mapOrder(row));
  }

  private async isAnyOutputAtStorageCap(
    planetId: string,
    outputs: ResourceAmount[],
    effects: ResearchEffects,
    database: any,
  ): Promise<boolean> {
    for (const output of outputs) {
      const capacity = await this.resolveOutputCapacity(planetId, output.resourceId, effects, database);
      if (capacity.currentAmount >= capacity.storageCap) {
        return true;
      }
    }
    return false;
  }

  private async syncPausedOrders(
    options: { userId?: string; planetId?: string } = {},
    database: any = defaultDb,
  ): Promise<void> {
    const conditions = [inArray(productionOrders.status, ['queued', 'paused'])];
    if (options.userId) conditions.push(eq(productionOrders.userId, options.userId));
    if (options.planetId) conditions.push(eq(productionOrders.planetId, options.planetId));

    const activeOrders = await database.query.productionOrders.findMany({
      where: and(...conditions),
      orderBy: (orders: any, { asc }: any) => [asc(orders.startedAt)],
    });

    for (const order of activeOrders) {
      await database.transaction(async (tx: any) => {
        const [locked] = await tx
          .select()
          .from(productionOrders)
          .where(
            and(
              eq(productionOrders.id, order.id),
              inArray(productionOrders.status, ['queued', 'paused']),
            ),
          )
          .for('update');
        if (!locked) return;

        const now = new Date();
        const [energyState, effects] = await Promise.all([
          resolvePlanetEnergyState(locked.planetId, tx),
          getResearchEffectsForUser(locked.userId, tx),
        ]);
        const buildingEnergyState = locked.buildingId ? energyState.buildingStates[locked.buildingId] : undefined;
        const outputAtCap = await this.isAnyOutputAtStorageCap(locked.planetId, locked.outputs, effects, tx);

        if (locked.status === 'queued' && (buildingEnergyState?.disabled || outputAtCap)) {
          await tx
            .update(productionOrders)
            .set({
              status: 'paused',
              pausedAt: now,
              completesAt:
                locked.completesAt.getTime() <= now.getTime()
                  ? new Date(now.getTime() + 30_000)
                  : locked.completesAt,
            })
            .where(eq(productionOrders.id, locked.id));
          await syncEnergyResourceRow(locked.planetId, tx);
          return;
        }

        if (
          locked.status === 'paused' &&
          !energyState.shortage &&
          (energyState.stored > 0 || energyState.netRate > 0) &&
          !outputAtCap
        ) {
          const pausedAt = locked.pausedAt ?? now;
          const pausedMs = Math.max(0, now.getTime() - pausedAt.getTime());
          const shiftedCompletesAt = new Date(
            Math.max(locked.completesAt.getTime() + pausedMs, now.getTime() + 1000),
          );
          await tx
            .update(productionOrders)
            .set({
              status: 'queued',
              pausedAt: null,
              completesAt: shiftedCompletesAt,
            })
            .where(eq(productionOrders.id, locked.id));
          await syncEnergyResourceRow(locked.planetId, tx);
        }
      });
    }
  }

  async processDueOrders(options: { userId?: string; planetId?: string } = {}, database: any = defaultDb): Promise<number> {
    await this.syncPausedOrders(options, database);

    const now = new Date();
    const conditions = [
      eq(productionOrders.status, 'queued'),
      lte(productionOrders.completesAt, now),
    ];
    if (options.userId) conditions.push(eq(productionOrders.userId, options.userId));
    if (options.planetId) conditions.push(eq(productionOrders.planetId, options.planetId));

    const dueOrders = await database.query.productionOrders.findMany({
      where: and(...conditions),
      orderBy: (orders: any, { asc }: any) => [asc(orders.completesAt)],
    });
    let completed = 0;

    for (const order of dueOrders) {
      await database.transaction(async (tx: any) => {
        const [locked] = await tx
          .select()
          .from(productionOrders)
          .where(
            and(
              eq(productionOrders.id, order.id),
              eq(productionOrders.status, 'queued'),
              lte(productionOrders.completesAt, now),
            ),
          )
          .for('update');
        if (!locked) return;

        await this.ensureResourceRows(locked.planetId, locked.outputs, tx);
        const gainResult = await gainResources(locked.planetId, locked.outputs, tx);
        if (!gainResult.success) {
          throw new ProductionOperationError(gainResult.error ?? 'Failed to apply production output', 500, 'production_complete_failed');
        }

        await tx
          .update(productionOrders)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(productionOrders.id, locked.id));
        await syncEnergyResourceRow(locked.planetId, tx);
        completed += 1;
      });
    }

    return completed;
  }

  async recipesForBuilding(userId: string, buildingId: string, planetId: string): Promise<ProductionRecipeSummary[]> {
    const settlement = await getPlayerPlanetSettlement(userId, planetId);
    if (!settlement?.isSettled) return [];
    const building = await defaultDb.query.buildings.findFirst({
      where: and(eq(buildings.id, buildingId), eq(buildings.planetId, planetId)),
    });
    if (!building || building.queueAction === 'build') return [];
    return recipesForBuildingType(building.typeId).map(recipeSummary);
  }

  private async ensureResourceRows(planetId: string, changes: ResourceAmount[], database: any): Promise<void> {
    for (const change of changes) {
      await database
        .insert(planetResources)
        .values({
          planetId,
          resourceId: change.resourceId,
          amount: '0',
          regenRate: '0',
          lastUpdateAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }

  private async resolveOutputCapacity(
    planetId: string,
    resourceId: string,
    effects: ResearchEffects,
    database: any,
  ): Promise<{ currentAmount: number; storageCap: number }> {
    if (resourceId === ENERGY_RESOURCE_ID) {
      return resolveEnergyOutputCapacity(planetId, database);
    }

    const [resourceRow, existingRow] = await Promise.all([
      database.query.resources.findFirst({ where: eq(resources.id, resourceId) }),
      database.query.planetResources.findFirst({
        where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
      }),
    ]);

    const storageRows = await database
      .select({
        level: buildings.level,
        baseOutput: buildingTypes.baseOutput,
      })
      .from(buildings)
      .innerJoin(buildingTypes, eq(buildingTypes.id, buildings.typeId))
      .where(
        and(
          eq(buildings.planetId, planetId),
          eq(buildings.typeId, 'storage'),
          sql`${buildings.queueAction} IS NULL`,
        ),
      );
    const storageBonus = storageRows.reduce((sum: number, row: { level: number; baseOutput: Record<string, unknown> }) => {
      const cap = typeof row.baseOutput?.cap === 'number' ? row.baseOutput.cap : 0;
      return sum + cap * row.level;
    }, 0);

    return {
      currentAmount: Number(existingRow?.amount ?? 0),
      storageCap: applyStorageCap(Number(resourceRow?.defaultStorageCap ?? 0) + storageBonus, effects),
    };
  }
}

export const productionService = new ProductionService();
