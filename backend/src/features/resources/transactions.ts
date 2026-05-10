import { db as defaultDb } from '../../db/index.js';
import { planetResources } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { syncPlanetResources } from './accrual.js';

interface ResourceChange {
  resourceId: string;
  amount: number;
}

interface TransactionResult {
  success: boolean;
  balanceAfter?: Record<string, number>;
  error?: string;
}

async function spendResourcesInner(trx: any, planetId: string, costs: ResourceChange[]): Promise<TransactionResult> {
    // 1. Sync resources to current time so we check against the actual accrued balance
    await syncPlanetResources(planetId, trx);

    const resourceIds = costs.map(c => c.resourceId);
    
    // 2. Select for update to lock the rows
    const records = await trx
      .select({
        resourceId: planetResources.resourceId,
        amount: planetResources.amount,
      })
      .from(planetResources)
      .where(
        and(
          eq(planetResources.planetId, planetId),
          inArray(planetResources.resourceId, resourceIds)
        )
      )
      .for('update');

    const balance: Record<string, number> = {};
    for (const record of records) {
      balance[record.resourceId] = Number(record.amount);
    }

    // 3. Perform the check
    for (const cost of costs) {
      const current = balance[cost.resourceId] || 0;
      if (current < cost.amount) {
        return {
          success: false,
          error: `not enough ${cost.resourceId}`,
        };
      }
      balance[cost.resourceId] = current - cost.amount;
    }

    // 4. Update the DB
    const now = new Date();
    for (const cost of costs) {
      await trx
        .update(planetResources)
        .set({ 
          amount: balance[cost.resourceId].toFixed(4), 
          lastUpdateAt: now 
        })
        .where(
          and(
            eq(planetResources.planetId, planetId), 
            eq(planetResources.resourceId, cost.resourceId)
          )
        );
    }

    return { success: true, balanceAfter: balance };
}

export async function spendResources(
  planetId: string,
  costs: ResourceChange[],
  outerTx?: any,
): Promise<TransactionResult> {
  if (outerTx) {
    return spendResourcesInner(outerTx, planetId, costs);
  }
  return await defaultDb.transaction(async (trx: any) => spendResourcesInner(trx, planetId, costs));
}

async function gainResourcesInner(trx: any, planetId: string, gains: ResourceChange[]): Promise<TransactionResult> {
    // 1. Sync resources first to avoid overwriting uncollected accruals
    await syncPlanetResources(planetId, trx);

    const resourceIds = gains.map(g => g.resourceId);

    // 2. Select for update
    const records = await trx
      .select({
        resourceId: planetResources.resourceId,
        amount: planetResources.amount,
      })
      .from(planetResources)
      .where(
        and(
          eq(planetResources.planetId, planetId),
          inArray(planetResources.resourceId, resourceIds)
        )
      )
      .for('update');

    const balance: Record<string, number> = {};
    for (const record of records) {
      balance[record.resourceId] = Number(record.amount);
    }

    // 3. Apply gains
    const now = new Date();
    for (const gain of gains) {
      const current = balance[gain.resourceId] || 0;
      const newAmount = current + gain.amount;
      balance[gain.resourceId] = newAmount;

      await trx
        .update(planetResources)
        .set({ 
          amount: newAmount.toFixed(4), 
          lastUpdateAt: now 
        })
        .where(
          and(
            eq(planetResources.planetId, planetId), 
            eq(planetResources.resourceId, gain.resourceId)
          )
        );
    }

    return { success: true, balanceAfter: balance };
}

export async function gainResources(
  planetId: string,
  gains: ResourceChange[],
  outerTx?: any,
): Promise<TransactionResult> {
  if (outerTx) {
    return gainResourcesInner(outerTx, planetId, gains);
  }
  return await defaultDb.transaction(async (trx: any) => gainResourcesInner(trx, planetId, gains));
}
