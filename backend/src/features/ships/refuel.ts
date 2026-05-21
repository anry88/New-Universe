import { and, eq, inArray, isNull } from "drizzle-orm";
import { db as defaultDb } from "../../db/index.js";
import {
  discoveredSystems,
  expeditions,
  planetResources,
  planets,
  ships,
  shipTypes,
  systems,
} from "../../db/schema.js";
import { getPlayerPlanetSettlement } from "../colonies/ownership.js";
import { spendResources } from "../resources/transactions.js";
import {
  applyShipSpeed,
  getResearchEffectsForUser,
} from "../research/effects.js";
import {
  calculateJumpGateJumpFuelRequired,
  calculateExpeditionEtaSeconds,
  calculateExpeditionRequiredFuel,
  calculateSectorRouteDistance,
  type ExpeditionRouteMode,
  JUMP_FUEL_RESOURCE_ID,
} from "@shared/config/expeditionRouting.js";
import {
  buildSystemMapLayouts,
  systemMapJumpGatePoint,
  systemMapPlanetDistanceLy,
  systemMapPointDistanceLy,
  type SystemMapPoint,
} from "@shared/format/systemMapLayout.js";
import {
  type RefuelErrorCode,
  type RefuelErrorDetails,
  type RefuelReplenishRequest,
  type RefuelReplenishResponse,
  type RefuelRequest,
  type RefuelResponse,
  formatRefuelErrorMessage,
} from "@shared/types/refuel.js";
import { getJumpGateState } from "../jump-gate/service.js";

export interface RefuelResult<
  TData = RefuelResponse | RefuelReplenishResponse,
> {
  success: boolean;
  status: number;
  data?: TData;
  error?: string;
  code?: RefuelErrorCode;
  details?: Omit<RefuelErrorDetails, "code">;
}

type Tx = any;

type RefuelShipRow = {
  id: string;
  ownerId: string;
  typeId: string;
  status: string;
  locationPlanetId: string | null;
  fuel: string;
  jumpFuel: string;
  refuelFuel: string;
  refuelJumpFuel: string;
  speed: string;
  fuelConsumption: string;
  fuelCapacity: number;
  jumpFuelCapacity: number;
  refuelFuelCapacity: number;
  refuelJumpFuelCapacity: number;
  originSystemId: string | null;
  originSystemSeed: number | null;
  originSectorX: number | null;
  originSectorY: number | null;
  originSectorZ: number | null;
};

type PlanetRouteTarget = {
  id: string;
  name: string;
  systemId: string;
  systemSeed: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
};

type RefuelRouteTarget = {
  planet: PlanetRouteTarget | null;
  name: string;
  systemId: string;
  systemSeed: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  systemPoint: SystemMapPoint | null;
};

type RoutePlan = {
  routeMode: ExpeditionRouteMode;
  destinationSystemId: string | null;
  target: RefuelRouteTarget;
  requestedDistance: number;
  distance: number;
  fuelRequired: number;
  jumpFuelRequired: number;
  originGateDistance: number | null;
  targetGateDistance: number | null;
  speed: number;
  engineFactor: number;
  etaSeconds: number;
  eta: Date;
};

type ShipOriginRow = {
  planetId: string;
  originSystemId: string;
  originSystemSeed: number;
  originSectorX: number;
  originSectorY: number;
  originSectorZ: number;
};

function isRefuelFailure(value: unknown): value is RefuelResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    (value as RefuelResult).success === false
  );
}

function refuelFailure(
  status: number,
  details: RefuelErrorDetails,
): RefuelResult {
  const { code, ...rest } = details;
  return {
    success: false,
    status,
    error: formatRefuelErrorMessage(details, "en"),
    code,
    details: rest,
  };
}

function pointFromUnknown(value: unknown): SystemMapPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  return typeof point.x === "number" && typeof point.y === "number"
    ? { x: point.x, y: point.y }
    : null;
}

function pointsApproximatelyEqual(
  left: SystemMapPoint | null,
  right: SystemMapPoint | null,
): boolean {
  return Boolean(
    left &&
    right &&
    Math.abs(left.x - right.x) < 0.01 &&
    Math.abs(left.y - right.y) < 0.01,
  );
}

function shipSummary(ship: {
  id: string;
  fuel: string;
  jumpFuel: string;
  refuelFuel?: string;
  refuelJumpFuel?: string;
}) {
  return {
    id: ship.id,
    fuel: ship.fuel,
    jumpFuel: ship.jumpFuel,
    refuelFuel: ship.refuelFuel ?? "0.00",
    refuelJumpFuel: ship.refuelJumpFuel ?? "0.00",
  };
}

function queueItem(expedition: typeof expeditions.$inferSelect) {
  return {
    id: expedition.id,
    completesAt: expedition.eta.toISOString(),
  };
}

function expeditionSummary(expedition: typeof expeditions.$inferSelect) {
  return {
    id: expedition.id,
    eta: expedition.eta.toISOString(),
    targetPlanetId: expedition.targetPlanetId,
  };
}

