import { Worker, Queue } from 'bullmq';
import { db } from '../db/index.js';

import {
  expeditions,
  ships,
  planets,
  systems,
  notifications,
  discoveredPlanets,
} from '../db/schema.js';

import { eq, or } from 'drizzle-orm';

import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { checkVisibility } from '../features/world/visibility.js';

const POLL_INTERVAL_MS = 30000;

/**
 * Calculates current position of a ship in an expedition using linear interpolation.
 */
export function calculateExpeditionPosition(
  expedition: typeof expeditions.$inferSelect,
  originSystem: { sectorX: number; sectorY: number; sectorZ: number },
  now: Date,
) {
  const { targetX, targetY, targetZ, eta, result, status } = expedition;
  if (!result || typeof result !== 'object') return { x: 0, y: 0, z: 0 };
  
  const { distance, speed, engineFactor } = result as any;
  if (distance === undefined || speed === undefined || engineFactor === undefined) {
    return { x: 0, y: 0, z: 0 };
  }

  const durationMs = (distance * 60 / speed) * engineFactor * 1000;

  const nowMs = now.getTime();
  const etaMs = eta.getTime();

  const originX = Number(originSystem.sectorX);
  const originY = Number(originSystem.sectorY);
  const originZ = Number(originSystem.sectorZ);

  if (status === 'in_flight') {
    const startTimeMs = etaMs - durationMs;
    if (nowMs <= startTimeMs) return { x: originX, y: originY, z: originZ };
    if (nowMs >= etaMs) return { x: targetX, y: targetY, z: targetZ };

    const progress = (nowMs - startTimeMs) / durationMs;
    return {
      x: Math.trunc(originX + (targetX - originX) * progress),
      y: Math.trunc(originY + (targetY - originY) * progress),
      z: Math.trunc(originZ + (targetZ - originZ) * progress),
    };
  } else if (status === 'returning') {
    // For 'returning', we assume it started returning at eta - durationMs
    const returnStartTimeMs = etaMs - durationMs;
    if (nowMs <= returnStartTimeMs) return { x: targetX, y: targetY, z: targetZ };
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

async function handleArrivalAtTarget(
  expedition: typeof expeditions.$inferSelect,
  tx: any,
) {
  const result = expedition.result as any;
  const durationMs = (result.distance * 60 / result.speed) * result.engineFactor * 1000;

  if (expedition.targetPlanetId && (expedition.type === 'scout' || expedition.type === 'recon_probe')) {
    const [ship] = await tx.select().from(ships).where(eq(ships.id, expedition.shipId)).limit(1);
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
      status: 'returning',
      eta: new Date(Date.now() + durationMs),
    })
    .where(eq(expeditions.id, expedition.id));

  logger.info(
    { expeditionId: expedition.id, shipId: expedition.shipId },
    'Expedition reached target, starting return journey',
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
      status: 'completed',
      returnedAt: now,
    })
    .where(eq(expeditions.id, expedition.id));

  // 2. Update ship status and return to origin planet
  await tx
    .update(ships)
    .set({
      status: 'idle',
      locationPlanetId: expedition.originPlanetId,
      cargoJson: {}, // Clear cargo if any
    })
    .where(eq(ships.id, expedition.shipId));

  logger.info(
    { expeditionId: expedition.id, shipId: expedition.shipId },
    'Expedition returned home and completed',
  );

  // Send notification
  const [ship] = await tx.select().from(ships).where(eq(ships.id, expedition.shipId)).limit(1);
  if (ship) {
    await tx.insert(notifications).values({
      userId: ship.ownerId,
      type: 'expedition_returned',
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
      originSectorX: systems.sectorX,
      originSectorY: systems.sectorY,
      originSectorZ: systems.sectorZ,
    })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .innerJoin(planets, eq(planets.id, expeditions.originPlanetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(
      or(
        eq(expeditions.status, 'in_flight'),
        eq(expeditions.status, 'returning'),
      ),
    );

  if (activeExpeditions.length === 0) return;

  for (const row of activeExpeditions) {
    const { expedition, shipId, originSectorX, originSectorY, originSectorZ } = row;
    const originSystem = { sectorX: originSectorX, sectorY: originSectorY, sectorZ: originSectorZ };

    await db.transaction(async (tx) => {
      // 1. Interpolate current position
      const pos = calculateExpeditionPosition(expedition, originSystem, now);

      // 2. Perform visibility check (fog of war)
      const discoveries = await checkVisibility(shipId, tx, pos);

      if (discoveries.length > 0) {
        logger.info(
          {
            shipId,
            expeditionId: expedition.id,
            newEntities: discoveries.length,
          },
          'New discoveries made by expedition',
        );
      }


      // 3. Handle arrival
      if (now >= expedition.eta) {
        if (expedition.status === 'in_flight') {
          await handleArrivalAtTarget(expedition, tx);
        } else if (expedition.status === 'returning') {
          await handleArrivalAtHome(expedition, tx);
        }
      }
    });
  }
}

export async function createExpeditionsWorker(): Promise<Worker> {
  const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  const queue = new Queue('expeditions_tick', { connection });
  await queue.add(
    'tick',
    {},
    {
      repeat: { every: POLL_INTERVAL_MS },
      removeOnComplete: { age: 0 },
      removeOnFail: { age: 60 },
    },
  );
  await queue.close();

  const worker = new Worker(
    'expeditions_tick',
    async () => {
      await processExpeditions();
    },
    { connection },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Expeditions worker: job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, name: job?.name, err: err.message },
      'Expeditions worker: job failed',
    );
  });

  return worker;
}
