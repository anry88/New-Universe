import { db } from '../db/index.js';
import { ships, notifications } from '../db/schema.js';

import { and, eq, isNotNull, lte } from 'drizzle-orm';

import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import {
  createIntervalWorker,
  removeLegacyRepeatableJobs,
  type WorkerHandle,
} from './scheduler.js';

const POLL_INTERVAL_MS = 30000;

export async function completeShipBuildJob(
  shipId: string,
  planetId: string | null,
  now: Date = new Date(),
): Promise<boolean> {
  const [completedShip] = await db
    .update(ships)
    .set({ status: 'idle', queueCompletesAt: null })
    .where(
      and(
        eq(ships.id, shipId),
        eq(ships.status, 'building'),
        isNotNull(ships.queueCompletesAt),
        lte(ships.queueCompletesAt, now),
      ),
    )
    .returning({
      id: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
    });

  if (!completedShip) {
    logger.info({ shipId, planetId }, 'Ship build completion skipped; already finalized or not due');
    return false;
  }

  await db.insert(notifications).values({
    userId: completedShip.ownerId,
    type: 'ship_done',
    payload: {
      shipId,
      typeId: completedShip.typeId,
      planetId,
    },
  });

  logger.info(
    { shipId, planetId, newStatus: 'idle', userId: completedShip.ownerId },
    'Ship construction completed',
  );

  return true;
}

export async function processDueShips(): Promise<number> {
  const now = new Date();

  const dueShips = await db
    .select({
      id: ships.id,
      planetId: ships.locationPlanetId,
    })
    .from(ships)
    .where(
      and(
        eq(ships.status, 'building'),
        isNotNull(ships.queueCompletesAt),
        lte(ships.queueCompletesAt, now),
      ),
    );

  let completed = 0;
  for (const ship of dueShips) {
    const didComplete = await completeShipBuildJob(ship.id, ship.planetId ?? null, now);
    if (didComplete) {
      completed += 1;
    }
  }

  return completed;
}

export async function createShipsWorker(): Promise<WorkerHandle> {
  if (env.ENABLE_BULLMQ) {
    await removeLegacyRepeatableJobs('ships', { name: 'complete-build' });

    const { Worker } = await import('bullmq');
    const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
    const connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    const worker = new Worker(
      'ships',
      async (job) => {
        const { shipId, planetId } = job.data;

        logger.info({ shipId, planetId, jobId: job.id }, 'Completing ship build');

        await completeShipBuildJob(shipId, planetId ?? null);
      },
      { connection },
    );

    worker.on('completed', (job) => {
      logger.info({ jobId: job.id, shipId: job.data.shipId }, 'Ships worker: job completed');
    });

    worker.on('failed', (job, err) => {
      logger.error(
        { jobId: job?.id, shipId: job?.data?.shipId, err: err.message },
        'Ships worker: job failed',
      );
    });

    return worker;
  }

  return createIntervalWorker(
    'Ships',
    POLL_INTERVAL_MS,
    async () => {
      const completed = await processDueShips();
      if (completed > 0) {
        logger.info({ completed }, 'Ships worker: poll completed rows');
      }
    },
    { runOnStart: true },
  );
}