async function loadOwnedShipsForUpdate(
  tx: Tx,
  userId: string,
  ids: string[],
): Promise<RefuelShipRow[]> {
  const rows = (await tx
    .select({
      id: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
      status: ships.status,
      locationPlanetId: ships.locationPlanetId,
      fuel: ships.fuel,
      jumpFuel: ships.jumpFuel,
      refuelFuel: ships.refuelFuel,
      refuelJumpFuel: ships.refuelJumpFuel,
      speed: shipTypes.speed,
      fuelConsumption: shipTypes.fuelConsumption,
      fuelCapacity: shipTypes.fuelCapacity,
      jumpFuelCapacity: shipTypes.jumpFuelCapacity,
      refuelFuelCapacity: shipTypes.refuelFuelCapacity,
      refuelJumpFuelCapacity: shipTypes.refuelJumpFuelCapacity,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .where(and(eq(ships.ownerId, userId), inArray(ships.id, ids)))
    .orderBy(ships.id)
    .for("update")) as Array<
    Omit<
      RefuelShipRow,
      | "originSystemId"
      | "originSystemSeed"
      | "originSectorX"
      | "originSectorY"
      | "originSectorZ"
    >
  >;

  const locationPlanetIds = rows
    .map((ship) => ship.locationPlanetId)
    .filter((planetId): planetId is string => Boolean(planetId));
  const originRows =
    locationPlanetIds.length > 0
      ? ((await tx
          .select({
            planetId: planets.id,
            originSystemId: systems.id,
            originSystemSeed: systems.seed,
            originSectorX: systems.sectorX,
            originSectorY: systems.sectorY,
            originSectorZ: systems.sectorZ,
          })
          .from(planets)
          .innerJoin(systems, eq(systems.id, planets.systemId))
          .where(inArray(planets.id, locationPlanetIds))) as ShipOriginRow[])
      : [];
  const originByPlanetId = new Map(
    originRows.map((row) => [row.planetId, row]),
  );

  return rows.map((ship) => {
    const origin = ship.locationPlanetId
      ? originByPlanetId.get(ship.locationPlanetId)
      : null;
    return {
      ...ship,
      originSystemId: origin?.originSystemId ?? null,
      originSystemSeed: origin?.originSystemSeed ?? null,
      originSectorX: origin?.originSectorX ?? null,
      originSectorY: origin?.originSectorY ?? null,
      originSectorZ: origin?.originSectorZ ?? null,
    };
  }) as RefuelShipRow[];
}

async function loadPlanetRouteTarget(
  tx: Tx,
  planetId: string,
): Promise<PlanetRouteTarget | null> {
  const rows = await tx
    .select({
      id: planets.id,
      name: planets.name,
      systemId: planets.systemId,
      systemSeed: systems.seed,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
    })
    .from(planets)
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(eq(planets.id, planetId))
    .limit(1);

  return rows[0] ?? null;
}

function planetRefuelRouteTarget(planet: PlanetRouteTarget): RefuelRouteTarget {
  return {
    planet,
    name: planet.name,
    systemId: planet.systemId,
    systemSeed: planet.systemSeed,
    sectorX: planet.sectorX,
    sectorY: planet.sectorY,
    sectorZ: planet.sectorZ,
    systemPoint: null,
  };
}

async function loadStationedShipRouteTarget(
  tx: Tx,
  shipId: string,
): Promise<RefuelRouteTarget | null> {
  const expedition = await tx.query.expeditions.findFirst({
    where: and(
      eq(expeditions.shipId, shipId),
      eq(expeditions.status, "stationed"),
    ),
  });
  if (!expedition) return null;

  const result =
    expedition.result && typeof expedition.result === "object"
      ? (expedition.result as Record<string, unknown>)
      : null;
  const destinationSystemId =
    result && typeof result.destinationSystemId === "string"
      ? result.destinationSystemId
      : null;
  const systemPoint = pointFromUnknown(result?.targetSystemPoint);
  if (!destinationSystemId || !systemPoint) return null;

  const system = await tx.query.systems.findFirst({
    where: eq(systems.id, destinationSystemId),
  });
  if (!system) return null;

  return {
    planet: null,
    name: "Stationed point",
    systemId: system.id,
    systemSeed: Number(system.seed),
    sectorX: Number(system.sectorX),
    sectorY: Number(system.sectorY),
    sectorZ: Number(system.sectorZ),
    systemPoint,
  };
}

async function distanceBetweenSystemGateAndPlanet(
  tx: Tx,
  systemId: string,
  systemSeed: number,
  planetId: string,
): Promise<number | null> {
  const systemPlanets = await tx.query.planets.findMany({
    where: eq(planets.systemId, systemId),
  });
  const planetLayout = buildSystemMapLayouts(
    systemPlanets,
    Number(systemSeed),
  ).find((layout) => layout.id === planetId);
  if (!planetLayout) return null;

  return systemMapPointDistanceLy(systemMapJumpGatePoint(), planetLayout);
}

async function buildRoutePlan(
  userId: string,
  source: RefuelShipRow,
  target: RefuelRouteTarget,
  tx: Tx,
  routeMode: ExpeditionRouteMode = "local",
  destinationSystemId?: string | null,
): Promise<RoutePlan | RefuelResult> {
  if (routeMode !== "local" && routeMode !== "jump_gate") {
    return refuelFailure(400, { code: "refuel_invalid_route_mode" });
  }

  if (
    !source.locationPlanetId ||
    !source.originSystemId ||
    source.originSystemSeed === null ||
    source.originSectorX === null ||
    source.originSectorY === null ||
    source.originSectorZ === null
  ) {
    return refuelFailure(400, { code: "refuel_source_not_on_planet" });
  }

  let requestedDistance = 0;
  let resolvedDestinationSystemId: string | null = null;
  let originGateDistance: number | null = null;
  let targetGateDistance: number | null = null;
  let jumpFuelRequired = 0;

  if (routeMode === "jump_gate") {
    if (!destinationSystemId) {
      return refuelFailure(400, { code: "refuel_destination_required" });
    }

    const gateState = await getJumpGateState(userId, { database: tx });
    if (!gateState.unlocked) {
      return refuelFailure(400, {
        code:
          gateState.lockedReason?.code === "jump_drive_required"
            ? "refuel_jump_drive_required"
            : "refuel_jump_gate_locked",
      });
    }

    if (gateState.calibration.status === "calibrating") {
      return refuelFailure(400, { code: "refuel_jump_gate_calibrating" });
    }

    const knownDestination = await tx.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, userId),
        eq(discoveredSystems.systemId, destinationSystemId),
      ),
    });
    if (!knownDestination) {
      return refuelFailure(404, {
        code: "refuel_known_destination_not_found",
      });
    }

    const [destinationSystem] = await tx
      .select()
      .from(systems)
      .where(
        and(
          eq(systems.id, destinationSystemId),
          eq(systems.isHome, false),
          isNull(systems.ownerId),
        ),
      )
      .limit(1);
    if (!destinationSystem) {
      return refuelFailure(400, {
        code: "refuel_known_destination_not_public",
      });
    }

    if (target.systemId !== destinationSystem.id) {
      return refuelFailure(400, {
        code: "refuel_target_wrong_gate_destination",
      });
    }

    originGateDistance = await distanceBetweenSystemGateAndPlanet(
      tx,
      source.originSystemId,
      Number(source.originSystemSeed),
      source.locationPlanetId,
    );
    targetGateDistance = target.planet
      ? await distanceBetweenSystemGateAndPlanet(
          tx,
          destinationSystem.id,
          Number(destinationSystem.seed),
          target.planet.id,
        )
      : target.systemPoint
        ? systemMapPointDistanceLy(systemMapJumpGatePoint(), target.systemPoint)
        : null;
    if (originGateDistance === null || targetGateDistance === null) {
      return refuelFailure(404, { code: "refuel_target_planet_not_found" });
    }

    resolvedDestinationSystemId = destinationSystem.id;
    requestedDistance = originGateDistance + targetGateDistance;
    jumpFuelRequired = calculateJumpGateJumpFuelRequired(false);
  } else if (source.originSystemId === target.systemId && target.planet) {
    const systemPlanets = await tx.query.planets.findMany({
      where: eq(planets.systemId, source.originSystemId),
    });
    requestedDistance =
      source.locationPlanetId === target.planet.id
        ? 0
        : (systemMapPlanetDistanceLy(
            systemPlanets,
            Number(source.originSystemSeed),
            source.locationPlanetId,
            target.planet.id,
          ) ?? 0);
  } else if (source.originSystemId === target.systemId && target.systemPoint) {
    const sourceGateDistance = await distanceBetweenSystemGateAndPlanet(
      tx,
      source.originSystemId,
      Number(source.originSystemSeed),
      source.locationPlanetId,
    );
    requestedDistance =
      sourceGateDistance === null
        ? 0
        : sourceGateDistance +
          systemMapPointDistanceLy(
            systemMapJumpGatePoint(),
            target.systemPoint,
          );
  } else {
    requestedDistance = calculateSectorRouteDistance(
      {
        x: Number(source.originSectorX),
        y: Number(source.originSectorY),
      },
      {
        x: target.sectorX,
        y: target.sectorY,
      },
    );
  }

  const distance = Math.max(1, requestedDistance);
  const fuelRequired = calculateExpeditionRequiredFuel(
    distance,
    Number(source.fuelConsumption),
    false,
  );
  if (fuelRequired > source.fuelCapacity) {
    return refuelFailure(400, {
      code: "refuel_travel_fuel_exceeded",
      capacity: source.fuelCapacity,
      required: fuelRequired,
    });
  }
  if (jumpFuelRequired > source.jumpFuelCapacity) {
    return refuelFailure(400, {
      code: "refuel_travel_jump_fuel_exceeded",
      capacity: source.jumpFuelCapacity,
      required: jumpFuelRequired,
    });
  }

  const researchEffects = await getResearchEffectsForUser(userId, tx);
  const speed = applyShipSpeed(Number(source.speed), researchEffects);
  const engineFactor = 1;
  const etaSeconds = Math.max(
    10,
    calculateExpeditionEtaSeconds(distance, speed, engineFactor),
  );

  return {
    routeMode,
    destinationSystemId: resolvedDestinationSystemId,
    target,
    requestedDistance,
    distance,
    fuelRequired,
    jumpFuelRequired,
    originGateDistance,
    targetGateDistance,
    speed,
    engineFactor,
    etaSeconds,
    eta: new Date(Date.now() + etaSeconds * 1000),
  };
}

