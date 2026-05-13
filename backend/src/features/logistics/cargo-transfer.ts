import { db as defaultDb } from '../../db/index.js';
import {
  expeditions,
  planets,
  ships,
  shipTypes,
  notifications,
  discoveredSystems,
} from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { gainResources, spendResources } from '../resources/transactions.js';
import { applyShipSpeed, getResearchEffectsForUser } from '../research/effects.js';
import { CARGO_TRANSFER_RESEARCH_GATE } from '../../config/research-unlocks.js';
import { assertResearchRequirement, loadUserResearchLevels } from '../research/gates.js';
import type {
  CargoTransferLoad,
  CargoTransferRequest,
  CargoTransferRouteMode,
  CargoTransferRoutePreview,
} from '@shared/types/cargo.js';
import {
  getPlayerPlanetSettlement,
  type PlayerPlanetSettlement,
} from '../colonies/ownership.js';
import {
  calculateExpeditionEtaSeconds,
  calculateExpeditionRequiredFuel,
  calculateSectorRouteDistance,
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting.js';
import { systemMapPlanetDistanceLy } from '@shared/format/systemMapLayout.js';
import { getJumpGateState } from '../jump-gate/service.js';
import { env } from '../../lib/env.js';

type CargoTransferResultPayload = {
  routeMode?: CargoTransferRouteMode;
  deliveryMode?: 'one_way';
  resources?: CargoTransferLoad[];
  loads?: CargoTransferLoad[];
  totalCargo?: number;
  maxCargo?: number;
  fuelRequired?: number;
  jumpFuelRequired?: number;
  distance?: number;
  requestedDistance?: number;
  speed?: number;
  engineFactor?: number;
  etaSeconds?: number;
  eta?: string;
  originSystemId?: string;
  targetSystemId?: string;
};

type CargoTransferShip = {
  id: string;
  ownerId: string;
  status: string;
  locationPlanetId: string | null;
  typeId: string;
  role: string;
  cargoCapacity: number;
  speed: string;
  fuelConsumption: string;
};

type CargoTransferPlan = {
  ship: CargoTransferShip;
  originSettlement: PlayerPlanetSettlement;
  targetSettlement: PlayerPlanetSettlement;
  routeMode: CargoTransferRouteMode;
  loads: CargoTransferLoad[];
  reservedResources: CargoTransferLoad[];
  preview: CargoTransferRoutePreview;
  eta: Date;
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

function systemForSettlement(settlement: PlayerPlanetSettlement) {
  return settlement.planet.system as {
    id: string;
    ownerId: string | null;
    isHome: boolean;
    sectorX: number;
    sectorY: number;
    sectorZ: number;
    seed: number;
  };
}

async function assertKnownJumpGateSettlementSystem(
  userId: string,
  settlement: PlayerPlanetSettlement,
  label: 'Origin' | 'Target',
  database: any,
) {
  const system = systemForSettlement(settlement);

  if (system.isHome === true && system.ownerId === userId) {
    return;
  }

  if (system.isHome || system.ownerId !== null) {
    throw new Error(`${label} system is not a public Jump Gate target`);
  }

  const knownSystem = await database.query.discoveredSystems.findFirst({
    where: and(
      eq(discoveredSystems.userId, userId),
      eq(discoveredSystems.systemId, system.id),
    ),
  });

  if (!knownSystem) {
    throw new Error(`${label} common system is not a known Jump Gate destination`);
  }
}

async function buildCargoTransferPlan(
  userId: string,
  request: CargoTransferRequest,
  database: any,
): Promise<CargoTransferPlan> {
  if (!request) throw new Error('Request body is missing');
  const { shipId, targetPlanetId, resources } = request;
  if (!shipId) throw new Error('shipId is required');
  if (!targetPlanetId) throw new Error('targetPlanetId is required');

  const requestedRouteMode = request.routeMode ?? 'standard';
  if (!['standard', 'jump_gate'].includes(requestedRouteMode)) {
    throw new Error('Cargo routeMode must be standard or jump_gate');
  }
  const routeMode = requestedRouteMode as CargoTransferRouteMode;
  const loads = normalizeCargoLoads(resources);
  const reservedResources = aggregateCargoLoads(loads);

  const shipRows = await database
    .select({
      id: ships.id,
      ownerId: ships.ownerId,
      status: ships.status,
      locationPlanetId: ships.locationPlanetId,
      typeId: ships.typeId,
      role: shipTypes.role,
      cargoCapacity: shipTypes.cargo,
      speed: shipTypes.speed,
      fuelConsumption: shipTypes.fuelConsumption,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(ships.typeId, shipTypes.id))
    .where(and(eq(ships.id, shipId), eq(ships.ownerId, userId)))
    .limit(1);

  const ship = shipRows[0] as CargoTransferShip | undefined;
  if (!ship) throw new Error('Ship not found or access denied');
  if (ship.status !== 'idle') throw new Error('Ship is not idle');
  if (!ship.locationPlanetId) throw new Error('Ship is not on a planet');
  if (ship.role !== 'logistics') throw new Error('Ship cannot transfer cargo');

  const [originSettlement, targetSettlement] = await Promise.all([
    getPlayerPlanetSettlement(userId, ship.locationPlanetId, database),
    getPlayerPlanetSettlement(userId, targetPlanetId, database),
  ]);

  if (!originSettlement) throw new Error('Origin planet not found');
  if (!originSettlement.isSettled) throw new Error('Origin planet is not owned by you');
  if (!targetSettlement) throw new Error('Target planet not found');
  if (!targetSettlement.isSettled) throw new Error('Target planet is not owned by you');
  if (targetSettlement.planet.id === ship.locationPlanetId) throw new Error('Target planet must be different from origin');

  const levels = await loadUserResearchLevels(userId, database);
  assertResearchRequirement(levels, CARGO_TRANSFER_RESEARCH_GATE, 'Cargo transfer');

  const originSystem = systemForSettlement(originSettlement);
  const targetSystem = systemForSettlement(targetSettlement);
  const interSystemTransfer = originSettlement.planet.systemId !== targetSettlement.planet.systemId;
  const useJumpGateRoute = routeMode === 'jump_gate';
  if (useJumpGateRoute && !interSystemTransfer) {
    throw new Error('Jump Gate cargo route requires a different target system');
  }
  if (useJumpGateRoute) {
    const gateState = await getJumpGateState(userId, { database });
    if (!gateState.unlocked) {
      throw new Error(
        gateState.lockedReason?.code === 'jump_drive_required'
          ? 'Jump Drive research level 1 required'
          : 'Jump Gate is locked',
      );
    }
    if (gateState.calibration.status === 'calibrating') {
      throw new Error('Jump Gate calibration is still in progress');
    }

    await Promise.all([
      assertKnownJumpGateSettlementSystem(userId, originSettlement, 'Origin', database),
      assertKnownJumpGateSettlementSystem(userId, targetSettlement, 'Target', database),
    ]);
  }

  const totalCargo = sumCargoLoads(loads);
  if (totalCargo > ship.cargoCapacity) {
    throw new Error(`Cargo (${totalCargo}) exceeds ship capacity (${ship.cargoCapacity})`);
  }

  let requestedDistance: number;
  if (interSystemTransfer) {
    requestedDistance = calculateSectorRouteDistance(
      { x: Number(originSystem.sectorX), y: Number(originSystem.sectorY) },
      { x: Number(targetSystem.sectorX), y: Number(targetSystem.sectorY) },
    );
  } else {
    const systemPlanets = await database.query.planets.findMany({
      where: eq(planets.systemId, originSettlement.planet.systemId),
    });
    requestedDistance =
      systemMapPlanetDistanceLy(
        systemPlanets,
        Number(originSystem.seed),
        originSettlement.planet.id,
        targetSettlement.planet.id,
      ) ?? 0;
  }
  const travelDistance = Math.max(1, requestedDistance);
  const fuelRequired = calculateExpeditionRequiredFuel(
    travelDistance,
    Number(ship.fuelConsumption),
    false,
  );
  const jumpFuelRequired = useJumpGateRoute ? JUMP_GATE_JUMP_FUEL_COST : 0;
  const researchEffects = await getResearchEffectsForUser(userId, database);
  const speed = applyShipSpeed(Number(ship.speed), researchEffects);
  const engineFactor = 1;
  const etaSeconds = Math.max(
    10,
    calculateExpeditionEtaSeconds(travelDistance, speed, engineFactor),
  );
  const eta = new Date(Date.now() + etaSeconds * 1000);

  return {
    ship,
    originSettlement,
    targetSettlement,
    routeMode,
    loads,
    reservedResources,
    eta,
    preview: {
      routeMode,
      deliveryMode: 'one_way',
      resources: reservedResources,
      loads,
      totalCargo,
      maxCargo: ship.cargoCapacity,
      fuelRequired,
      jumpFuelRequired,
      distance: travelDistance,
      requestedDistance,
      speed,
      engineFactor,
      etaSeconds,
      eta: eta.toISOString(),
      originSystemId: originSystem.id,
      targetSystemId: targetSystem.id,
    },
  };
}

export async function previewCargoTransfer(
  userId: string,
  request: CargoTransferRequest,
) {
  const plan = await buildCargoTransferPlan(userId, request, defaultDb);
  return {
    success: true as const,
    preview: plan.preview,
  };
}

/**
 * Service to launch a cargo transfer between two player-owned planets.
 */
export async function launchCargoTransfer(
  userId: string,
  request: CargoTransferRequest,
) {
  return await defaultDb.transaction(async (tx) => {
    const plan = await buildCargoTransferPlan(userId, request, tx);

    const transferCosts = [
      ...plan.reservedResources,
      { resourceId: 'fuel', amount: plan.preview.fuelRequired },
    ];
    if (plan.preview.jumpFuelRequired > 0) {
      transferCosts.push({
        resourceId: JUMP_FUEL_RESOURCE_ID,
        amount: plan.preview.jumpFuelRequired,
      });
    }
    const spendResult = await spendResources(plan.ship.locationPlanetId!, transferCosts, tx);
    if (!spendResult.success) {
      throw new Error(spendResult.error || 'Failed to reserve resources');
    }

    const targetSystem = systemForSettlement(plan.targetSettlement);

    const [expedition] = await tx
      .insert(expeditions)
      .values({
        shipId: plan.ship.id,
        type: 'cargo_transfer',
        originPlanetId: plan.ship.locationPlanetId!,
        targetPlanetId: plan.targetSettlement.planet.id,
        targetX: targetSystem.sectorX.toString(),
        targetY: targetSystem.sectorY.toString(),
        targetZ: targetSystem.sectorZ.toString(),
        status: 'in_flight',
        eta: plan.eta,
        result: plan.preview,
      })
      .returning();

    const cargoJson: Record<string, number> = {};
    for (const r of plan.reservedResources) {
      cargoJson[r.resourceId] = (cargoJson[r.resourceId] || 0) + r.amount;
    }

    await tx
      .update(ships)
      .set({
        status: 'moving',
        cargoJson,
      })
      .where(eq(ships.id, plan.ship.id));

    try {
      const { Queue: BullQueue } = await import('bullmq');
      const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
      const redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      const expeditionQueue = new BullQueue('expeditions', { connection: redis });
      await expeditionQueue.add('arrive_cargo', { expeditionId: expedition.id, shipId: plan.ship.id }, { delay: plan.preview.etaSeconds * 1000 });
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
