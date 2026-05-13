import { db as defaultDb } from '../../db/index.js';
import {
  expeditions,
  ships,
  shipTypes,
  notifications,
} from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { gainResources, spendResources } from '../resources/transactions.js';
import { applyShipSpeed, getResearchEffectsForUser } from '../research/effects.js';
import { CARGO_TRANSFER_RESEARCH_GATE } from '../../config/research-unlocks.js';
import { assertResearchRequirement, loadUserResearchLevels } from '../research/gates.js';
import type { CargoTransferLoad, CargoTransferRequest } from '@shared/types/cargo.js';
import { getPlayerPlanetSettlement } from '../colonies/ownership.js';
import { env } from '../../lib/env.js';

type CargoTransferResultPayload = {
  deliveryMode?: 'one_way';
  resources?: CargoTransferLoad[];
  loads?: CargoTransferLoad[];
  totalCargo?: number;
  maxCargo?: number;
  distance?: number;
  speed?: number;
  engineFactor?: number;
};

function normalizeCargoLoads(resources: CargoTransferLoad[]): CargoTransferLoad[] {
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error('Resources are missing');
  }

  return resources.map((resource, index) => {
    const resourceId = typeof resource?.resourceId === 'string'
      ? resource.resourceId.trim()
      : '';
    const amount = Number(resource?.amount);

    if (!resourceId) {
      throw new Error(`Cargo load #${index + 1} resourceId is required`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Cargo load #${index + 1} amount must be greater than 0`);
    }

    return { resourceId, amount };
  });
}

function aggregateCargoLoads(loads: CargoTransferLoad[]): CargoTransferLoad[] {
  const totals = new Map<string, number>();
  for (const load of loads) {
    totals.set(load.resourceId, (totals.get(load.resourceId) ?? 0) + load.amount);
  }
  return [...totals.entries()].map(([resourceId, amount]) => ({ resourceId, amount }));
}

function sumCargoLoads(loads: CargoTransferLoad[]): number {
  return loads.reduce((sum, load) => sum + load.amount, 0);
}

/**
 * Service to launch a cargo transfer between two player-owned planets.
 */
export async function launchCargoTransfer(
  userId: string,
  request: CargoTransferRequest,
) {
  if (!request) throw new Error('Request body is missing');
  const { shipId, targetPlanetId, resources } = request;
  const loads = normalizeCargoLoads(resources);
  const reservedResources = aggregateCargoLoads(loads);

  const levels = await loadUserResearchLevels(userId, defaultDb);
  assertResearchRequirement(levels, CARGO_TRANSFER_RESEARCH_GATE, 'Cargo transfer');

  return await defaultDb.transaction(async (tx) => {
    // 1. Validate ship ownership and state
    const shipRows = await tx
      .select({
        id: ships.id,
        ownerId: ships.ownerId,
        status: ships.status,
        locationPlanetId: ships.locationPlanetId,
        typeId: ships.typeId,
        role: shipTypes.role,
        cargoCapacity: shipTypes.cargo,
        speed: shipTypes.speed,
      })
      .from(ships)
      .innerJoin(shipTypes, eq(ships.typeId, shipTypes.id))
      .where(and(eq(ships.id, shipId), eq(ships.ownerId, userId)))
      .limit(1);

    const ship = shipRows[0];
    if (!ship) throw new Error('Ship not found or access denied');
    if (ship.status !== 'idle') throw new Error('Ship is not idle');
    if (!ship.locationPlanetId) throw new Error('Ship is not on a planet');
    if (ship.role !== 'logistics') throw new Error('Ship cannot transfer cargo');

    // 2. Validate settlement ownership for both ends. The capital does not
    // have a `colonies` row, so use the shared settlement helper instead of
    // checking only the colonies table.
    const [originSettlement, targetSettlement] = await Promise.all([
      getPlayerPlanetSettlement(userId, ship.locationPlanetId, tx),
      getPlayerPlanetSettlement(userId, targetPlanetId, tx),
    ]);

    if (!originSettlement) throw new Error('Origin planet not found');
    if (!originSettlement.isSettled) throw new Error('Origin planet is not owned by you');
    if (!targetSettlement) throw new Error('Target planet not found');
    if (!targetSettlement.isSettled) throw new Error('Target planet is not owned by you');
    if (targetSettlement.planet.id === ship.locationPlanetId) throw new Error('Target planet must be different from origin');

    const originSystem = originSettlement.planet.system as { sectorX: number; sectorY: number; sectorZ: number };
    const targetSystem = targetSettlement.planet.system as { sectorX: number; sectorY: number; sectorZ: number };
    const origin = {
      x: Number(originSystem.sectorX),
      y: Number(originSystem.sectorY),
      z: Number(originSystem.sectorZ),
    };
    const target = {
      id: targetSettlement.planet.id,
      x: Number(targetSystem.sectorX),
      y: Number(targetSystem.sectorY),
      z: Number(targetSystem.sectorZ),
    };

    // 4. Validate cargo capacity
    const totalCargo = sumCargoLoads(loads);
    if (totalCargo > ship.cargoCapacity) {
      throw new Error(`Cargo (${totalCargo}) exceeds ship capacity (${ship.cargoCapacity})`);
    }

    // 5. Calculate travel time (ETA)
    const distance = Math.sqrt(
      Math.pow(target.x - origin.x, 2) +
      Math.pow(target.y - origin.y, 2) +
      Math.pow(target.z - origin.z, 2)
    );
    
    const researchEffects = await getResearchEffectsForUser(userId, tx);
    const speed = applyShipSpeed(Number(ship.speed), researchEffects);
    const etaSeconds = Math.max(10, Math.ceil((distance * 60) / speed));
    const eta = new Date(Date.now() + etaSeconds * 1000);

    // 6. Atomic resource reservation on origin
    const spendResult = await spendResources(ship.locationPlanetId, reservedResources, tx);
    if (!spendResult.success) {
      throw new Error(spendResult.error || 'Failed to reserve resources');
    }

    // 7. Create expedition record
    const [expedition] = await tx
      .insert(expeditions)
      .values({
        shipId: ship.id,
        type: 'cargo_transfer',
        originPlanetId: ship.locationPlanetId,
        targetPlanetId: target.id,
        targetX: target.x.toString(),
        targetY: target.y.toString(),
        targetZ: target.z.toString(),
        status: 'in_flight',
        eta,
        result: {
          deliveryMode: 'one_way',
          resources: reservedResources,
          loads,
          totalCargo,
          maxCargo: ship.cargoCapacity,
          distance,
          speed,
          engineFactor: 1,
        },
      })
      .returning();

    // 8. Update ship state
    const cargoJson: Record<string, number> = {};
    for (const r of reservedResources) {
      cargoJson[r.resourceId] = (cargoJson[r.resourceId] || 0) + r.amount;
    }

    await tx
      .update(ships)
      .set({
        status: 'moving',
        cargoJson,
      })
      .where(eq(ships.id, ship.id));

    // 9. Enqueue arrival (BullMQ)
    try {
      const { Queue: BullQueue } = await import('bullmq');
      const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
      const redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      const expeditionQueue = new BullQueue('expeditions', { connection: redis });
      await expeditionQueue.add('arrive_cargo', { expeditionId: expedition.id, shipId: ship.id }, { delay: etaSeconds * 1000 });
      await expeditionQueue.close();
      await redis.quit();
    } catch (_err) { void _err; }

    return { success: true, expedition };
  });
}

