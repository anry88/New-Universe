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
import {
  buildSystemMapLayouts,
  systemMapJumpGatePoint,
  systemMapPlanetDistanceLy,
  systemMapPointDistanceLy,
} from '@shared/format/systemMapLayout.js';
import { getJumpGateState } from '../jump-gate/service.js';
import {
  scheduleCargoRouteCompletionJob,
  type CargoRouteCompletionJob,
} from './completion-queue.js';

type CargoTransferResultPayload = {
  routeMode?: CargoTransferRouteMode;
  deliveryMode?: 'one_way';
  resources?: CargoTransferLoad[];
  loads?: CargoTransferLoad[];
  totalCargo?: number;
  maxCargo?: number;
  fuelRequired?: number;
  jumpFuelRequired?: number;
  fuelLoaded?: number;
  jumpFuelLoaded?: number;
  distance?: number;
  requestedDistance?: number;
  originGateDistance?: number;
  targetGateDistance?: number;
  speed?: number;
  engineFactor?: number;
  etaSeconds?: number;
  eta?: string;
  originSystemId?: string;
  targetSystemId?: string;
  targetPlanetName?: string;
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
  fuel: string;
  jumpFuel: string;
  fuelCapacity: number;
  jumpFuelCapacity: number;
};

type CargoTransferPlan = {
  ship: CargoTransferShip;
  originSettlement: PlayerPlanetSettlement;
  targetSettlement: PlayerPlanetSettlement;
  routeMode: CargoTransferRouteMode;
  loads: CargoTransferLoad[];
  reservedResources: CargoTransferLoad[];
  preview: CargoTransferRoutePreview;
  fuelToLoadFromPlanet: number;
  jumpFuelToLoadFromPlanet: number;
  remainingFuel: number;
  remainingJumpFuel: number;
  eta: Date;
};

