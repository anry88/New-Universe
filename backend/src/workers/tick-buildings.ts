import { Worker, Queue } from 'bullmq';
import { db } from '../db/index.js';
import { buildings } from '../db/schema.js';
import { and, sql, lte } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

const POLL_INTERVAL_MS = 30000;

import { buildingService } from '../features/buildings/service.js';

export async function processCompletedBuildings(): Promise<void> {
  const now = new Date();

  const completed = await db
    .select()
    .from(buildings)
    .where(
      and(
        lte(buildings.queueCompletesAt, now),
        sql`${buildings.queueAction} IS NOT NULL`,
      ),
    );

  if (completed.length === 0) return;

  for (const building of completed) {
    await db.transaction(async (tx) => {
      await buildingService.finalizeBuildingConstruction(tx, building.id);
    });
  }
}

export async function createBuildingsWorker(): Promise<Worker> {
  const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  const queue = new Queue('buildings', { connection });
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
    'buildings',
    async () => {
      await processCompletedBuildings();
    },
    { connection },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Buildings worker: job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, name: job?.name, err: err.message },
      'Buildings worker: job failed',
    );
  });

  return worker;
}
