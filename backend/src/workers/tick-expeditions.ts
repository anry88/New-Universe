import { Worker, Queue } from "bullmq";
import { db } from "../db/index.js";

import {
  expeditions,
  ships,
  shipTypes,
  planets,
  systems,
  notifications,
  discoveredPlanets,
} from "../db/schema.js";

import { and, eq, inArray, or } from "drizzle-orm";

import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { checkVisibility } from "../features/world/visibility.js";
import {
  buildSystemMapLayouts,
  distancePointToSegment,
  interpolateSystemMapPoint,
  sectorDeltaToSystemMapPoint,
} from "@shared/format/systemMapLayout.js";

const POLL_INTERVAL_MS = 30000;
const HOME_PLANET_DISCOVERY_RADIUS = 72;

/**
 * Calculates current position of a ship in an expedition using linear interpolation.
 */
export function calculateExpeditionPosition(
  expedition: typeof expeditions.$inferSelect,
  originSystem: { sectorX: number; sectorY: number; sectorZ: number },
  now: Date,
) {
  const { targetX, targetY, targetZ, eta, result, status } = expedition;
  if (!result || typeof result !== "object") return { x: 0, y: 0, z: 0 };

  const { distance, speed, engineFactor } = result as any;
  if (
    distance === undefined ||
    speed === undefined ||
    engineFactor === undefined
  ) {
    return { x: 0, y: 0, z: 0 };
  }

  const durationMs = ((distance * 60) / speed) * engineFactor * 1000;

  const nowMs = now.getTime();
  const etaMs = eta.getTime();

  const originX = Number(originSystem.sectorX);
  const originY = Number(originSystem.sectorY);
  const originZ = Number(originSystem.sectorZ);

  if (status === "in_flight") {
    const startTimeMs = etaMs - durationMs;
    if (nowMs <= startTimeMs) return { x: originX, y: originY, z: originZ };
    if (nowMs >= etaMs) return { x: targetX, y: targetY, z: targetZ };

    const progress = (nowMs - startTimeMs) / durationMs;
    return {
      x: Math.trunc(originX + (targetX - originX) * progress),
      y: Math.trunc(originY + (targetY - originY) * progress),
      z: Math.trunc(originZ + (targetZ - originZ) * progress),
    };
  } else if (status === "returning") {
    // For 'returning', we assume it started returning at eta - durationMs
    const returnStartTimeMs = etaMs - durationMs;
    if (nowMs <= returnStartTimeMs)
      return { x: targetX, y: targetY, z: targetZ };
    if (nowMs >= etaMs) return { x: originX, y: originY, z: originZ };

    const progress = (nowMs - returnStartTimeMs) / durationMs;
    return {
      x: Math.trunc(targetX + (originX - targetX) * progress),
      y: Math.trunc(targetY + (originY - targetY) * progress),
      z: Math.trunc(targetZ + (originZ - targetZ) * progress),
    };
  }

  return { x: originX, y: originY, z: originZ };
}

function calculateExpeditionProgress(
  expedition: typeof expeditions.$inferSelect,
  now: Date,
): number {
  const result = expedition.result as any;
  if (!result || typeof result !== "object") return 0;

  const { distance, speed, engineFactor } = result;
  if (
    distance === undefined ||
    speed === undefined ||
    engineFactor === undefined
  )
    return 0;

  const durationMs = ((distance * 60) / speed) * engineFactor * 1000;
  if (durationMs <= 0) return 1;

  const startTimeMs = expedition.eta.getTime() - durationMs;
  return Math.max(0, Math.min(1, (now.getTime() - startTimeMs) / durationMs));
}