export async function completeCargoTransfer(
  expedition: typeof expeditions.$inferSelect,
  shipId: string,
  tx: any,
  options: { skipNotifications?: boolean } = {},
): Promise<boolean> {
  if (expedition.type !== 'cargo_transfer') {
    throw new Error(`Invalid expedition type for cargo transfer: ${expedition.type}`);
  }
  if (!expedition.targetPlanetId) {
    throw new Error('Cargo transfer is missing targetPlanetId');
  }

  const result = (expedition.result ?? {}) as CargoTransferResultPayload;
  const resultLoads = result.resources?.length ? result.resources : result.loads ?? [];
  const deliveryResources = aggregateCargoLoads(
    normalizeCargoLoads(resultLoads),
  );

  const completedResult = {
    ...result,
    deliveryMode: 'one_way' as const,
    resources: deliveryResources,
  };

  const [claimedExpedition] = await tx
    .update(expeditions)
    .set({
      status: 'completed',
      returnedAt: new Date(),
      result: completedResult,
    })
    .where(
      and(
        eq(expeditions.id, expedition.id),
        inArray(expeditions.status, ['in_flight', 'returning']),
      ),
    )
    .returning();
  if (!claimedExpedition) {
    return false;
  }

  const gainResult = await gainResources(expedition.targetPlanetId, deliveryResources, tx);
  if (!gainResult.success) {
    throw new Error(gainResult.error || 'Failed to apply resources to target planet');
  }

  await tx
    .update(ships)
    .set({
      status: 'idle',
      locationPlanetId: expedition.targetPlanetId,
      cargoJson: {},
    })
    .where(eq(ships.id, shipId));

  const [ship] = await tx
    .select()
    .from(ships)
    .where(eq(ships.id, shipId))
    .limit(1);

  if (ship && !options.skipNotifications) {
    await tx.insert(notifications).values({
      userId: ship.ownerId,
      type: 'cargo_transfer_delivered',
      payload: {
        expeditionId: expedition.id,
        shipId,
        targetPlanetId: expedition.targetPlanetId,
        resources: deliveryResources,
      },
    });
  }

  return true;
}
