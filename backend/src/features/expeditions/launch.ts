import { and, eq, isNull, sql } from "drizzle-orm";
import {
  formatLaunchExpeditionErrorMessage,
  type LaunchExpeditionErrorCode,
  type LaunchExpeditionErrorDetails,
  type LaunchExpeditionRequest,
} from "@shared/types/expeditions.js";
import type { ExpeditionRouteMode } from "@shared/config/expeditionRouting.js";
import {
  calculateExpeditionEtaSeconds,
  calculateExpeditionRequiredFuel,
  calculateSectorRouteDistance,
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
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
import { systemMapPlanetDistanceLy } from "@shared/format/systemMapLayout.js";
import { env } from "../../lib/env.js";
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
  originSystemId: string;
  originSystemSeed: number;
  originX: number;
  originY: number;
  originZ: number;
  originPlanetId: string;
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

async function getAvailableCargo(planetId: string, tx: any): Promise<number> {
  const rows = await tx
    .select({
      total: sql<number>`COALESCE(SUM(${planetResources.amount}), 0)`,
    })
    .from(planetResources)
    .where(eq(planetResources.planetId, planetId));

  return Number(rows[0]?.total ?? 0);
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
    cargoLoaded,
    targetPlanetId,
    destinationSystemId,
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
  if (
    localRouteTargetInvalid ||
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

  if (shipRow.shipStatus !== "idle") {
    return launchFailure(400, { code: "expedition_ship_not_idle" });
  }

  if (!shipRow.shipLocationPlanetId || !shipRow.originPlanetId) {
    return launchFailure(400, { code: "expedition_ship_not_on_planet" });
  }

  if (shipRow.shipRole === "logistics") {
    return launchFailure(400, {
      code: "expedition_logistics_route_required",
      shipTypeId: shipRow.shipTypeId,
    });
  }

  if (
    routeMode === "jump_gate" &&
    shipRow.shipRole !== "recon" &&
    shipRow.shipRole !== "colonization"
  ) {
    return launchFailure(400, { code: "expedition_jump_gate_role_required" });
  }

  let resolvedTargetX = routeMode === "local" ? targetX! : 0;
  let resolvedTargetY = routeMode === "local" ? targetY! : 0;
  let resolvedTargetZ = routeMode === "local" ? targetZ! : 0;
  let resolvedDestinationSystemId: string | null = null;
  let jumpFuelRequired = 0;
  let destinationSystem: typeof systems.$inferSelect | null = null;

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

    const knownDestination = await defaultDb.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, userId),
        eq(discoveredSystems.systemId, destinationSystemId!),
      ),
    });
    if (!knownDestination) {
      return launchFailure(404, { code: "expedition_known_destination_not_found" });
    }

    destinationSystem =
      (await defaultDb.query.systems.findFirst({
        where: and(
          eq(systems.id, destinationSystemId!),
          eq(systems.isHome, false),
          isNull(systems.ownerId),
        ),
      })) ?? null;
    if (!destinationSystem) {
      return launchFailure(400, { code: "expedition_known_destination_not_public" });
    }

    jumpFuelRequired = JUMP_GATE_JUMP_FUEL_COST;

    resolvedDestinationSystemId = destinationSystem.id;
    resolvedTargetX = destinationSystem.sectorX;
    resolvedTargetY = destinationSystem.sectorY;
    resolvedTargetZ = destinationSystem.sectorZ;
  }

  if (shipRow.shipRole === "colonization" && !targetPlanetId) {
    return launchFailure(400, { code: "expedition_colonizer_target_required" });
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
      if (!destinationSystem || targetPlanet.systemId !== destinationSystem.id) {
        return launchFailure(400, { code: "expedition_target_wrong_gate_destination" });
      }

      if (sys.isHome || sys.ownerId) {
        return launchFailure(400, { code: "expedition_target_not_public" });
      }
    } else {
      if (
        Math.trunc(resolvedTargetX) !== sys.sectorX ||
        Math.trunc(resolvedTargetY) !== sys.sectorY ||
        Math.trunc(resolvedTargetZ) !== sys.sectorZ
      ) {
        return launchFailure(400, { code: "expedition_target_sector_mismatch" });
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
        return launchFailure(400, { code: "expedition_target_already_surveyed" });
      }
    } else if (shipRow.shipRole === "colonization") {
      const gates = await checkColonizationGates(userId, targetPlanetId);
      if (!gates.allowed) {
        return launchFailure(400, {
          code: "expedition_colonization_blocked",
          reason: gates.reason,
        });
      }

      const eligibility = await colonyService.canColonize(userId, targetPlanetId);
      if (!eligibility.allowed) {
        return launchFailure(400, {
          code: "expedition_colonization_blocked",
          reason: eligibility.reason,
        });
      }
    }

    if (targetPlanet.systemId === shipRow.originSystemId) {
      const systemPlanets = await defaultDb.query.planets.findMany({
        where: eq(planets.systemId, shipRow.originSystemId),
      });
      sameSystemPlanetDistance = systemMapPlanetDistanceLy(
        systemPlanets,
        Number(shipRow.originSystemSeed),
        shipRow.originPlanetId,
        targetPlanet.id,
      );
    }

    resolvedTargetPlanetId = targetPlanetId;
  }

  // Galactic travel is modeled on the sector XY plane only so map routes, fuel,
  // ETA, and expedition ticks stay aligned with the 2D system map / corridor
  // discovery logic (which never used Z in layout space).
  const ox = Number(shipRow.originX);
  const oy = Number(shipRow.originY);
  const distance =
    routeMode === "jump_gate"
      ? calculateSectorRouteDistance(
          { x: ox, y: oy },
          { x: resolvedTargetX, y: resolvedTargetY },
        )
      : sameSystemPlanetDistance ??
        calculateSectorRouteDistance(
          { x: ox, y: oy },
          { x: resolvedTargetX, y: resolvedTargetY },
        );
  const travelDistance =
    resolvedTargetPlanetId || routeMode === "jump_gate"
      ? Math.max(1, distance)
      : distance;
  const isOneWayColonization =
    shipRow.shipRole === "colonization" && resolvedTargetPlanetId !== null;
  const returnTrip = !isOneWayColonization;
  const spaceportReservation = buildExpeditionSpaceportReservation({
    originPlanetId: shipRow.originPlanetId,
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
    if (
      spaceportReservation?.targetPlanetId
    ) {
      const usage = await loadLandingSlotUsage(tx, spaceportReservation.targetPlanetId, {
        lock: true,
      });

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

    const availableCargo = await getAvailableCargo(
      shipRow.shipLocationPlanetId!,
      tx,
    );
    if (availableCargo < cargoLoaded) {
      return launchFailure(400, { code: "expedition_cargo_unavailable" });
    }

    const launchCosts = [{ resourceId: "fuel", amount: fuelRequired }];
    if (jumpFuelRequired > 0) {
      launchCosts.push({
        resourceId: JUMP_FUEL_RESOURCE_ID,
        amount: jumpFuelRequired,
      });
    }

    const fuelSpend = await spendResources(shipRow.shipLocationPlanetId!, launchCosts, tx);
    if (!fuelSpend.success) {
      return launchFailure(400, {
        code: "insufficient_resource",
        resourceId: fuelSpend.details?.resourceId ?? launchCosts[0]?.resourceId ?? "fuel",
        required: fuelSpend.details?.required,
        available: fuelSpend.details?.available,
      });
    }

    const [expedition] = await tx
      .insert(expeditions)
      .values({
        shipId: shipRow.shipId,
        type: shipRow.shipTypeId,
        originPlanetId: shipRow.originPlanetId,
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
          speed,
          engineFactor,
          returnTrip,
          ...(spaceportReservation ? { spaceportReservation } : {}),
        },
      })
      .returning();

    const shipUpdate: Partial<typeof ships.$inferInsert> = {
      status: "moving",
      cargoJson: {
        loaded: cargoLoaded,
        fuelRequired,
        jumpFuelRequired,
      },
    };
    const [updatedShip] = await tx
      .update(ships)
      .set(shipUpdate)
      .where(eq(ships.id, shipRow.shipId))
      .returning();

    if (env.ENABLE_BULLMQ) {
      try {
        const { Queue: BullQueue } = await import("bullmq");
        const Redis = (await import("ioredis")).default as unknown as new (
          ...args: any[]
        ) => any;
        const redis = new Redis(
          env.REDIS_URL,
          {
            maxRetriesPerRequest: null,
            lazyConnect: true,
          },
        );
        const expeditionQueue = new BullQueue("expeditions", {
          connection: redis,
        });
        await expeditionQueue.add(
          "arrive",
          {
            expeditionId: expedition.id,
            shipId: shipRow.shipId,
          },
          {
            delay: etaSeconds * 1000,
          },
        );
        await expeditionQueue.close();
        await redis.quit();
      } catch (err) {
        // Redis/BullMQ is optional in tests/local runs; ignore enqueue failures.
        void err;
      }
    }

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