function normalizeCargoLoads(resources: CargoTransferLoad[]): CargoTransferLoad[] {
  if (!Array.isArray(resources)) {
    throw new Error('Resources are missing');
  }
  if (resources.length === 0) return [];

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

async function distanceBetweenSystemGateAndPlanet(
  database: any,
  systemId: string,
  systemSeed: number,
  planetId: string,
): Promise<number | null> {
  const systemPlanets = await database.query.planets.findMany({
    where: eq(planets.systemId, systemId),
  });
  const planetLayout = buildSystemMapLayouts(
    systemPlanets,
    Number(systemSeed),
  ).find((layout) => layout.id === planetId);
  if (!planetLayout) return null;

  return systemMapPointDistanceLy(systemMapJumpGatePoint(), planetLayout);
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
  const { shipId, targetPlanetId, resources = [] } = request;
  if (!shipId) throw new Error('shipId is required');
  if (!targetPlanetId) throw new Error('targetPlanetId is required');

  const requestedRouteMode = request.routeMode ?? 'standard';
  if (!['standard', 'jump_gate'].includes(requestedRouteMode)) {
    throw new Error('Cargo routeMode must be standard or jump_gate');
  }
  const routeMode = requestedRouteMode as CargoTransferRouteMode;
  const fuelLoaded = Number(request.fuelLoaded ?? 0);
  const jumpFuelLoaded = Number(request.jumpFuelLoaded ?? 0);
  if (!Number.isFinite(fuelLoaded) || fuelLoaded < 0) {
    throw new Error('Cargo fuelLoaded must be a non-negative number');
  }
  if (!Number.isFinite(jumpFuelLoaded) || jumpFuelLoaded < 0) {
    throw new Error('Cargo jumpFuelLoaded must be a non-negative number');
  }
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
      fuel: ships.fuel,
      jumpFuel: ships.jumpFuel,
      fuelCapacity: shipTypes.fuelCapacity,
      jumpFuelCapacity: shipTypes.jumpFuelCapacity,
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
  let originGateDistance: number | undefined;
  let targetGateDistance: number | undefined;
  if (useJumpGateRoute) {
    const [originGate, targetGate] = await Promise.all([
      distanceBetweenSystemGateAndPlanet(
        database,
        originSystem.id,
        Number(originSystem.seed),
        originSettlement.planet.id,
      ),
      distanceBetweenSystemGateAndPlanet(
        database,
        targetSystem.id,
        Number(targetSystem.seed),
        targetSettlement.planet.id,
      ),
    ]);
    if (originGate === null || targetGate === null) {
      throw new Error('Unable to calculate Jump Gate cargo route');
    }
    originGateDistance = originGate;
    targetGateDistance = targetGate;
    requestedDistance = originGate + targetGate;
  } else if (interSystemTransfer) {
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
  const currentFuel = Number(ship.fuel);
  const currentJumpFuel = Number(ship.jumpFuel);
  if (fuelRequired > ship.fuelCapacity) {
    throw new Error(
      `Ship fuel tank capacity (${ship.fuelCapacity}) is insufficient for this cargo route (required ${fuelRequired})`,
    );
  }
  if (jumpFuelRequired > ship.jumpFuelCapacity) {
    throw new Error(
      `Ship jump fuel tank capacity (${ship.jumpFuelCapacity}) is insufficient for this cargo route (required ${jumpFuelRequired})`,
    );
  }

  const targetFuelInTank = Math.min(
    ship.fuelCapacity,
    Math.max(fuelRequired, currentFuel + fuelLoaded),
  );
  const targetJumpFuelInTank = Math.min(
    ship.jumpFuelCapacity,
    Math.max(jumpFuelRequired, currentJumpFuel + jumpFuelLoaded),
  );
  if (targetFuelInTank < fuelRequired) {
    throw new Error('not enough fuel');
  }
  if (targetJumpFuelInTank < jumpFuelRequired) {
    throw new Error('not enough jump fuel');
  }
  const fuelToLoadFromPlanet = Math.max(0, targetFuelInTank - currentFuel);
  const jumpFuelToLoadFromPlanet = Math.max(0, targetJumpFuelInTank - currentJumpFuel);
  const remainingFuel = targetFuelInTank - fuelRequired;
  const remainingJumpFuel = targetJumpFuelInTank - jumpFuelRequired;
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
      fuelLoaded: fuelToLoadFromPlanet,
      jumpFuelLoaded: jumpFuelToLoadFromPlanet,
      distance: travelDistance,
      requestedDistance,
      originGateDistance,
      targetGateDistance,
      speed,
      engineFactor,
      etaSeconds,
      eta: eta.toISOString(),
      originSystemId: originSystem.id,
      targetSystemId: targetSystem.id,
      targetPlanetName: targetSettlement.planet.name,
    },
    fuelToLoadFromPlanet,
    jumpFuelToLoadFromPlanet,
    remainingFuel,
    remainingJumpFuel,
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
  const result = await defaultDb.transaction(async (tx): Promise<{
    success: true;
    expedition: typeof expeditions.$inferSelect;
    completionJob: CargoRouteCompletionJob;
  }> => {
    const plan = await buildCargoTransferPlan(userId, request, tx);

    const transferCosts = [...plan.reservedResources];
    if (plan.fuelToLoadFromPlanet > 0) {
      transferCosts.push({ resourceId: 'fuel', amount: plan.fuelToLoadFromPlanet });
    }
    if (plan.jumpFuelToLoadFromPlanet > 0) {
      transferCosts.push({
        resourceId: JUMP_FUEL_RESOURCE_ID,
        amount: plan.jumpFuelToLoadFromPlanet,
      });
    }
    if (transferCosts.length > 0) {
      const spendResult = await spendResources(plan.ship.locationPlanetId!, transferCosts, tx);
      if (!spendResult.success) {
        throw new Error(spendResult.error || 'Failed to reserve resources');
      }
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
        fuel: plan.remainingFuel.toFixed(2),
        jumpFuel: plan.remainingJumpFuel.toFixed(2),
        cargoJson,
      })
      .where(eq(ships.id, plan.ship.id));

    return {
      success: true,
      expedition,
      completionJob: {
        name: 'arrive_cargo',
        expeditionId: expedition.id,
        shipId: plan.ship.id,
        delayMs: plan.preview.etaSeconds * 1000,
      },
    };
  });

  const { completionJob, ...response } = result;
  scheduleCargoRouteCompletionJob(completionJob);
  return response;
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

  if (deliveryResources.length > 0) {
    const gainResult = await gainResources(expedition.targetPlanetId, deliveryResources, tx);
    if (!gainResult.success) {
      throw new Error(gainResult.error || 'Failed to apply resources to target planet');
    }
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
        targetPlanetName: claimedExpedition.result &&
          typeof claimedExpedition.result === 'object' &&
          'targetPlanetName' in claimedExpedition.result
          ? (claimedExpedition.result as Record<string, unknown>).targetPlanetName
          : undefined,
        resources: deliveryResources,
      },
    });
  }

  return true;
}
