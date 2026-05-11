import { and, eq, sql } from "drizzle-orm";
import { db as defaultDb } from "../../db/index.js";
import {
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

export interface LaunchExpeditionRequest {
  shipId: string;
  targetX: number;
  targetY: number;
  targetZ: number;
  /** Deprecated client hint. Fuel is calculated server-side from distance and ship consumption. */
  fuelLoaded?: number;
  cargoLoaded: number;
  /** When set, scout completes planetary survey of this body in the player's home system at arrival. */
  targetPlanetId?: string | null;
}

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

function calculateRequiredFuel(
  distance: number,
  fuelConsumption: number,
): number {
  const perLy =
    Number.isFinite(fuelConsumption) && fuelConsumption > 0
      ? fuelConsumption
      : 1;
  return Math.max(1, Math.ceil(distance * 2 * perLy));
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
  } = request;

  if (!shipId) {
    return {
      success: false,
      status: 400,
      error: "shipId is required",
    };
  }

  if (
    !isFiniteNumber(targetX) ||
    !isFiniteNumber(targetY) ||
    !isFiniteNumber(targetZ) ||
    (fuelLoaded !== undefined && !isFiniteNumber(fuelLoaded)) ||
    !isFiniteNumber(cargoLoaded)
  ) {
    return {
      success: false,
      status: 400,
      error:
        "targetX, targetY, targetZ, optional fuelLoaded, and cargoLoaded must be numbers",
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

  if (cargoLoaded > shipRow.shipCargoCapacity) {
    return {
      success: false,
      status: 400,
      error: "not enough cargo capacity",
    };
  }

  let resolvedTargetPlanetId: string | null = null;
  if (targetPlanetId) {
    if (shipRow.shipRole !== "recon") {
      return {
        success: false,
        status: 400,
        error: "targetPlanetId is only supported for recon expeditions",
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
    if (!sys.isHome || sys.ownerId !== userId) {
      return {
        success: false,
        status: 400,
        error: "targetPlanetId must refer to a planet in your home system",
      };
    }

    if (
      Math.trunc(targetX) !== sys.sectorX ||
      Math.trunc(targetY) !== sys.sectorY ||
      Math.trunc(targetZ) !== sys.sectorZ
    ) {
      return {
        success: false,
        status: 400,
        error:
          "targetSector must match the home system sector when targetPlanetId is set",
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

    resolvedTargetPlanetId = targetPlanetId;
  }

  const distance = Math.sqrt(
    Math.pow(targetX - Number(shipRow.originX), 2) +
      Math.pow(targetY - Number(shipRow.originY), 2) +
      Math.pow(targetZ - Number(shipRow.originZ), 2),
  );
  const travelDistance = resolvedTargetPlanetId
    ? Math.max(1, distance)
    : distance;
  const fuelRequired = calculateRequiredFuel(
    travelDistance,
    Number(shipRow.shipFuelConsumption),
  );
  const researchEffects = await getResearchEffectsForUser(userId, defaultDb);
  const speed = applyShipSpeed(Number(shipRow.shipSpeed), researchEffects);
  const engineFactor = 1;
  const etaSeconds = Math.max(
    0,
    Math.ceil(((travelDistance * 60) / speed) * engineFactor),
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

    const fuelSpend = await spendResources(
      shipRow.shipLocationPlanetId!,
      [{ resourceId: "fuel", amount: fuelRequired }],
      tx,
    );
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
        targetX: Math.trunc(targetX),
        targetY: Math.trunc(targetY),
        targetZ: Math.trunc(targetZ),
        targetPlanetId: resolvedTargetPlanetId,
        status: "in_flight",
        eta,
        result: {
          fuelRequired,
          cargoLoaded,
          distance: travelDistance,
          requestedDistance: distance,
          speed,
          engineFactor,
        },
      })
      .returning();

    const [updatedShip] = await tx
      .update(ships)
      .set({
        status: "moving",
        cargoJson: {
          loaded: cargoLoaded,
          fuelRequired,
        },
      })
      .where(eq(ships.id, shipRow.shipId))
      .returning();

    try {
      const { Queue: BullQueue } = await import("bullmq");
      const Redis = (await import("ioredis")).default as unknown as new (
        ...args: any[]
      ) => any;
      const redis = new Redis(
        process.env.REDIS_URL || "redis://localhost:6379",
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