async function ensureTravelFuel(
  source: RefuelShipRow,
  route: RoutePlan,
  tx: Tx,
): Promise<
  { remainingFuel: number; remainingJumpFuel: number } | RefuelResult
> {
  const currentFuel = Number(source.fuel);
  const currentJumpFuel = Number(source.jumpFuel);
  const neededFuelFromPlanet = Math.max(0, route.fuelRequired - currentFuel);
  const neededJumpFuelFromPlanet = Math.max(
    0,
    route.jumpFuelRequired - currentJumpFuel,
  );
  if (neededFuelFromPlanet > 0 || neededJumpFuelFromPlanet > 0) {
    const costs = [];
    if (neededFuelFromPlanet > 0) {
      costs.push({ resourceId: "fuel", amount: neededFuelFromPlanet });
    }
    if (neededJumpFuelFromPlanet > 0) {
      costs.push({
        resourceId: JUMP_FUEL_RESOURCE_ID,
        amount: neededJumpFuelFromPlanet,
      });
    }

    const spendResult = await spendResources(
      source.locationPlanetId!,
      costs,
      tx,
    );
    if (!spendResult.success) {
      const resourceId = spendResult.details?.resourceId;
      const fuelType =
        resourceId === JUMP_FUEL_RESOURCE_ID ? "jump_fuel" : "fuel";
      const current = fuelType === "jump_fuel" ? currentJumpFuel : currentFuel;
      const requested =
        fuelType === "jump_fuel" ? route.jumpFuelRequired : route.fuelRequired;
      return refuelFailure(400, {
        code: "refuel_source_insufficient",
        fuelType,
        available: current + Number(spendResult.details?.available ?? 0),
        requested,
      });
    }
  }

  return {
    remainingFuel: currentFuel + neededFuelFromPlanet - route.fuelRequired,
    remainingJumpFuel:
      currentJumpFuel + neededJumpFuelFromPlanet - route.jumpFuelRequired,
  };
}

