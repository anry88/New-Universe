import { db as defaultDb } from '../../db/index.js';
import { planetResources, planets, resources } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  applyProductionRate,
  applyStorageCap,
  getResearchEffectsForUser,
} from '../research/effects.js';

interface DBRecord {
  resourceId: string;
  amount: string;
  regenRate: string;
  lastUpdateAt: Date;
  storageCap: number;
}

export interface ComputedResource {
  resourceId: string;
  amount: number;
  regenRate: number;
  lastUpdateAt: Date;
  storageCap: number;
}

export async function computeCurrentResources(planetId: string, tx?: any) {
  const database = tx || defaultDb;
  const planetRow = await database.query.planets.findFirst({
    where: eq(planets.id, planetId),
    columns: { id: true },
    with: {
      system: {
        columns: { ownerId: true },
      },
    },
  });
  const ownerId = planetRow?.system?.ownerId || null;
  const researchEffects = ownerId
    ? await getResearchEffectsForUser(ownerId, database)
    : null;

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
    const baseRegenRate = Number(record.regenRate);
    const baseStorageCap = Number(record.storageCap);
    const regenRate = researchEffects ? applyProductionRate(baseRegenRate, researchEffects) : baseRegenRate;
    const storageCap = researchEffects ? applyStorageCap(baseStorageCap, researchEffects) : baseStorageCap;
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

/**
 * Synchronizes planet resources by calculating accruals and persisting them to DB.
 */
export async function syncPlanetResources(planetId: string, tx?: any): Promise<void> {
  const database = tx || defaultDb;
  const computed = await computeCurrentResources(planetId, database);
  const now = new Date();

  for (const r of computed) {
    await database
      .update(planetResources)
      .set({
        amount: r.amount.toFixed(4),
        lastUpdateAt: now,
      })
      .where(
        and(
          eq(planetResources.planetId, planetId),
          eq(planetResources.resourceId, r.resourceId)
        )
      );
  }
}
