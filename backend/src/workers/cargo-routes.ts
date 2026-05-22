import { db } from '../db/index.js';
import { expeditions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { completeCargoTransfer } from '../features/logistics/cargo-transfer.js';
import type { WorkerHandle } from './scheduler.js';

/**
 * Processes the arrival of a cargo transfer.
 * Idempotent: checks if the expedition is already completed.
 */
export async function processArriveCargo(job: any): Promise<void> {
  const { expeditionId, shipId } = job.data;
  if (!expeditionId || !shipId) {
    logger.error({ jobId: job.id, data: job.data }, 'Cargo worker: Missing required data in job');
    return;
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Get expedition
      const [expedition] = await tx
        .select()
        .from(expeditions)
        .where(eq(expeditions.id, expeditionId))
        .limit(1);

      if (!expedition) {
        logger.warn({ expeditionId }, 'Cargo worker: Expedition not found');
        return;
      }

      // Idempotency check: if already completed, skip processing
      if (expedition.status === 'completed') {
        logger.info({ expeditionId }, 'Cargo worker: Expedition already completed, skipping');
        return;
      }

      if (expedition.type !== 'cargo_transfer') {
        logger.error({ expeditionId, type: expedition.type }, 'Cargo worker: Invalid expedition type');
        return;
      }

      const result = expedition.result as any;
      if (!result || !expedition.targetPlanetId) {
        logger.error({ expeditionId }, 'Cargo worker: Malformed expedition result or missing targetPlanetId');
        // Mark as failed to avoid infinite retries if the data is broken
        await tx
          .update(expeditions)
          .set({ status: 'failed' })
          .where(eq(expeditions.id, expeditionId));
        return;
      }

      const completed = await completeCargoTransfer(expedition, shipId, tx);
      if (!completed) {
        logger.info({ expeditionId }, 'Cargo worker: Expedition already settled or not active, skipping');
        return;
      }

      logger.info({ expeditionId, shipId }, 'Cargo worker: Transfer completed successfully');
    });
  } catch (err: any) {
    logger.error({ expeditionId, err: err.message }, 'Cargo worker: Failed to process arrival');
    throw err; // Re-throw to trigger BullMQ retry
  }
}

/**
 * Creates and returns the Cargo Routes worker instance.
 */
export async function createCargoRoutesWorker(): Promise<WorkerHandle> {
  if (!env.ENABLE_BULLMQ) {
    return {
      async close() {},
    };
  }

  const { Worker } = await import('bullmq');
  const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  const worker = new Worker(
    'expeditions', // Match the queue name used in launchCargoTransfer (P2-COL-004)
    async (job) => {
      if (job.name === 'arrive_cargo') {
        await processArriveCargo(job);
      }
    },
    { connection },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Cargo routes worker: job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, name: job?.name, err: err.message },
      'Cargo routes worker: job failed',
    );
  });

  return worker;
}
