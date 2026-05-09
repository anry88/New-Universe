import { Worker, Queue } from 'bullmq';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { db } from '../db/index.js';
import { processCompletedResearch } from '../features/research/completion.js';

const POLL_INTERVAL_MS = 30000;

export async function createResearchWorker(): Promise<Worker> {
  const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  const queue = new Queue('research', { connection });
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
    'research',
    async () => {
      await processCompletedResearch(db);
    },
    { connection },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Research worker: tick completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, name: job?.name, err: err.message },
      'Research worker: tick failed',
    );
  });

  return worker;
}
