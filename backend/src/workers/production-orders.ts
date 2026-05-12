import { Queue, Worker } from 'bullmq';
import { productionService } from '../features/resources/production.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const POLL_INTERVAL_MS = 30000;

export async function processCompletedProductionOrders(): Promise<number> {
  return productionService.processDueOrders();
}

export async function createProductionOrdersWorker(): Promise<Worker> {
  const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  const queue = new Queue('production-orders', { connection });
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
    'production-orders',
    async () => {
      const completed = await processCompletedProductionOrders();
      logger.info({ completed }, 'Production orders worker: tick completed');
    },
    { connection },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Production orders worker: job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, name: job?.name, err: err.message },
      'Production orders worker: job failed',
    );
  });

  return worker;
}
