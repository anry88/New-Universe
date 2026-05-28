import { db as defaultDb } from '../../db/index.js';
import { planetResources, planets, productionOrders, resources } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import {
  applyProductionRate,
  applyStorageCap,
  type ResearchEffects,
  type ResearchEffectsRequestCache,
  getResearchEffectsForUser,
} from '../research/effects.js';
import {
  ENERGY_RESOURCE_ID,
  resolvePlanetEnergyStateFromSnapshot,
  type EnergyResourceRow,
  type PlanetEnergyBuildingRow,
  type PlanetEnergyInput,
  type ResolvedPlanetEnergyState,
} from './energy.js';

export interface PlanetResourceRecord {
  planetId?: string;
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

export interface PlanetResourceSnapshot {
  planet: PlanetEnergyInput | null;
  resourceRows: PlanetResourceRecord[];
  energyState: ResolvedPlanetEnergyState;
  researchEffects: ResearchEffects | null;
  now: Date;
}

function buildingStorageCapForPlanet(planet: Pick<PlanetEnergyInput, 'buildings'> | null | undefined): number {
  let buildingStorageCap = 0;
  for (const building of planet?.buildings ?? []) {
    if (
      !building.type?.baseOutput ||
      building.queueAction === 'build' ||
      building.queueAction === 'destroy'
    ) {
      continue;
    }
    const output = building.type.baseOutput as Record<string, unknown>;
    if (typeof output.cap === 'number') {
      buildingStorageCap += output.cap * building.level;
    }
  }
  return buildingStorageCap;
}

export function computeCurrentResourcesFromSnapshot(snapshot: PlanetResourceSnapshot): ComputedResource[] {
  const buildingStorageCap = buildingStorageCapForPlanet(snapshot.planet);
  const { energyState, researchEffects, now } = snapshot;

  return snapshot.resourceRows.map((record) => {
    const amount = Number(record.amount);
    const baseRegenRate = Number(record.regenRate);
    const isEnergy = record.resourceId === ENERGY_RESOURCE_ID;
    const baseStorageCap = isEnergy
      ? energyState.capacity
      : Number(record.storageCap) + buildingStorageCap;

    const poweredRegenRate =
      energyState.shortage && baseRegenRate > 0 && !isEnergy ? 0 : baseRegenRate;
    const regenRate = isEnergy
      ? energyState.netRate
      : researchEffects ? applyProductionRate(poweredRegenRate, researchEffects) : poweredRegenRate;
    const storageCap = isEnergy
      ? baseStorageCap
      : researchEffects ? applyStorageCap(baseStorageCap, researchEffects) : baseStorageCap;
    const lastUpdateAt = new Date(record.lastUpdateAt);

    const timeDiffMs = Math.max(0, now.getTime() - lastUpdateAt.getTime());
    const timeDiffHours = timeDiffMs / 1000 / 3600;
    const accrual = isEnergy ? 0 : regenRate * timeDiffHours;

    let newAmount: number;
    if (isEnergy) {
      newAmount = energyState.stored;
    } else if (amount >= storageCap) {
      // Already at or over capacity: no production happens, but we DON'T cap down existing resources.
      newAmount = amount;
    } else {
      // Below capacity: accrue up to the cap.
      newAmount = Math.min(amount + accrual, storageCap);
    }

    return {
      resourceId: record.resourceId,
      amount: newAmount,
      regenRate,
      lastUpdateAt,
      storageCap,
    };
  });
}

export async function loadPlanetResourceSnapshot(
  planetId: string,
  database: any = defaultDb,
  options: {
    now?: Date;
    researchEffects?: ResearchEffects | null;
    researchEffectsCache?: ResearchEffectsRequestCache;
  } = {},
): Promise<PlanetResourceSnapshot> {
  const now = options.now ?? new Date();
  const planetRow = await database.query.planets.findFirst({
    where: eq(planets.id, planetId),
    with: {
      system: {
        columns: { ownerId: true },
      },
      buildings: {
        with: {
          type: true,
        },
      },
    },
  });

  const records: PlanetResourceRecord[] = await database
    .select({
      planetId: planetResources.planetId,
      resourceId: planetResources.resourceId,
      amount: planetResources.amount,
      regenRate: planetResources.regenRate,
      lastUpdateAt: planetResources.lastUpdateAt,
      storageCap: resources.defaultStorageCap,
    })
    .from(planetResources)
    .innerJoin(resources, eq(resources.id, planetResources.resourceId))
    .where(eq(planetResources.planetId, planetId));

  const ownerId = planetRow?.system?.ownerId || null;
  const researchEffects = options.researchEffects !== undefined
    ? options.researchEffects
    : ownerId
      ? await getResearchEffectsForUser(ownerId, database, options.researchEffectsCache)
      : null;
  const energyRow = (records.find((record) => record.resourceId === ENERGY_RESOURCE_ID) ?? null) as EnergyResourceRow;
  const activeProductionOrders = database.query?.productionOrders?.findMany
    ? await database.query.productionOrders.findMany({
        where: and(
          eq(productionOrders.planetId, planetId),
          inArray(productionOrders.status, ['queued', 'paused']),
        ),
        columns: {
          buildingId: true,
          status: true,
        },
      })
    : [];

  const planet = planetRow
    ? {
        ...planetRow,
        buildings: (planetRow.buildings ?? []) as PlanetEnergyBuildingRow[],
      }
    : null;
  const energyState = resolvePlanetEnergyStateFromSnapshot(
    planet,
    energyRow ?? null,
    {
      now,
      effects: researchEffects,
      activeProductionOrders,
    },
  );

  return {
    planet,
    resourceRows: records,
    energyState,
    researchEffects,
    now,
  };
}

export async function computeCurrentResources(planetId: string, tx?: any) {
  const database = tx || defaultDb;
  const snapshot = await loadPlanetResourceSnapshot(planetId, database);
  return computeCurrentResourcesFromSnapshot(snapshot);
}

/**
 * Synchronizes planet resources by calculating accruals and persisting them to DB.
 */
export async function syncPlanetResources(
  planetId: string,
  tx?: any,
  options: { resourceIds?: string[] } = {},
): Promise<void> {
  const database = tx || defaultDb;
  const computed = await computeCurrentResources(planetId, database);
  const targetResourceIds = options.resourceIds
    ? new Set(options.resourceIds)
    : null;
  const now = new Date();

  for (const r of computed) {
    if (targetResourceIds && !targetResourceIds.has(r.resourceId)) continue;
    await database
      .update(planetResources)
      .set({
        amount: r.amount.toFixed(4),
        ...(r.resourceId === ENERGY_RESOURCE_ID ? { regenRate: r.regenRate.toFixed(4) } : {}),
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
