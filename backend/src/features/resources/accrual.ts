import { db as defaultDb } from '../../db/index.js';
import { planetResources, resources } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

interface DBRecord {
  resourceId: string;
  amount: string;
  regenRate: string;
  lastUpdateAt: Date;
  storageCap: number;
}

interface ComputedResource {
  resourceId: string;
  amount: number;
  regenRate: number;
  lastUpdateAt: Date;
  storageCap: number;
}

export async function computeCurrentResources(planetId: string, tx?: any) {
  const database = tx || defaultDb;

  const records = await database
    .select({
      resourceId: planetResources.resourceId,
      amount: planetResources.amount,
      regenRate: planetResources.regenRate,
      lastUpdateAt: planetResources.lastUpdateAt,
      storageCap: resources.defaultStorageCap,
    })
    .from(planetResources)
    .innerJoin(resources, eq(resources.id, planetResources.resourceId))
    .where(eq(planetResources.planetId, planetId));

  const now = new Date();

  return records.map((record: DBRecord) => {
    const amount = Number(record.amount);
    const regenRate = Number(record.regenRate);
    const storageCap = Number(record.storageCap);
    const lastUpdateAt = new Date(record.lastUpdateAt);

    const timeDiffMs = now.getTime() - lastUpdateAt.getTime();
    const timeDiffHours = timeDiffMs / 1000 / 3600;
    const accrual = regenRate * timeDiffHours;
    const newAmount = Math.min(amount + accrual, storageCap);

    return {
      resourceId: record.resourceId,
      amount: newAmount,
      regenRate,
      lastUpdateAt,
      storageCap,
    };
  }) as ComputedResource[];
}
