import { and, eq, isNull, sql } from "drizzle-orm";
import {
  formatLaunchExpeditionErrorMessage,
  type LaunchExpeditionErrorCode,
  type LaunchExpeditionErrorDetails,
  type LaunchExpeditionRequest,
} from "@shared/types/expeditions.js";
import type { ExpeditionRouteMode } from "@shared/config/expeditionRouting.js";
import {
  calculateJumpGateJumpFuelRequired,
  calculateExpeditionEtaSeconds,
  calculateExpeditionRequiredFuel,
  calculateSectorRouteDistance,
  isOneWayExpedition,
  JUMP_FUEL_RESOURCE_ID,
} from "@shared/config/expeditionRouting.js";
import { db as defaultDb } from "../../db/index.js";
import {
  discoveredSystems,
  expeditions,
  planetResources,
  planets,
  ships,
  shipTypes,
  systems,
  discoveredPlanets,
} from "../../db/schema.js";
import { spendResources } from "../resources/transactions.js";
import {
  applyShipSpeed,
  getResearchEffectsForUser,
} from "../research/effects.js";
import { checkColonizationGates } from "../colonies/colonization-rules.js";
import { colonyService } from "../colonies/colonies.js";
import {
  buildSystemMapLayouts,
  systemMapJumpGatePoint,
  systemMapPlanetDistanceLy,
  systemMapPointDistanceLy,
} from "@shared/format/systemMapLayout.js";
import { getJumpGateState } from "../jump-gate/service.js";
import {
  buildExpeditionSpaceportReservation,
  loadLandingSlotUsage,
  shipRoleRequiresTargetLandingSlot,
} from "../ships/spaceport-capacity.js";

export interface LaunchExpeditionResult {
  success: boolean;
  status: number;
  expedition?: typeof expeditions.$inferSelect;
  ship?: typeof ships.$inferSelect;
  queueItem?: {
    id: string;
    completesAt: string;
  };
  error?: string;
  code?: LaunchExpeditionErrorCode;
  details?: Omit<LaunchExpeditionErrorDetails, "code">;
}

type ShipLaunchRow = {
  shipId: string;
  shipOwnerId: string;
  shipStatus: string;
  shipLocationPlanetId: string | null;
  shipTypeId: string;
  shipRole: string;
  shipSpeed: string;
  shipFuelConsumption: string;
  shipCargoCapacity: number;
  originSystemId: string | null;
  originSystemSeed: number | null;
  originX: number | null;
  originY: number | null;
  originZ: number | null;
  originPlanetId: string | null;
  shipFuel: string;
  shipJumpFuel: string;
  shipFuelCapacity: number;
  shipJumpFuelCapacity: number;
};

type SystemMapPoint = { x: number; y: number };

type StationedLaunchOrigin = {
  expedition: typeof expeditions.$inferSelect;
  system: typeof systems.$inferSelect;
  originPlanetId: string;
  point: SystemMapPoint;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function launchFailure(
  status: number,
  details: LaunchExpeditionErrorDetails,
): LaunchExpeditionResult {
  const { code, ...rest } = details;
  return {
    success: false,
    status,
    error: formatLaunchExpeditionErrorMessage(details, "en"),
    code,
    details: rest,
  };
}

function pointFromUnknown(value: unknown): SystemMapPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  return isFiniteNumber(point.x) && isFiniteNumber(point.y)
    ? { x: point.x, y: point.y }
    : null;
}

async function getAvailableCargo(planetId: string, tx: any): Promise<number> {
  const rows = await tx
    .select({
      total: sql<number>`COALESCE(SUM(${planetResources.amount}), 0)`,
    })
    .from(planetResources)
    .where(eq(planetResources.planetId, planetId));

  return Number(rows[0]?.total ?? 0);
}

