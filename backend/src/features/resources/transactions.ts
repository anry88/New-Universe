import { db as defaultDb } from '../../db/index.js';
import { planetResources, resources } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

interface ResourceChange {
  resourceId: string;
  amount: number;
}

interface TransactionResult {
  success: boolean;
  balanceAfter?: Record<string, number>;
  error?: string;
}

export async function spendResources(
  planetId: string,
  costs: ResourceChange[],
  tx?: any
): Promise<TransactionResult> {
  const database = tx || defaultDb;

  return await database.transaction(async (trx) => {
    const resourceIds = costs.map(c => c.resourceId);
    const resourceIdList = resourceIds.map(id => `'${id}'`).join(', ');

    const query = `
      SELECT resource_id, amount 
      FROM planet_resources 
      WHERE planet_id = '${planetId}'::uuid
        AND resource_id IN (${resourceIdList})
      FOR UPDATE`
    ;

    const records = await trx.execute(sql.raw(query));

    const balance: Record<string, number> = {};
    for (const record of records) {
      balance[record.resource_id as string] = Number(record.amount);
    }

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

    const now = new Date();
    for (const cost of costs) {
      await trx
        .update(planetResources)
        .set({ amount: balance[cost.resourceId].toFixed(4), lastUpdateAt: now })
        .where(and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, cost.resourceId)));
    }

    return { success: true, balanceAfter: balance };
  });
}

export async function gainResources(
  planetId: string,
  gains: ResourceChange[],
  tx?: any
): Promise<TransactionResult> {
  const database = tx || defaultDb;

  return await database.transaction(async (trx) => {
    const resourceIds = gains.map(g => g.resourceId);
    const resourceIdList = resourceIds.map(id => `'${id}'`).join(', ');

    const query = `
      SELECT pr.resource_id, pr.amount, r.default_storage_cap
      FROM planet_resources pr
      INNER JOIN resources r ON r.id = pr.resource_id
      WHERE pr.planet_id = '${planetId}'::uuid
        AND pr.resource_id IN (${resourceIdList})
      FOR UPDATE`
    ;

    const records = await trx.execute(sql.raw(query));

    const balance: Record<string, number> = {};
    for (const record of records) {
      balance[record.resource_id as string] = Number(record.amount);
    }

    const now = new Date();
    for (const gain of gains) {
      const current = balance[gain.resourceId] || 0;
      const newAmount = current + gain.amount;
      balance[gain.resourceId] = newAmount;

      await trx
        .update(planetResources)
        .set({ amount: newAmount.toFixed(4), lastUpdateAt: now })
        .where(and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, gain.resourceId)));
    }

    return { success: true, balanceAfter: balance };
  });
}