async function discoverHomePlanetsAlongRoute(
  expedition: typeof expeditions.$inferSelect,
  originSystem: {
    id: string;
    ownerId: string | null;
    isHome: boolean;
    seed: number;
    sectorX: number;
    sectorY: number;
  },
  ship: { id: string; ownerId: string; role: string },
  now: Date,
  tx: any,
) {
  if (
    !originSystem.isHome ||
    originSystem.ownerId !== ship.ownerId ||
    ship.role !== "recon"
  ) {
    return [];
  }

  const homePlanets = await tx
    .select({
      id: planets.id,
      biome: planets.biome,
      size: planets.size,
    })
    .from(planets)
    .where(eq(planets.systemId, originSystem.id));

  if (homePlanets.length === 0) return [];

  const planetIds = homePlanets.map((planet: { id: string }) => planet.id);
  const knownRows = await tx
    .select({ planetId: discoveredPlanets.planetId })
    .from(discoveredPlanets)
    .where(
      and(
        eq(discoveredPlanets.userId, ship.ownerId),
        inArray(discoveredPlanets.planetId, planetIds),
      ),
    );
  const knownPlanetIds = new Set(
    knownRows.map((row: { planetId: string }) => row.planetId),
  );

  const layouts = buildSystemMapLayouts(homePlanets, Number(originSystem.seed));
  const layoutByPlanetId = new Map(
    layouts.map((layout) => [layout.id, layout]),
  );
  const origin = layoutByPlanetId.get(expedition.originPlanetId);
  if (!origin) return [];

  const targetPlanet = expedition.targetPlanetId
    ? layoutByPlanetId.get(expedition.targetPlanetId)
    : null;
  const routeEnd = targetPlanet
    ? { x: targetPlanet.x, y: targetPlanet.y }
    : sectorDeltaToSystemMapPoint(
        { x: origin.x, y: origin.y },
        Number(expedition.targetX) - Number(originSystem.sectorX),
        Number(expedition.targetY) - Number(originSystem.sectorY),
      );

  const progress = calculateExpeditionProgress(expedition, now);
  const segmentStart =
    expedition.status === "returning" ? routeEnd : { x: origin.x, y: origin.y };
  const segmentFullEnd =
    expedition.status === "returning" ? { x: origin.x, y: origin.y } : routeEnd;
  const segmentEnd = interpolateSystemMapPoint(
    segmentStart,
    segmentFullEnd,
    progress,
  );

  const newlyVisiblePlanets = layouts
    .filter((layout) => !knownPlanetIds.has(layout.id))
    .filter((layout) => layout.id !== expedition.originPlanetId)
    .filter(
      (layout) =>
        distancePointToSegment(layout, segmentStart, segmentEnd) <=
        HOME_PLANET_DISCOVERY_RADIUS,
    );

  if (newlyVisiblePlanets.length === 0) return [];

  await tx
    .insert(discoveredPlanets)
    .values(
      newlyVisiblePlanets.map((layout) => ({
        userId: ship.ownerId,
        planetId: layout.id,
      })),
    )
    .onConflictDoNothing();

  return newlyVisiblePlanets.map((layout) => ({
    type: "planet" as const,
    id: layout.id,
    name: "Home planet",
  }));
}

async function handleArrivalAtTarget(
  expedition: typeof expeditions.$inferSelect,
  tx: any,
) {
  const result = expedition.result as any;
  const durationMs =
    ((result.distance * 60) / result.speed) * result.engineFactor * 1000;

  if (
    expedition.targetPlanetId &&
    (expedition.type === "scout" || expedition.type === "recon_probe")
  ) {
    const [ship] = await tx
      .select()
      .from(ships)
      .where(eq(ships.id, expedition.shipId))
      .limit(1);
    if (ship) {
      await tx
        .insert(discoveredPlanets)
        .values({ userId: ship.ownerId, planetId: expedition.targetPlanetId })
        .onConflictDoNothing();
    }
  }

  // Start return journey
  await tx
    .update(expeditions)
    .set({
      status: "returning",
      eta: new Date(Date.now() + durationMs),
    })
    .where(eq(expeditions.id, expedition.id));

  logger.info(
    { expeditionId: expedition.id, shipId: expedition.shipId },
    "Expedition reached target, starting return journey",
  );
}

