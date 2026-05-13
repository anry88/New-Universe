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
  colonies,
  buildings,
} from "../db/schema.js";
import { bootstrapColony } from "../features/colonies/bootstrap.js";
import { checkColonizationGates } from "../features/colonies/colonization-rules.js";
import { colonyService } from "../features/colonies/colonies.js";

import { and, eq, inArray, or } from "drizzle-orm";

import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { checkVisibility } from "../features/world/visibility.js";
import { completeCargoTransfer } from "../features/logistics/cargo-transfer.js";
import {
  buildSystemMapLayouts,
  distancePointToSegment,
  interpolateSystemMapPoint,
  sectorDeltaToSystemMapPoint,
  systemMapPlanetDiscoveryRadius,
} from "@shared/format/systemMapLayout.js";

const POLL_INTERVAL_MS = 30000;

/**
 * Calculates current position of a ship in an expedition using linear interpolation.
 */
export function calculateExpeditionPosition(
  expedition: typeof expeditions.$inferSelect,
  originSystem: { sectorX: number; sectorY: number; sectorZ: number },
  now: Date,
) {
  const { targetX, targetY, eta, result, status } = expedition;
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

  const tX = Number(targetX);
  const tY = Number(targetY);

  if (status === "in_flight") {
    const startTimeMs = etaMs - durationMs;
    if (nowMs <= startTimeMs) return { x: originX, y: originY, z: originZ };
    if (nowMs >= etaMs) return { x: tX, y: tY, z: originZ };

    const progress = (nowMs - startTimeMs) / durationMs;
    return {
      x: originX + (tX - originX) * progress,
      y: originY + (tY - originY) * progress,
      z: originZ,
    };
  } else if (status === "returning") {
    // For 'returning', we assume it started returning at eta - durationMs
    const returnStartTimeMs = etaMs - durationMs;
    if (nowMs <= returnStartTimeMs)
      return { x: tX, y: tY, z: originZ };
    if (nowMs >= etaMs) return { x: originX, y: originY, z: originZ };

    const progress = (nowMs - returnStartTimeMs) / durationMs;
    return {
      x: tX + (originX - tX) * progress,
      y: tY + (originY - tY) * progress,
      z: originZ,
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
      name: planets.name,
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
        systemMapPlanetDiscoveryRadius(layout),
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
  options: { skipNotifications?: boolean } = {},
) {
  const result = expedition.result as any;
  const durationMs =
    ((result.distance * 60) / result.speed) * result.engineFactor * 1000;

  if (expedition.type === "cargo_transfer") {
    await completeCargoTransfer(expedition, expedition.shipId, tx, options);
    logger.info(
      { expeditionId: expedition.id, shipId: expedition.shipId },
      "Cargo transfer reached target and completed one-way delivery",
    );
    return;
  }

  if (expedition.type === "scout" || expedition.type === "recon_probe") {
    const [ship] = await tx
      .select()
      .from(ships)
      .where(eq(ships.id, expedition.shipId))
      .limit(1);

    if (ship) {
      if (expedition.targetPlanetId) {
        await tx
          .insert(discoveredPlanets)
          .values({ userId: ship.ownerId, planetId: expedition.targetPlanetId })
          .onConflictDoNothing();
      } else {
        // Targeted by coordinates — the discoverHomePlanetsAlongRoute logic
        // in processExpeditions already checks the segment to routeEnd.
        // If it arrived exactly, it will catch it there.
      }
    }
  }

  // Colonizer arrivals are a special case: the ship is the seed for a new
  // colony. On arrival at a discovered, eligible planet we consume the
  // ship, plant a level-1 command_center instantly, bootstrap the colony,
  // and complete the expedition (no return trip).
  if (expedition.type === "colonizer" && expedition.targetPlanetId) {
    const colonized = await autoColonizeAtTarget(expedition, tx, options);
    if (colonized) {
      await tx.delete(expeditions).where(eq(expeditions.id, expedition.id));
      logger.info(
        {
          expeditionId: expedition.id,
          shipId: expedition.shipId,
          planetId: expedition.targetPlanetId,
        },
        "Colonizer arrived: planted command center and consumed ship",
      );
      return;
    }
    // Fall-through if colonization gates failed — start the return trip so
    // the ship comes home rather than getting stuck in space.
  }

  // Start return journey from the moment we SHOULD have arrived
  const arrivalTime = expedition.eta.getTime();
  const returnEta = new Date(arrivalTime + durationMs);

  await tx
    .update(expeditions)
    .set({
      status: "returning",
      eta: returnEta,
    })
    .where(eq(expeditions.id, expedition.id));

  logger.info(
    { expeditionId: expedition.id, shipId: expedition.shipId },
    "Expedition reached target, starting return journey",
  );
}

/**
 * Performs in-flight colonization when a colonizer ship arrives at its
 * target. Returns true if a colony was created, false if the planet was
 * ineligible (in which case the caller should send the ship home).
 *
 * Mirrors `foundColony` but is callable inside an existing transaction.
 */
async function autoColonizeAtTarget(
  expedition: typeof expeditions.$inferSelect,
  tx: any,
  options: { skipNotifications?: boolean } = {},
): Promise<boolean> {
  if (!expedition.targetPlanetId) return false;

  const [ship] = await tx
    .select()
    .from(ships)
    .where(eq(ships.id, expedition.shipId))
    .limit(1);
  if (!ship) return false;

  // Gate checks (research, distance, cooldown, planet eligibility). If
  // any gate fails the colonizer turns around and flies home.
  const gates = await checkColonizationGates(
    ship.ownerId,
    expedition.targetPlanetId,
  );
  if (!gates.allowed) {
    logger.warn(
      {
        expeditionId: expedition.id,
        shipId: expedition.shipId,
        reason: gates.reason,
      },
      "Colonizer arrival blocked by gates, returning home",
    );
    return false;
  }

  const eligibility = await colonyService.canColonize(
    ship.ownerId,
    expedition.targetPlanetId,
  );
  if (!eligibility.allowed) {
    logger.warn(
      {
        expeditionId: expedition.id,
        shipId: expedition.shipId,
        reason: eligibility.reason,
      },
      "Colonizer arrival blocked: planet ineligible, returning home",
    );
    return false;
  }

  // Claim the planet before consuming the hull so a duplicate/racing arrival
  // cannot delete a colonizer after another expedition already founded there.
  const [createdColony] = await tx
    .insert(colonies)
    .values({
      ownerId: ship.ownerId,
      planetId: expedition.targetPlanetId,
    })
    .onConflictDoNothing({ target: colonies.planetId })
    .returning();
  if (!createdColony) return false;

  // Consume the ship: the colonizer hull becomes the command center.
  await tx.delete(ships).where(eq(ships.id, expedition.shipId));

  // Plant the command center at slot 0 instantly (no queue).
  await tx.insert(buildings).values({
    planetId: expedition.targetPlanetId,
    typeId: "command_center",
    level: 1,
    slotIndex: 0,
  });

  // Bootstrap economy.
  await bootstrapColony(expedition.targetPlanetId, tx);

  if (!options.skipNotifications) {
    await tx.insert(notifications).values({
      userId: ship.ownerId,
      type: "colony_founded",
      payload: {
        expeditionId: expedition.id,
        planetId: expedition.targetPlanetId,
        shipId: ship.id,
      },
    });
  }

  return true;
}

async function handleArrivalAtHome(
  expedition: typeof expeditions.$inferSelect,
  tx: any,
  options: { skipNotifications?: boolean } = {},
) {
  // 1. Mark expedition as completed (or delete it to clean up the map immediately)
  // The user requested to delete it: "его нужо удалять"
  await tx.delete(expeditions).where(eq(expeditions.id, expedition.id));

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
    "Expedition returned home and deleted",
  );

  // Send notification
  const [ship] = await tx
    .select()
    .from(ships)
    .where(eq(ships.id, expedition.shipId))
    .limit(1);
  if (ship && !options.skipNotifications) {
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

export async function processExpeditions(
  options: { userId?: string; skipNotifications?: boolean; now?: Date } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const activeConditions = [
    or(
      eq(expeditions.status, "in_flight"),
      eq(expeditions.status, "returning"),
    ),
  ];
  if (options.userId) {
    activeConditions.push(eq(ships.ownerId, options.userId));
  }

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
    .where(and(...activeConditions));

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
          await handleArrivalAtTarget(expedition, tx, {
            skipNotifications: options.skipNotifications,
          });
        } else if (expedition.status === "returning") {
          if (expedition.type === "cargo_transfer") {
            await completeCargoTransfer(expedition, expedition.shipId, tx, {
              skipNotifications: options.skipNotifications,
            });
            return;
          }
          await handleArrivalAtHome(expedition, tx, {
            skipNotifications: options.skipNotifications,
          });
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
