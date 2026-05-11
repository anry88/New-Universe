import { Worker } from 'bullmq';
import { db } from '../db/index.js';
import { ships, notifications } from '../db/schema.js';

import { and, eq, isNotNull, lte } from 'drizzle-orm';

import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

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

export async function createShipsWorker(): Promise<Worker> {
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