async function reserveSupportFuel(
  userId: string,
  source: RefuelShipRow,
  target: RefuelShipRow,
  fuel: number,
  jumpFuel: number,
  tx: Tx,
): Promise<
  | {
      sourceRefuelFuelAfter: number;
      sourceRefuelJumpFuelAfter: number;
    }
  | RefuelResult
> {
  const sourceRefuelFuel = Number(source.refuelFuel);
  const sourceRefuelJumpFuel = Number(source.refuelJumpFuel);
  const targetFuel = Number(target.fuel);
  const targetJumpFuel = Number(target.jumpFuel);

  if (fuel > 0) {
    if (fuel > source.refuelFuelCapacity) {
      return refuelFailure(400, {
        code: "refuel_source_insufficient",
        fuelType: "fuel",
        available: Math.max(0, source.refuelFuelCapacity),
        requested: fuel,
      });
    }
    if (targetFuel + fuel > target.fuelCapacity) {
      return refuelFailure(400, {
        code: "refuel_exceeds_tank",
        fuelType: "fuel",
        capacity: target.fuelCapacity,
        current: targetFuel,
        requested: fuel,
      });
    }
  }

  if (jumpFuel > 0) {
    if (jumpFuel > source.refuelJumpFuelCapacity) {
      return refuelFailure(400, {
        code: "refuel_source_insufficient",
        fuelType: "jump_fuel",
        available: Math.max(0, source.refuelJumpFuelCapacity),
        requested: jumpFuel,
      });
    }
    if (targetJumpFuel + jumpFuel > target.jumpFuelCapacity) {
      return refuelFailure(400, {
        code: "refuel_exceeds_tank",
        fuelType: "jump_fuel",
        capacity: target.jumpFuelCapacity,
        current: targetJumpFuel,
        requested: jumpFuel,
      });
    }
  }

  const fuelNeededFromPlanet = Math.max(0, fuel - sourceRefuelFuel);
  const jumpFuelNeededFromPlanet = Math.max(0, jumpFuel - sourceRefuelJumpFuel);

  if (fuelNeededFromPlanet > 0 || jumpFuelNeededFromPlanet > 0) {
    if (!source.locationPlanetId) {
      return refuelFailure(400, { code: "refuel_source_not_on_planet" });
    }

    const settlement = await getPlayerPlanetSettlement(
      userId,
      source.locationPlanetId,
      tx,
    );
    if (!settlement?.isSettled) {
      const fuelType = fuelNeededFromPlanet > 0 ? "fuel" : "jump_fuel";
      return refuelFailure(400, {
        code: "refuel_source_insufficient",
        fuelType,
        available:
          fuelType === "fuel" ? sourceRefuelFuel : sourceRefuelJumpFuel,
        requested: fuelType === "fuel" ? fuel : jumpFuel,
      });
    }

    const fuelLoadCosts = [];
    if (fuelNeededFromPlanet > 0) {
      fuelLoadCosts.push({ resourceId: "fuel", amount: fuelNeededFromPlanet });
    }
    if (jumpFuelNeededFromPlanet > 0) {
      fuelLoadCosts.push({
        resourceId: JUMP_FUEL_RESOURCE_ID,
        amount: jumpFuelNeededFromPlanet,
      });
    }

    const spendResult = await spendResources(
      source.locationPlanetId,
      fuelLoadCosts,
      tx,
    );
    if (!spendResult.success) {
      const resourceId = spendResult.details?.resourceId;
      const fuelType =
        resourceId === JUMP_FUEL_RESOURCE_ID ? "jump_fuel" : "fuel";
      const reserveAvailable =
        fuelType === "jump_fuel" ? sourceRefuelJumpFuel : sourceRefuelFuel;
      return refuelFailure(400, {
        code: "refuel_source_insufficient",
        fuelType,
        available:
          reserveAvailable + Number(spendResult.details?.available ?? 0),
        requested: fuelType === "jump_fuel" ? jumpFuel : fuel,
      });
    }
  }

  return {
    sourceRefuelFuelAfter: sourceRefuelFuel + fuelNeededFromPlanet - fuel,
    sourceRefuelJumpFuelAfter:
      sourceRefuelJumpFuel + jumpFuelNeededFromPlanet - jumpFuel,
  };
}

