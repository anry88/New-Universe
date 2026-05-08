import { Worker, Queue } from 'bullmq';
import { db } from '../db/index.js';
import {
  buildings,
  buildingTypes,
  planetResources,
  notifications,
  systems,
  planets,
} from '../db/schema.js';
import { eq, and, sql, lte } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

const POLL_INTERVAL_MS = 30000;

type BuildingOutput = {
  resourceId?: string;
  baseRate?: number;
};

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
      const isBuild = building.queueAction === 'build';

      const newLevel = isBuild ? 1 : building.level + 1;

      await tx
        .update(buildings)
        .set({
          level: newLevel,
          queueAction: null,
          queueCompletesAt: null,
        })
        .where(eq(buildings.id, building.id));

      const bType = await tx.query.buildingTypes.findFirst({
        where: eq(buildingTypes.id, building.typeId),
      });

      if (bType?.baseOutput) {
        const output = bType.baseOutput as BuildingOutput;
        if (output.resourceId && typeof output.baseRate === 'number') {
          const totalRate = output.baseRate * newLevel;

          const existing = await tx.query.planetResources.findFirst({
            where: and(
              eq(planetResources.planetId, building.planetId),
              eq(planetResources.resourceId, output.resourceId),
            ),
          });

          if (existing) {
            await tx
              .update(planetResources)
              .set({ regenRate: totalRate.toFixed(4) })
              .where(
                and(
                  eq(planetResources.planetId, building.planetId),
                  eq(planetResources.resourceId, output.resourceId),
                ),
              );
          }
        }
      }

      const planet = await tx.query.planets.findFirst({
        where: eq(planets.id, building.planetId),
      });
      if (planet) {
        const system = await tx.query.systems.findFirst({
          where: eq(systems.id, planet.systemId),
        });
        if (system?.ownerId) {
          const actionLabel = isBuild ? 'built' : `upgraded to level ${newLevel}`;
          await tx.insert(notifications).values({
            userId: system.ownerId,
            type: 'building_done',
            payload: {

              buildingId: building.id,
              typeId: building.typeId,
              planetId: building.planetId,
              action: isBuild ? 'build' : 'upgrade',
              level: newLevel,
            },
          });
          logger.info(
            { buildingId: building.id, typeId: building.typeId, action: actionLabel, userId: system.ownerId },
            'Building completion notification created',
          );
        }
      }
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