async function loadStationedLaunchOrigin(
  shipId: string,
): Promise<StationedLaunchOrigin | null> {
  const expedition =
    (await defaultDb.query.expeditions.findFirst({
      where: and(
        eq(expeditions.shipId, shipId),
        eq(expeditions.status, "stationed"),
      ),
    })) ?? null;
  if (!expedition) return null;

  const result = expedition.result as Record<string, unknown> | null;
  const originSystemId =
    result && typeof result.destinationSystemId === "string"
      ? result.destinationSystemId
      : null;
  const point = pointFromUnknown(result?.targetSystemPoint);
  if (!originSystemId || !point) return null;

  const system =
    (await defaultDb.query.systems.findFirst({
      where: eq(systems.id, originSystemId),
    })) ?? null;
  if (!system) return null;

  const [originPlanet] = await defaultDb
    .select({ id: planets.id })
    .from(planets)
    .where(eq(planets.systemId, system.id))
    .limit(1);
  if (!originPlanet) return null;

  return {
    expedition,
    system,
    originPlanetId: originPlanet.id,
    point,
  };
}

async function distanceBetweenSystemGateAndPlanet(
  systemId: string,
  systemSeed: number,
  planetId: string,
): Promise<number | null> {
  const systemPlanets = await defaultDb.query.planets.findMany({
    where: eq(planets.systemId, systemId),
  });
  const planetLayout = buildSystemMapLayouts(
    systemPlanets,
    Number(systemSeed),
  ).find((layout) => layout.id === planetId);
  if (!planetLayout) return null;

  return systemMapPointDistanceLy(systemMapJumpGatePoint(), planetLayout);
}

async function distanceBetweenPointAndPlanet(
  systemId: string,
  systemSeed: number,
  point: SystemMapPoint,
  planetId: string,
): Promise<number | null> {
  const systemPlanets = await defaultDb.query.planets.findMany({
    where: eq(planets.systemId, systemId),
  });
  const planetLayout = buildSystemMapLayouts(
    systemPlanets,
    Number(systemSeed),
  ).find((layout) => layout.id === planetId);
  if (!planetLayout) return null;

  return systemMapPointDistanceLy(point, planetLayout);
}