export async function refuelShip(
  userId: string,
  req: RefuelRequest,
): Promise<RefuelResult<RefuelResponse>> {
  const {
    targetShipId,
    sourceShipId,
    fuel = 0,
    jumpFuel = 0,
    routeMode = "local",
    destinationSystemId = null,
  } = req;
  const db = defaultDb;

  if (targetShipId === sourceShipId) {
    return refuelFailure(400, {
      code: "refuel_same_ship",
    }) as RefuelResult<RefuelResponse>;
  }

  if (
    !Number.isFinite(fuel) ||
    !Number.isFinite(jumpFuel) ||
    fuel < 0 ||
    jumpFuel < 0 ||
    (fuel <= 0 && jumpFuel <= 0)
  ) {
    return refuelFailure(400, {
      code: "refuel_no_fuel_requested",
    }) as RefuelResult<RefuelResponse>;
  }

  return await db.transaction(async (tx) => {
    const lockedRows = await loadOwnedShipsForUpdate(tx, userId, [
      targetShipId,
      sourceShipId,
    ]);
    const targetShipRow = lockedRows.find((ship) => ship.id === targetShipId);
    const sourceShipRow = lockedRows.find((ship) => ship.id === sourceShipId);

    if (!targetShipRow) {
      return refuelFailure(404, {
        code: "refuel_target_not_found",
      }) as RefuelResult<RefuelResponse>;
    }

    if (!sourceShipRow) {
      return refuelFailure(404, {
        code: "refuel_source_not_found",
      }) as RefuelResult<RefuelResponse>;
    }

    if (sourceShipRow.typeId !== "refueler") {
      return refuelFailure(400, {
        code: "refuel_source_not_refueler",
      }) as RefuelResult<RefuelResponse>;
    }

    const stationedTarget = targetShipRow.locationPlanetId
      ? null
      : await loadStationedShipRouteTarget(tx, targetShipRow.id);
    const targetReadyForRefuel =
      targetShipRow.status === "idle" || stationedTarget !== null;

    if (sourceShipRow.status !== "idle" || !targetReadyForRefuel) {
      return refuelFailure(400, {
        code: "refuel_ship_not_idle",
      }) as RefuelResult<RefuelResponse>;
    }

    if (!sourceShipRow.locationPlanetId) {
      return refuelFailure(400, {
        code: "refuel_source_not_on_planet",
      }) as RefuelResult<RefuelResponse>;
    }

    const targetPlanet = targetShipRow.locationPlanetId
      ? await loadPlanetRouteTarget(tx, targetShipRow.locationPlanetId)
      : null;
    const routeTarget = targetPlanet
      ? planetRefuelRouteTarget(targetPlanet)
      : stationedTarget;

    if (!routeTarget) {
      return refuelFailure(400, {
        code: "refuel_target_not_on_planet",
      }) as RefuelResult<RefuelResponse>;
    }

    const route = await buildRoutePlan(
      userId,
      sourceShipRow,
      routeTarget,
      tx,
      routeMode,
      destinationSystemId,
    );
    if (isRefuelFailure(route)) {
      return route as RefuelResult<RefuelResponse>;
    }

    const travelFuel = await ensureTravelFuel(sourceShipRow, route, tx);
    if (isRefuelFailure(travelFuel)) {
      return travelFuel as RefuelResult<RefuelResponse>;
    }

    const reserve = await reserveSupportFuel(
      userId,
      sourceShipRow,
      targetShipRow,
      fuel,
      jumpFuel,
      tx,
    );
    if (isRefuelFailure(reserve)) {
      return reserve as RefuelResult<RefuelResponse>;
    }

    const [expedition] = await tx
      .insert(expeditions)
      .values({
        shipId: sourceShipRow.id,
        type: "refuel_transfer",
        originPlanetId: sourceShipRow.locationPlanetId,
        targetPlanetId: route.target.planet?.id ?? null,
        targetX: route.target.sectorX.toString(),
        targetY: route.target.sectorY.toString(),
        targetZ: route.target.sectorZ.toString(),
        status: "in_flight",
        eta: route.eta,
        result: {
          routeMode: route.routeMode,
          destinationSystemId: route.destinationSystemId,
          deliveryMode: "refuel_transfer",
          targetShipId: targetShipRow.id,
          targetPlanetName: route.target.name,
          targetSystemPoint: route.target.systemPoint ?? undefined,
          fuel,
          jumpFuel,
          fuelRequired: route.fuelRequired,
          jumpFuelRequired: route.jumpFuelRequired,
          distance: route.distance,
          requestedDistance: route.requestedDistance,
          originGateDistance: route.originGateDistance ?? undefined,
          targetGateDistance: route.targetGateDistance ?? undefined,
          originSystemId: sourceShipRow.originSystemId,
          targetSystemId: route.target.systemId,
          speed: route.speed,
          engineFactor: route.engineFactor,
          etaSeconds: route.etaSeconds,
          returnTrip: false,
        },
      })
      .returning();

    const [updatedSource] = await tx
      .update(ships)
      .set({
        status: "moving",
        locationPlanetId: null,
        fuel: travelFuel.remainingFuel.toFixed(2),
        jumpFuel: travelFuel.remainingJumpFuel.toFixed(2),
        refuelFuel: reserve.sourceRefuelFuelAfter.toFixed(2),
        refuelJumpFuel: reserve.sourceRefuelJumpFuelAfter.toFixed(2),
        cargoJson: {
          refuelFuel: fuel,
          refuelJumpFuel: jumpFuel,
        },
      })
      .where(eq(ships.id, sourceShipRow.id))
      .returning();

    return {
      success: true,
      status: 200,
      data: {
        success: true,
        expedition: expeditionSummary(expedition),
        queueItem: queueItem(expedition),
        targetShip: {
          id: targetShipRow.id,
          fuel: targetShipRow.fuel,
          jumpFuel: targetShipRow.jumpFuel,
        },
        sourceShip: shipSummary(updatedSource),
      },
    } satisfies RefuelResult<RefuelResponse>;
  });
}