async function handleArrivalAtHome(
  expedition: typeof expeditions.$inferSelect,
  tx: any,
) {
  const now = new Date();

  // 1. Mark expedition as completed
  await tx
    .update(expeditions)
    .set({
      status: "completed",
      returnedAt: now,
    })
    .where(eq(expeditions.id, expedition.id));

  // 2. Update ship status and return to origin planet
  await tx
    .update(ships)
    .set({
      status: "idle",
      locationPlanetId: expedition.originPlanetId,
      cargoJson: {}, // Clear cargo if any
    })
    .where(eq(ships.id, expedition.shipId));

  logger.info(
    { expeditionId: expedition.id, shipId: expedition.shipId },
    "Expedition returned home and completed",
  );

  // Send notification
  const [ship] = await tx
    .select()
    .from(ships)
    .where(eq(ships.id, expedition.shipId))
    .limit(1);
  if (ship) {
    await tx.insert(notifications).values({
      userId: ship.ownerId,
      type: "expedition_returned",
      payload: {
        expeditionId: expedition.id,
        shipId: ship.id,
        typeId: ship.typeId,
      },
    });
  }
}

export async function processExpeditions(): Promise<void> {
  const now = new Date();
  const activeExpeditions = await db
    .select({
      expedition: expeditions,
      shipId: ships.id,
      shipOwnerId: ships.ownerId,
      shipRole: shipTypes.role,
      originSectorX: systems.sectorX,
      originSectorY: systems.sectorY,
      originSectorZ: systems.sectorZ,
      originSystemId: systems.id,
      originSystemOwnerId: systems.ownerId,
      originSystemIsHome: systems.isHome,
      originSystemSeed: systems.seed,
    })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .innerJoin(planets, eq(planets.id, expeditions.originPlanetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(
      or(
        eq(expeditions.status, "in_flight"),
        eq(expeditions.status, "returning"),
      ),
    );

  if (activeExpeditions.length === 0) return;

  for (const row of activeExpeditions) {
    const {
      expedition,
      shipId,
      shipOwnerId,
      shipRole,
      originSectorX,
      originSectorY,
      originSectorZ,
      originSystemId,
      originSystemOwnerId,
      originSystemIsHome,
      originSystemSeed,
    } = row;
    const originSystem = {
      sectorX: originSectorX,
      sectorY: originSectorY,
      sectorZ: originSectorZ,
    };

    await db.transaction(async (tx) => {
      // 1. Interpolate current position
      const pos = calculateExpeditionPosition(expedition, originSystem, now);

      // 2. Perform visibility check (fog of war)
      const discoveries = await checkVisibility(shipId, tx, pos);
      const homeDiscoveries = await discoverHomePlanetsAlongRoute(
        expedition,
        {
          id: originSystemId,
          ownerId: originSystemOwnerId,
          isHome: originSystemIsHome,
          seed: originSystemSeed,
          sectorX: originSectorX,
          sectorY: originSectorY,
        },
        { id: shipId, ownerId: shipOwnerId, role: shipRole },
        now,
        tx,
      );

      if (discoveries.length + homeDiscoveries.length > 0) {
        logger.info(
          {
            shipId,
            expeditionId: expedition.id,
            newEntities: discoveries.length + homeDiscoveries.length,
          },
          "New discoveries made by expedition",
        );
      }

      // 3. Handle arrival
      if (now >= expedition.eta) {
        if (expedition.status === "in_flight") {
          await handleArrivalAtTarget(expedition, tx);
        } else if (expedition.status === "returning") {
          await handleArrivalAtHome(expedition, tx);
        }
      }
    });
  }
}

export async function createExpeditionsWorker(): Promise<Worker> {
  const Redis = (await import("ioredis")).default as unknown as new (
    ...args: any[]
  ) => any;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  const queue = new Queue("expeditions_tick", { connection });
  await queue.add(
    "tick",
    {},
    {
      repeat: { every: POLL_INTERVAL_MS },
      removeOnComplete: { age: 0 },
      removeOnFail: { age: 60 },
    },
  );
  await queue.close();

  const worker = new Worker(
    "expeditions_tick",
    async () => {
      await processExpeditions();
    },
    { connection },
  );

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, name: job.name },
      "Expeditions worker: job completed",
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, name: job?.name, err: err.message },
      "Expeditions worker: job failed",
    );
  });

  return worker;
}
