import { and, eq, isNull, sql } from "drizzle-orm";
import type { LaunchExpeditionRequest } from "@shared/types/expeditions.js";
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
    return {
      success: false,
      status: 400,
      error: "shipId is required",
    };
  }

  if (routeMode !== "local" && routeMode !== "jump_gate") {
    return {
      success: false,
      status: 400,
      error: "routeMode must be local or jump_gate",
    };
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
    return {
      success: false,
      status: 400,
      error:
        routeMode === "local"
          ? "targetX, targetY, targetZ, optional fuelLoaded, and cargoLoaded must be numbers"
          : "optional fuelLoaded and cargoLoaded must be numbers",
    };
  }

  if (routeMode === "jump_gate" && !destinationSystemId) {
    return {
      success: false,
      status: 400,
      error: "destinationSystemId is required for jump_gate routes",
    };
  }

  if (cargoLoaded < 0) {
    return {
      success: false,
      status: 400,
      error: "cargoLoaded must be 0 or greater",
    };
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
    return {
      success: false,
      status: 404,
      error: "Ship not found",
    };
  }

  if (shipRow.shipOwnerId !== userId) {
    return {
      success: false,
      status: 403,
      error: "Ship does not belong to you",
    };
  }

  if (shipRow.shipStatus !== "idle") {
    return {
      success: false,
      status: 400,
      error: "Ship must be idle before launch",
    };
  }

  if (!shipRow.shipLocationPlanetId || !shipRow.originPlanetId) {
    return {
      success: false,
      status: 400,
      error: "Ship must be located on a player planet",
    };
  }

  if (shipRow.shipRole === "logistics") {
    return {
      success: false,
      status: 400,
      error: "Cargo ships must use cargo transfer",
    };
  }

  if (
    routeMode === "jump_gate" &&
    shipRow.shipRole !== "recon" &&
    shipRow.shipRole !== "colonization"
  ) {
    return {
      success: false,
      status: 400,
      error: "Jump Gate expedition routes support recon and colonizer ships",
    };
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
      return {
        success: false,
        status: 400,
        error:
          gateState.lockedReason?.code === "jump_drive_required"
            ? "Jump Drive research level 1 required"
            : "Jump Gate is locked",
      };
    }

    if (gateState.calibration.status === "calibrating") {
      return {
        success: false,
        status: 400,
        error: "Jump Gate calibration is still in progress",
      };
    }

    const knownDestination = await defaultDb.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, userId),
        eq(discoveredSystems.systemId, destinationSystemId!),
      ),
    });
    if (!knownDestination) {
      return {
        success: false,
        status: 404,
        error: "Known destination not found",
      };
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
      return {
        success: false,
        status: 400,
        error: "Known destination is not a public Jump Gate target",
      };
    }

    jumpFuelRequired = JUMP_GATE_JUMP_FUEL_COST;

    resolvedDestinationSystemId = destinationSystem.id;
    resolvedTargetX = destinationSystem.sectorX;
    resolvedTargetY = destinationSystem.sectorY;
    resolvedTargetZ = destinationSystem.sectorZ;
  }

  if (shipRow.shipRole === "colonization" && !targetPlanetId) {
    return {
      success: false,
      status: 400,
      error: "Colonizer expeditions require targetPlanetId",
    };
  }

  if (cargoLoaded > shipRow.shipCargoCapacity) {
    return {
      success: false,
      status: 400,
      error: "not enough cargo capacity",
    };
  }

  let resolvedTargetPlanetId: string | null = null;
  let sameSystemPlanetDistance: number | null = null;
  if (targetPlanetId) {
    if (shipRow.shipRole !== "recon" && shipRow.shipRole !== "colonization") {
      return {
        success: false,
        status: 400,
        error:
          "targetPlanetId is only supported for recon or colonization expeditions",
      };
    }

    const targetPlanet = await defaultDb.query.planets.findFirst({
      where: eq(planets.id, targetPlanetId),
      with: { system: true },
    });

    if (!targetPlanet?.system) {
      return { success: false, status: 404, error: "Target planet not found" };
    }

    const sys = targetPlanet.system;
    if (routeMode === "jump_gate") {
      if (!destinationSystem || targetPlanet.systemId !== destinationSystem.id) {
        return {
          success: false,
          status: 400,
          error:
            "targetPlanetId must belong to the selected Jump Gate destination system",
        };
      }

      if (sys.isHome || sys.ownerId) {
        return {
          success: false,
          status: 400,
          error: "Jump Gate target planet must be in a public common system",
        };
      }
    } else {
      if (
        Math.trunc(resolvedTargetX) !== sys.sectorX ||
        Math.trunc(resolvedTargetY) !== sys.sectorY ||
        Math.trunc(resolvedTargetZ) !== sys.sectorZ
      ) {
        return {
          success: false,
          status: 400,
          error:
            "targetSector must match the target system sector when targetPlanetId is set",
        };
      }
    }

    if (shipRow.shipRole === "recon") {
      if (routeMode === "local" && (!sys.isHome || sys.ownerId !== userId)) {
        return {
          success: false,
          status: 400,
          error: "targetPlanetId must refer to a planet in your home system",
        };
      }

      const already = await defaultDb.query.discoveredPlanets.findFirst({
        where: and(
          eq(discoveredPlanets.userId, userId),
          eq(discoveredPlanets.planetId, targetPlanetId),
        ),
      });
      if (already) {
        return {
          success: false,
          status: 400,
          error: "Planet is already surveyed",
        };
      }
    } else {
      const gates = await checkColonizationGates(userId, targetPlanetId);
      if (!gates.allowed) {
        return {
          success: false,
          status: 400,
          error: gates.reason || "Colonization requirements not met",
        };
      }

      const eligibility = await colonyService.canColonize(userId, targetPlanetId);
      if (!eligibility.allowed) {
        return {
          success: false,
          status: 400,
          error: eligibility.reason || "Cannot colonize this planet",
        };
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
  const fuelRequired = calculateExpeditionRequiredFuel(
    travelDistance,
    Number(shipRow.shipFuelConsumption),
    !isOneWayColonization,
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
    const availableCargo = await getAvailableCargo(
      shipRow.shipLocationPlanetId!,
      tx,
    );
    if (availableCargo < cargoLoaded) {
      return {
        success: false,
        status: 400,
        error: "not enough cargo",
      } satisfies LaunchExpeditionResult;
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
      return {
        success: false,
        status: 400,
        error: fuelSpend.error || "not enough fuel",
      } satisfies LaunchExpeditionResult;
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
          returnTrip: !isOneWayColonization,
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
