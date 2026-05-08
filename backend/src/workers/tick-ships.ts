import { Worker } from 'bullmq';
import { db } from '../db/index.js';
import { ships } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

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

      await db
        .update(ships)
        .set({ status: 'idle' })
        .where(eq(ships.id, shipId));

      logger.info(
        { shipId, planetId, newStatus: 'idle', type: 'ship_built' },
        'Ship construction completed — notification stub',
      );
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