async function availablePlanetResource(
  planetId: string,
  resourceId: string,
  tx: Tx,
): Promise<number> {
  const rows = await tx
    .select({ amount: planetResources.amount })
    .from(planetResources)
    .where(
      and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, resourceId),
      ),
    )
    .for("update")
    .limit(1);
  return Number(rows[0]?.amount ?? 0);
}

async function spendUpTo(
  planetId: string,
  resourceId: string,
  requested: number,
  tx: Tx,
): Promise<number> {
  const amount = Math.max(
    0,
    Math.min(
      requested,
      await availablePlanetResource(planetId, resourceId, tx),
    ),
  );
  if (amount <= 0) return 0;
  const spendResult = await spendResources(
    planetId,
    [{ resourceId, amount }],
    tx,
  );
  if (!spendResult.success) return 0;
  return amount;
}

async function fillRefuelerAtPlanet(
  userId: string,
  sourceShipId: string,
  targetPlanetId: string,
  tx: Tx,
): Promise<RefuelResult<RefuelReplenishResponse>> {
  const lockedRows = await loadOwnedShipsForUpdate(tx, userId, [sourceShipId]);
  const source = lockedRows[0];
  if (!source) {
    return refuelFailure(404, {
      code: "refuel_source_not_found",
    }) as RefuelResult<RefuelReplenishResponse>;
  }
  if (source.typeId !== "refueler") {
    return refuelFailure(400, {
      code: "refuel_source_not_refueler",
    }) as RefuelResult<RefuelReplenishResponse>;
  }

  const settlement = await getPlayerPlanetSettlement(
    userId,
    targetPlanetId,
    tx,
  );
  if (!settlement?.isSettled) {
    await tx
      .update(ships)
      .set({
        status: "idle",
        locationPlanetId: targetPlanetId,
        cargoJson: {},
      })
      .where(eq(ships.id, sourceShipId));
    return refuelFailure(404, {
      code: "refuel_target_planet_not_found",
    }) as RefuelResult<RefuelReplenishResponse>;
  }

  const fuelFree =
    Math.max(0, source.fuelCapacity - Number(source.fuel)) +
    Math.max(0, source.refuelFuelCapacity - Number(source.refuelFuel));
  const jumpFuelFree =
    Math.max(0, source.jumpFuelCapacity - Number(source.jumpFuel)) +
    Math.max(0, source.refuelJumpFuelCapacity - Number(source.refuelJumpFuel));

  const fuelLoaded = await spendUpTo(targetPlanetId, "fuel", fuelFree, tx);
  const jumpFuelLoaded = await spendUpTo(
    targetPlanetId,
    JUMP_FUEL_RESOURCE_ID,
    jumpFuelFree,
    tx,
  );

  const ownFuelLoad = Math.min(
    Math.max(0, source.fuelCapacity - Number(source.fuel)),
    fuelLoaded,
  );
  const reserveFuelLoad = fuelLoaded - ownFuelLoad;
  const ownJumpFuelLoad = Math.min(
    Math.max(0, source.jumpFuelCapacity - Number(source.jumpFuel)),
    jumpFuelLoaded,
  );
  const reserveJumpFuelLoad = jumpFuelLoaded - ownJumpFuelLoad;

  const [updatedSource] = await tx
    .update(ships)
    .set({
      status: "idle",
      locationPlanetId: targetPlanetId,
      cargoJson: {},
      fuel: (Number(source.fuel) + ownFuelLoad).toFixed(2),
      jumpFuel: (Number(source.jumpFuel) + ownJumpFuelLoad).toFixed(2),
      refuelFuel: (Number(source.refuelFuel) + reserveFuelLoad).toFixed(2),
      refuelJumpFuel: (
        Number(source.refuelJumpFuel) + reserveJumpFuelLoad
      ).toFixed(2),
    })
    .where(eq(ships.id, sourceShipId))
    .returning();

  return {
    success: true,
    status: 200,
    data: {
      success: true,
      sourceShip: shipSummary(updatedSource),
    },
  };
}