export async function launchExpedition(
  userId: string,
  request: LaunchExpeditionRequest,
): Promise<LaunchExpeditionResult> {
  const {
    shipId,
    targetX,
    targetY,
    targetZ,
    fuelLoaded,
    jumpFuelLoaded,
    cargoLoaded,
    targetPlanetId,
    destinationSystemId,
    targetSystemX,
    targetSystemY,
  } = request;
  const routeMode: ExpeditionRouteMode = request.routeMode ?? "local";

  if (!shipId) {
    return launchFailure(400, { code: "expedition_ship_required" });
  }

  if (routeMode !== "local" && routeMode !== "jump_gate") {
    return launchFailure(400, { code: "expedition_invalid_route_mode" });
  }

  const localRouteTargetInvalid =
    routeMode === "local" &&
    (!isFiniteNumber(targetX) ||
      !isFiniteNumber(targetY) ||
      !isFiniteNumber(targetZ));
  const jumpRouteTargetPointInvalid =
    routeMode === "jump_gate" &&
    ((targetSystemX !== undefined && !isFiniteNumber(targetSystemX)) ||
      (targetSystemY !== undefined && !isFiniteNumber(targetSystemY)));
  if (
    localRouteTargetInvalid ||
    jumpRouteTargetPointInvalid ||
    (fuelLoaded !== undefined && !isFiniteNumber(fuelLoaded)) ||
    !isFiniteNumber(cargoLoaded)
  ) {
    return launchFailure(400, {
      code: "expedition_invalid_numbers",
      routeMode,
    });
  }

  if (routeMode === "jump_gate" && !destinationSystemId) {
    return launchFailure(400, { code: "expedition_destination_required" });
  }

  if (cargoLoaded < 0) {
    return launchFailure(400, { code: "expedition_cargo_negative" });
  }

  const shipRows = (await defaultDb
    .select({
      shipId: ships.id,
      shipOwnerId: ships.ownerId,
      shipStatus: ships.status,
      shipLocationPlanetId: ships.locationPlanetId,
      shipTypeId: ships.typeId,
      shipRole: shipTypes.role,
      shipSpeed: shipTypes.speed,
      shipFuelConsumption: shipTypes.fuelConsumption,
      shipCargoCapacity: shipTypes.cargo,
      originSystemId: systems.id,
      originSystemSeed: systems.seed,
      originX: systems.sectorX,
      originY: systems.sectorY,
      originZ: systems.sectorZ,
      originPlanetId: planets.id,
      shipFuel: ships.fuel,
      shipJumpFuel: ships.jumpFuel,
      shipFuelCapacity: shipTypes.fuelCapacity,
      shipJumpFuelCapacity: shipTypes.jumpFuelCapacity,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .leftJoin(planets, eq(planets.id, ships.locationPlanetId))
    .leftJoin(systems, eq(systems.id, planets.systemId))
    .where(eq(ships.id, shipId))
    .limit(1)) as ShipLaunchRow[];

  const shipRow = shipRows[0];
  if (!shipRow) {
    return launchFailure(404, { code: "expedition_ship_not_found" });
  }

  if (shipRow.shipOwnerId !== userId) {
    return launchFailure(403, { code: "expedition_ship_not_owned" });
  }

  const stationedOrigin =
    shipRow.shipStatus === "moving"
      ? await loadStationedLaunchOrigin(shipRow.shipId)
      : null;
  const launchingFromStationedPoint = stationedOrigin !== null;

  if (shipRow.shipStatus !== "idle" && !launchingFromStationedPoint) {
    return launchFailure(400, { code: "expedition_ship_not_idle" });
  }

  if (
    !launchingFromStationedPoint &&
    (!shipRow.shipLocationPlanetId ||
      !shipRow.originPlanetId ||
      !shipRow.originSystemId ||
      shipRow.originSystemSeed === null ||
      shipRow.originX === null ||
      shipRow.originY === null ||
      shipRow.originZ === null)
  ) {
    return launchFailure(400, { code: "expedition_ship_not_on_planet" });
  }

  if (launchingFromStationedPoint && routeMode !== "jump_gate") {
    return launchFailure(400, {
      code: "expedition_invalid_route_mode",
    });
  }

  if (shipRow.shipRole === "logistics") {
    return launchFailure(400, {
      code: "expedition_logistics_route_required",
      shipTypeId: shipRow.shipTypeId,
    });
  }

  const originSystemId = launchingFromStationedPoint
    ? stationedOrigin.system.id
    : shipRow.originSystemId!;
  const originSystemSeed = Number(
    launchingFromStationedPoint
      ? stationedOrigin.system.seed
      : shipRow.originSystemSeed,
  );
  const originX = Number(
    launchingFromStationedPoint
      ? stationedOrigin.system.sectorX
      : shipRow.originX,
  );
  const originY = Number(
    launchingFromStationedPoint
      ? stationedOrigin.system.sectorY
      : shipRow.originY,
  );
  const originPlanetId = launchingFromStationedPoint
    ? stationedOrigin.originPlanetId
    : shipRow.originPlanetId!;
  const originSystemPoint = launchingFromStationedPoint
    ? stationedOrigin.point
    : null;
  const launchInventoryPlanetId = launchingFromStationedPoint
    ? null
    : shipRow.shipLocationPlanetId!;

  let resolvedTargetX = routeMode === "local" ? targetX! : 0;
  let resolvedTargetY = routeMode === "local" ? targetY! : 0;
  let resolvedTargetZ = routeMode === "local" ? targetZ! : 0;
  let resolvedDestinationSystemId: string | null = null;
  let jumpFuelRequired = 0;
  let destinationSystem: typeof systems.$inferSelect | null = null;
  let targetSystemPoint: { x: number; y: number } | null = null;
  let destinationIsOwnHomeSystem = false;

  if (routeMode === "jump_gate") {
    const gateState = await getJumpGateState(userId);
    if (!gateState.unlocked) {
      return launchFailure(400, {
        code:
          gateState.lockedReason?.code === "jump_drive_required"
            ? "expedition_jump_drive_required"
            : "expedition_jump_gate_locked",
      });
    }

    if (gateState.calibration.status === "calibrating") {
      return launchFailure(400, { code: "expedition_jump_gate_calibrating" });
    }

    const ownHomeDestination = launchingFromStationedPoint
      ? ((await defaultDb.query.systems.findFirst({
          where: and(
            eq(systems.id, destinationSystemId!),
            eq(systems.isHome, true),
            eq(systems.ownerId, userId),
          ),
        })) ?? null)
      : null;

    if (ownHomeDestination) {
      destinationSystem = ownHomeDestination;
      destinationIsOwnHomeSystem = true;
    } else {
      const knownDestination =
        await defaultDb.query.discoveredSystems.findFirst({
          where: and(
            eq(discoveredSystems.userId, userId),
            eq(discoveredSystems.systemId, destinationSystemId!),
          ),
        });
      if (!knownDestination) {
        return launchFailure(404, {
          code: "expedition_known_destination_not_found",
        });
      }

      destinationSystem =
        (await defaultDb.query.systems.findFirst({
          where: and(
            eq(systems.id, destinationSystemId!),
            eq(systems.isHome, false),
            isNull(systems.ownerId),
          ),
        })) ?? null;
    }
    if (!destinationSystem) {
      return launchFailure(400, {
        code: "expedition_known_destination_not_public",
      });
    }

    if (isFiniteNumber(targetSystemX) && isFiniteNumber(targetSystemY)) {
      targetSystemPoint = { x: targetSystemX, y: targetSystemY };
    }

    resolvedDestinationSystemId = destinationSystem.id;
    resolvedTargetX = destinationSystem.sectorX;
    resolvedTargetY = destinationSystem.sectorY;
    resolvedTargetZ = destinationSystem.sectorZ;
  }

  if (shipRow.shipRole === "colonization" && !targetPlanetId) {
    return launchFailure(400, { code: "expedition_colonizer_target_required" });
  }

  if (
    routeMode === "jump_gate" &&
    shipRow.shipRole !== "colonization" &&
    !targetPlanetId &&
    !targetSystemPoint
  ) {
    return launchFailure(400, {
      code: "expedition_gate_target_point_required",
    });
  }

  if (cargoLoaded > shipRow.shipCargoCapacity) {
    return launchFailure(400, { code: "expedition_cargo_capacity" });
  }

  let resolvedTargetPlanetId: string | null = null;
  let sameSystemPlanetDistance: number | null = null;
  if (targetPlanetId) {
    const targetPlanet = await defaultDb.query.planets.findFirst({
      where: eq(planets.id, targetPlanetId),
      with: { system: true },
    });

    if (!targetPlanet?.system) {
      return launchFailure(404, { code: "expedition_target_not_found" });
    }

    const sys = targetPlanet.system;
    if (routeMode === "jump_gate") {
      if (
        !destinationSystem ||
        targetPlanet.systemId !== destinationSystem.id
      ) {
        return launchFailure(400, {
          code: "expedition_target_wrong_gate_destination",
        });
      }

      if (!destinationIsOwnHomeSystem && (sys.isHome || sys.ownerId)) {
        return launchFailure(400, { code: "expedition_target_not_public" });
      }
      if (
        destinationIsOwnHomeSystem &&
        (!sys.isHome || sys.ownerId !== userId)
      ) {
        return launchFailure(400, {
          code: "expedition_target_wrong_gate_destination",
        });
      }
    } else {
      if (
        Math.trunc(resolvedTargetX) !== sys.sectorX ||
        Math.trunc(resolvedTargetY) !== sys.sectorY ||
        Math.trunc(resolvedTargetZ) !== sys.sectorZ
      ) {
        return launchFailure(400, {
          code: "expedition_target_sector_mismatch",
        });
      }
    }

    if (shipRow.shipRole === "recon") {
      if (routeMode === "local" && (!sys.isHome || sys.ownerId !== userId)) {
        return launchFailure(400, { code: "expedition_target_home_required" });
      }

      const already = await defaultDb.query.discoveredPlanets.findFirst({
        where: and(
          eq(discoveredPlanets.userId, userId),
          eq(discoveredPlanets.planetId, targetPlanetId),
        ),
      });
      if (already) {
        return launchFailure(400, {
          code: "expedition_target_already_surveyed",
        });
      }
    } else if (shipRow.shipRole === "colonization") {
      const gates = await checkColonizationGates(userId, targetPlanetId, {
        enforceDistance: routeMode !== "jump_gate",
      });
      if (!gates.allowed) {
        return launchFailure(400, {
          code: "expedition_colonization_blocked",
          reason: gates.reason,
        });
      }

      const eligibility = await colonyService.canColonize(
        userId,
        targetPlanetId,
      );
      if (!eligibility.allowed) {
        return launchFailure(400, {
          code: "expedition_colonization_blocked",
          reason: eligibility.reason,
        });
      }
    }

    if (targetPlanet.systemId === originSystemId) {
      const systemPlanets = await defaultDb.query.planets.findMany({
        where: eq(planets.systemId, originSystemId),
      });
      if (originSystemPoint) {
        const targetLayout = buildSystemMapLayouts(
          systemPlanets,
          originSystemSeed,
        ).find((layout) => layout.id === targetPlanet.id);
        sameSystemPlanetDistance = targetLayout
          ? systemMapPointDistanceLy(originSystemPoint, targetLayout)
          : null;
      } else {
        sameSystemPlanetDistance = systemMapPlanetDistanceLy(
          systemPlanets,
          originSystemSeed,
          originPlanetId,
          targetPlanet.id,
        );
      }
    }

    resolvedTargetPlanetId = targetPlanetId;
  }

  // Galactic travel is modeled on the sector XY plane only so map routes, fuel,
  // ETA, and expedition ticks stay aligned with the 2D system map / corridor
  // discovery logic (which never used Z in layout space).
  const ox = originX;
  const oy = originY;
  const sameStationedDestination =
    routeMode === "jump_gate" &&
    launchingFromStationedPoint &&
    destinationSystem?.id === originSystemId;
  const originGateDistance =
    routeMode === "jump_gate" && sameStationedDestination
      ? 0
      : routeMode === "jump_gate" && originSystemPoint
        ? systemMapPointDistanceLy(originSystemPoint, systemMapJumpGatePoint())
        : routeMode === "jump_gate"
          ? await distanceBetweenSystemGateAndPlanet(
              originSystemId,
              originSystemSeed,
              originPlanetId,
            )
          : null;
  const targetGateDistance =
    routeMode === "jump_gate" &&
    sameStationedDestination &&
    resolvedTargetPlanetId &&
    destinationSystem &&
    originSystemPoint
      ? await distanceBetweenPointAndPlanet(
          destinationSystem.id,
          Number(destinationSystem.seed),
          originSystemPoint,
          resolvedTargetPlanetId,
        )
      : routeMode === "jump_gate" &&
          sameStationedDestination &&
          targetSystemPoint &&
          originSystemPoint
        ? systemMapPointDistanceLy(originSystemPoint, targetSystemPoint)
        : routeMode === "jump_gate" &&
            resolvedTargetPlanetId &&
            destinationSystem
          ? await distanceBetweenSystemGateAndPlanet(
              destinationSystem.id,
              Number(destinationSystem.seed),
              resolvedTargetPlanetId,
            )
          : routeMode === "jump_gate" && targetSystemPoint
            ? systemMapPointDistanceLy(
                systemMapJumpGatePoint(),
                targetSystemPoint,
              )
            : null;
  const distance =
    routeMode === "jump_gate"
      ? (originGateDistance ?? 0) + (targetGateDistance ?? 0)
      : (sameSystemPlanetDistance ??
        calculateSectorRouteDistance(
          { x: ox, y: oy },
          { x: resolvedTargetX, y: resolvedTargetY },
        ));
  const travelDistance =
    resolvedTargetPlanetId || routeMode === "jump_gate"
      ? Math.max(1, distance)
      : distance;
  const isOneWayMission = isOneWayExpedition({
    shipRole: shipRow.shipRole,
    isColonizer: shipRow.shipRole === "colonization",
    hasTargetPlanet: resolvedTargetPlanetId !== null,
    routeMode,
  });
  const returnTrip = !isOneWayMission;
  jumpFuelRequired =
    routeMode === "jump_gate" && !sameStationedDestination
      ? calculateJumpGateJumpFuelRequired(returnTrip)
      : 0;
  const spaceportReservation = buildExpeditionSpaceportReservation({
    originPlanetId,
    targetPlanetId: resolvedTargetPlanetId,
    returnTrip,
    targetLandingSlotRequired:
      resolvedTargetPlanetId !== null &&
      shipRoleRequiresTargetLandingSlot(shipRow.shipRole),
  });
  const fuelRequired = calculateExpeditionRequiredFuel(
    travelDistance,
    Number(shipRow.shipFuelConsumption),
    returnTrip,
  );
  const researchEffects = await getResearchEffectsForUser(userId, defaultDb);
  const speed = applyShipSpeed(Number(shipRow.shipSpeed), researchEffects);
  const engineFactor = 1;
  const etaSeconds = calculateExpeditionEtaSeconds(
    travelDistance,
    speed,
    engineFactor,
  );
  const eta = new Date(Date.now() + etaSeconds * 1000);

  return defaultDb.transaction(async (tx) => {
    if (spaceportReservation?.targetPlanetId) {
      const usage = await loadLandingSlotUsage(
        tx,
        spaceportReservation.targetPlanetId,
        {
          lock: true,
        },
      );

      if (usage.capacity <= 0) {
        return launchFailure(400, { code: "expedition_spaceport_required" });
      }

      if (usage.used >= usage.capacity) {
        return launchFailure(400, {
          code: "expedition_landing_slots_full",
          capacity: usage.capacity,
          occupied: usage.occupied,
          reserved: usage.reserved,
        });
      }
    }

    const availableCargo = launchInventoryPlanetId
      ? await getAvailableCargo(launchInventoryPlanetId, tx)
      : 0;
    if (availableCargo < cargoLoaded) {
      return launchFailure(400, { code: "expedition_cargo_unavailable" });
    }

    const currentFuel = Number(shipRow.shipFuel);
    const currentJumpFuel = Number(shipRow.shipJumpFuel);
    const fuelCapacity = shipRow.shipFuelCapacity;
    const jumpFuelCapacity = shipRow.shipJumpFuelCapacity;

    // Minimum fuel required in the ship's tank for this trip
    const minFuelNeededInTank = fuelRequired;
    const minJumpFuelNeededInTank = jumpFuelRequired;

    if (minFuelNeededInTank > fuelCapacity) {
      return launchFailure(400, {
        code: "expedition_fuel_capacity_exceeded",
        capacity: fuelCapacity,
        required: minFuelNeededInTank,
      });
    }
    if (minJumpFuelNeededInTank > jumpFuelCapacity) {
      return launchFailure(400, {
        code: "expedition_jump_fuel_capacity_exceeded",
        capacity: jumpFuelCapacity,
        required: minJumpFuelNeededInTank,
      });
    }

    let targetFuelInTank = currentFuel;
    let targetJumpFuelInTank = currentJumpFuel;
    let fuelToTakeFromPlanet = 0;
    let jumpFuelToTakeFromPlanet = 0;

    if (launchInventoryPlanetId) {
      // Determine how much to load from the planet
      const extraFuelRequested = fuelLoaded ?? 0;
      const extraJumpFuelRequested = jumpFuelLoaded ?? 0;

      // We must have at least the minimum required fuel after loading
      targetFuelInTank = Math.max(
        minFuelNeededInTank,
        currentFuel + extraFuelRequested,
      );
      targetJumpFuelInTank = Math.max(
        minJumpFuelNeededInTank,
        currentJumpFuel + extraJumpFuelRequested,
      );

      // Cap at tank capacity
      targetFuelInTank = Math.min(targetFuelInTank, fuelCapacity);
      targetJumpFuelInTank = Math.min(targetJumpFuelInTank, jumpFuelCapacity);

      // Amount to take from planet inventory
      fuelToTakeFromPlanet = Math.max(0, targetFuelInTank - currentFuel);
      jumpFuelToTakeFromPlanet = Math.max(
        0,
        targetJumpFuelInTank - currentJumpFuel,
      );
    } else if ((fuelLoaded ?? 0) > 0 || (jumpFuelLoaded ?? 0) > 0) {
      return launchFailure(400, {
        code: "expedition_ship_not_on_planet",
      });
    }

    if (targetFuelInTank < minFuelNeededInTank) {
      return launchFailure(400, {
        code: "insufficient_resource",
        resourceId: "fuel",
        required: minFuelNeededInTank,
        available: targetFuelInTank,
      });
    }
    if (targetJumpFuelInTank < minJumpFuelNeededInTank) {
      return launchFailure(400, {
        code: "insufficient_resource",
        resourceId: JUMP_FUEL_RESOURCE_ID,
        required: minJumpFuelNeededInTank,
        available: targetJumpFuelInTank,
      });
    }

    if (fuelToTakeFromPlanet > 0 || jumpFuelToTakeFromPlanet > 0) {
      const launchCosts = [];
      if (fuelToTakeFromPlanet > 0) {
        launchCosts.push({ resourceId: "fuel", amount: fuelToTakeFromPlanet });
      }
      if (jumpFuelToTakeFromPlanet > 0) {
        launchCosts.push({
          resourceId: JUMP_FUEL_RESOURCE_ID,
          amount: jumpFuelToTakeFromPlanet,
        });
      }

      const fuelSpend = await spendResources(
        launchInventoryPlanetId!,
        launchCosts,
        tx,
      );
      if (!fuelSpend.success) {
        return launchFailure(400, {
          code: "insufficient_resource",
          resourceId:
            fuelSpend.details?.resourceId ??
            launchCosts[0]?.resourceId ??
            "fuel",
          required: fuelSpend.details?.required,
          available: fuelSpend.details?.available,
        });
      }
    }

    // Subtract the trip cost from the ship's tank. The fuel is consumed at launch.
    const remainingFuel = targetFuelInTank - fuelRequired;
    const remainingJumpFuel = targetJumpFuelInTank - jumpFuelRequired;

    // Update ship state: it's moving, no longer on a planet, and has remaining fuel
    const [expedition] = await tx
      .insert(expeditions)
      .values({
        shipId: shipRow.shipId,
        type: shipRow.shipTypeId,
        originPlanetId,
        targetX: resolvedTargetX.toString(),
        targetY: resolvedTargetY.toString(),
        targetZ: resolvedTargetZ.toString(),
        targetPlanetId: resolvedTargetPlanetId,
        status: "in_flight",
        eta,
        result: {
          routeMode,
          destinationSystemId: resolvedDestinationSystemId,
          fuelRequired,
          jumpFuelRequired,
          cargoLoaded,
          distance: travelDistance,
          requestedDistance: distance,
          originGateDistance: originGateDistance ?? undefined,
          targetGateDistance: targetGateDistance ?? undefined,
          originSystemId,
          originSystemPoint: originSystemPoint ?? undefined,
          targetSystemPoint,
          speed,
          engineFactor,
          returnTrip,
          ...(spaceportReservation ? { spaceportReservation } : {}),
        },
      })
      .returning();

    if (stationedOrigin) {
      await tx
        .update(expeditions)
        .set({
          status: "completed",
          returnedAt: new Date(),
        })
        .where(
          and(
            eq(expeditions.shipId, shipRow.shipId),
            eq(expeditions.status, "stationed"),
          ),
        );
    }

    const [updatedShip] = await tx
      .update(ships)
      .set({
        status: "moving",
        locationPlanetId: null,
        fuel: remainingFuel.toFixed(2),
        jumpFuel: remainingJumpFuel.toFixed(2),
        cargoJson: {
          loaded: cargoLoaded,
          // We keep these for legacy compatibility if needed,
          // though columns are now the source of truth.
          fuelRequired,
          jumpFuelRequired,
        },
      })
      .where(eq(ships.id, shipRow.shipId))
      .returning();

    return {
      success: true,
      status: 200,
      expedition,
      ship: updatedShip,
      queueItem: {
        id: expedition.id,
        completesAt: expedition.eta.toISOString(),
      },
    } satisfies LaunchExpeditionResult;
  });
}