export async function replenishRefueler(
  userId: string,
  req: RefuelReplenishRequest,
): Promise<RefuelResult<RefuelReplenishResponse>> {
  const {
    sourceShipId,
    targetPlanetId,
    routeMode = "local",
    destinationSystemId = null,
  } = req;

  if (!sourceShipId || !targetPlanetId) {
    return refuelFailure(400, {
      code: "refuel_target_planet_not_found",
    }) as RefuelResult<RefuelReplenishResponse>;
  }

  return await defaultDb.transaction(async (tx) => {
    const lockedRows = await loadOwnedShipsForUpdate(tx, userId, [
      sourceShipId,
    ]);
    const source = lockedRows[0];
    if (!source) {
      return refuelFailure(404, {
        code: "refuel_source_not_found",
      }) as RefuelResult<RefuelReplenishResponse>;
    }
    if (source.typeId !== "refueler") {
      return refuelFailure(400, {
        code: "refuel_source_not_refueler",
      }) as RefuelResult<RefuelReplenishResponse>;
    }
    if (source.status !== "idle") {
      return refuelFailure(400, {
        code: "refuel_ship_not_idle",
      }) as RefuelResult<RefuelReplenishResponse>;
    }
    if (!source.locationPlanetId) {
      return refuelFailure(400, {
        code: "refuel_source_not_on_planet",
      }) as RefuelResult<RefuelReplenishResponse>;
    }

    const targetSettlement = await getPlayerPlanetSettlement(
      userId,
      targetPlanetId,
      tx,
    );
    if (!targetSettlement?.isSettled) {
      return refuelFailure(404, {
        code: "refuel_target_planet_not_found",
      }) as RefuelResult<RefuelReplenishResponse>;
    }
    const targetPlanet = await loadPlanetRouteTarget(tx, targetPlanetId);
    if (!targetPlanet) {
      return refuelFailure(404, {
        code: "refuel_target_planet_not_found",
      }) as RefuelResult<RefuelReplenishResponse>;
    }

    const route = await buildRoutePlan(
      userId,
      source,
      planetRefuelRouteTarget(targetPlanet),
      tx,
      routeMode,
      destinationSystemId,
    );
    if (isRefuelFailure(route)) {
      return route as RefuelResult<RefuelReplenishResponse>;
    }

    const travelFuel = await ensureTravelFuel(source, route, tx);
    if (isRefuelFailure(travelFuel)) {
      return travelFuel as RefuelResult<RefuelReplenishResponse>;
    }

    const [expedition] = await tx
      .insert(expeditions)
      .values({
        shipId: source.id,
        type: "refuel_replenish",
        originPlanetId: source.locationPlanetId,
        targetPlanetId,
        targetX: route.target.sectorX.toString(),
        targetY: route.target.sectorY.toString(),
        targetZ: route.target.sectorZ.toString(),
        status: "in_flight",
        eta: route.eta,
        result: {
          routeMode: route.routeMode,
          destinationSystemId: route.destinationSystemId,
          deliveryMode: "refuel_replenish",
          targetPlanetName: route.target.name,
          fuelRequired: route.fuelRequired,
          jumpFuelRequired: route.jumpFuelRequired,
          distance: route.distance,
          requestedDistance: route.requestedDistance,
          originGateDistance: route.originGateDistance ?? undefined,
          targetGateDistance: route.targetGateDistance ?? undefined,
          originSystemId: source.originSystemId,
          targetSystemId: route.target.systemId,
          speed: route.speed,
          engineFactor: route.engineFactor,
          etaSeconds: route.etaSeconds,
          returnTrip: false,
        },
      })
      .returning();

    const [updatedSource] = await tx
      .update(ships)
      .set({
        status: "moving",
        locationPlanetId: null,
        fuel: travelFuel.remainingFuel.toFixed(2),
        jumpFuel: travelFuel.remainingJumpFuel.toFixed(2),
        cargoJson: {},
      })
      .where(eq(ships.id, source.id))
      .returning();

    return {
      success: true,
      status: 200,
      data: {
        success: true,
        expedition: expeditionSummary(expedition),
        queueItem: queueItem(expedition),
        sourceShip: shipSummary(updatedSource),
      },
    } satisfies RefuelResult<RefuelReplenishResponse>;
  });
}

export async function completeRefuelTransfer(
  expedition: typeof expeditions.$inferSelect,
  tx: Tx,
): Promise<boolean> {
  if (expedition.type !== "refuel_transfer") {
    throw new Error(
      `Invalid expedition type for refuel transfer: ${expedition.type}`,
    );
  }

  const result = (expedition.result ?? {}) as Record<string, unknown>;
  const targetShipId =
    typeof result.targetShipId === "string" ? result.targetShipId : null;
  const targetSystemPoint = pointFromUnknown(result.targetSystemPoint);
  const targetSystemId =
    typeof result.destinationSystemId === "string"
      ? result.destinationSystemId
      : typeof result.targetSystemId === "string"
        ? result.targetSystemId
        : null;
  const stationSourceAtPoint = Boolean(
    !expedition.targetPlanetId && targetSystemId && targetSystemPoint,
  );
  if (!targetShipId || (!expedition.targetPlanetId && !stationSourceAtPoint)) {
    return false;
  }

  const [claimedExpedition] = await tx
    .update(expeditions)
    .set(
      stationSourceAtPoint
        ? { status: "stationed", eta: new Date() }
        : { status: "completed", returnedAt: new Date() },
    )
    .where(
      and(
        eq(expeditions.id, expedition.id),
        inArray(expeditions.status, ["in_flight", "returning"]),
      ),
    )
    .returning();
  if (!claimedExpedition) return false;

  const rows = (await tx
    .select({
      id: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
      status: ships.status,
      locationPlanetId: ships.locationPlanetId,
      fuel: ships.fuel,
      jumpFuel: ships.jumpFuel,
      refuelFuel: ships.refuelFuel,
      refuelJumpFuel: ships.refuelJumpFuel,
      fuelCapacity: shipTypes.fuelCapacity,
      jumpFuelCapacity: shipTypes.jumpFuelCapacity,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .where(inArray(ships.id, [expedition.shipId, targetShipId]))
    .orderBy(ships.id)
    .for("update")) as Array<{
    id: string;
    ownerId: string;
    typeId: string;
    status: string;
    locationPlanetId: string | null;
    fuel: string;
    jumpFuel: string;
    refuelFuel: string;
    refuelJumpFuel: string;
    fuelCapacity: number;
    jumpFuelCapacity: number;
  }>;

  const source = rows.find((ship) => ship.id === expedition.shipId);
  const target = rows.find((ship) => ship.id === targetShipId);
  if (!source) return false;

  const requestedFuel = Number(result.fuel ?? 0);
  const requestedJumpFuel = Number(result.jumpFuel ?? 0);
  let deliveredFuel = 0;
  let deliveredJumpFuel = 0;
  let targetAtDeliveryPoint = false;

  if (
    target &&
    target.ownerId === source.ownerId &&
    target.status !== "destroyed"
  ) {
    if (expedition.targetPlanetId) {
      targetAtDeliveryPoint =
        target.locationPlanetId === expedition.targetPlanetId;
    } else if (targetSystemId && targetSystemPoint) {
      const stationedTarget = await loadStationedShipRouteTarget(tx, target.id);
      targetAtDeliveryPoint = Boolean(
        stationedTarget &&
        stationedTarget.systemId === targetSystemId &&
        pointsApproximatelyEqual(
          stationedTarget.systemPoint,
          targetSystemPoint,
        ),
      );
    }
  }

  if (target && targetAtDeliveryPoint) {
    deliveredFuel = Math.max(
      0,
      Math.min(requestedFuel, target.fuelCapacity - Number(target.fuel)),
    );
    deliveredJumpFuel = Math.max(
      0,
      Math.min(
        requestedJumpFuel,
        target.jumpFuelCapacity - Number(target.jumpFuel),
      ),
    );

    await tx
      .update(ships)
      .set({
        fuel: (Number(target.fuel) + deliveredFuel).toFixed(2),
        jumpFuel: (Number(target.jumpFuel) + deliveredJumpFuel).toFixed(2),
      })
      .where(eq(ships.id, target.id));
  }

  await tx
    .update(ships)
    .set({
      status: stationSourceAtPoint ? "moving" : "idle",
      locationPlanetId: expedition.targetPlanetId,
      cargoJson: {},
      refuelFuel: (
        Number(source.refuelFuel) + Math.max(0, requestedFuel - deliveredFuel)
      ).toFixed(2),
      refuelJumpFuel: (
        Number(source.refuelJumpFuel) +
        Math.max(0, requestedJumpFuel - deliveredJumpFuel)
      ).toFixed(2),
    })
    .where(eq(ships.id, source.id));

  await tx
    .update(expeditions)
    .set({
      result: {
        ...result,
        deliveredFuel,
        deliveredJumpFuel,
        completedAt: new Date().toISOString(),
      },
    })
    .where(eq(expeditions.id, expedition.id));

  return true;
}

export async function completeRefuelReplenish(
  expedition: typeof expeditions.$inferSelect,
  tx: Tx,
): Promise<boolean> {
  if (expedition.type !== "refuel_replenish") {
    throw new Error(
      `Invalid expedition type for refuel replenish: ${expedition.type}`,
    );
  }
  if (!expedition.targetPlanetId) return false;

  const [claimedExpedition] = await tx
    .update(expeditions)
    .set({ status: "completed", returnedAt: new Date() })
    .where(
      and(
        eq(expeditions.id, expedition.id),
        inArray(expeditions.status, ["in_flight", "returning"]),
      ),
    )
    .returning();
  if (!claimedExpedition) return false;

  const [source] = await tx
    .select({ ownerId: ships.ownerId })
    .from(ships)
    .where(eq(ships.id, claimedExpedition.shipId))
    .limit(1);
  if (!source) return false;

  const result = await fillRefuelerAtPlanet(
    source.ownerId,
    claimedExpedition.shipId,
    expedition.targetPlanetId,
    tx,
  );

  await tx
    .update(expeditions)
    .set({
      result: {
        ...(claimedExpedition.result ?? {}),
        completedAt: new Date().toISOString(),
        replenished: result.success,
      },
    })
    .where(eq(expeditions.id, expedition.id));

  return result.success;
}
