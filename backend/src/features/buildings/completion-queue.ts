import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';

export type BuildingCompletionJobName = 'complete-build' | 'complete-upgrade';

export interface BuildingCompletionJob {
  name: BuildingCompletionJobName;
  buildingId: string;
  planetId: string;
  delayMs: number;
}

export interface BuildingQueue {
  add(
    name: BuildingCompletionJobName,
    data: { buildingId: string; planetId: string },
    options: { delay: number },
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface RedisConnection {
  quit(): Promise<void>;
}

export interface BuildingQueueProducer {
  queue: BuildingQueue;
  connection: RedisConnection;
}

export type ProducerFactory = () => Promise<BuildingQueueProducer>;

let producerFactory: ProducerFactory = createDefaultProducer;
let producerPromise: Promise<BuildingQueueProducer> | null = null;
const pendingEnqueues = new Set<Promise<void>>();

async function createDefaultProducer(): Promise<BuildingQueueProducer> {
  const { Queue } = await import('bullmq');
  const Redis = (await import('ioredis')).default as unknown as new (
    ...args: any[]
  ) => RedisConnection;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const queue = new Queue('buildings', {
    connection: connection as any,
  }) as unknown as BuildingQueue;
  return { queue, connection };
}

function getProducer(): Promise<BuildingQueueProducer> {
  if (!producerPromise) {
    producerPromise = producerFactory().catch((err) => {
      producerPromise = null;
      throw err;
    });
  }

  return producerPromise;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function enqueueBuildingCompletionJob(job: BuildingCompletionJob): Promise<void> {
  if (!env.ENABLE_BULLMQ) return;

  const producer = await getProducer();
  await producer.queue.add(
    job.name,
    { buildingId: job.buildingId, planetId: job.planetId },
    { delay: Math.max(0, job.delayMs) },
  );
}

export function scheduleBuildingCompletionJob(job: BuildingCompletionJob): void {
  if (!env.ENABLE_BULLMQ) return;

  let pending: Promise<void>;
  pending = enqueueBuildingCompletionJob(job)
    .catch((err) => {
      logger.warn(
        { err: describeError(err), job },
        'Building completion BullMQ enqueue failed; Postgres polling will complete the due row',
      );
    })
    .finally(() => {
      pendingEnqueues.delete(pending);
    });

  pendingEnqueues.add(pending);
}

export function warmBuildingCompletionQueueProducer(): void {
  if (!env.ENABLE_BULLMQ) return;

  void getProducer().catch((err) => {
    logger.warn(
      { err: describeError(err) },
      'Building completion BullMQ producer warmup failed; Postgres polling remains authoritative',
    );
  });
}

export async function closeBuildingCompletionQueueProducer(): Promise<void> {
  const producer = producerPromise;
  producerPromise = null;
  if (!producer) return;

  try {
    const resolved = await producer;
    await resolved.queue.close();
    await resolved.connection.quit();
  } catch (err) {
    logger.warn(
      { err: describeError(err) },
      'Failed to close building completion BullMQ producer cleanly',
    );
  }
}

export async function drainBuildingCompletionEnqueuesForTests(): Promise<void> {
  await Promise.allSettled([...pendingEnqueues]);
}

export async function resetBuildingCompletionQueueForTests(): Promise<void> {
  await drainBuildingCompletionEnqueuesForTests();
  await closeBuildingCompletionQueueProducer();
  producerFactory = createDefaultProducer;
}

export function setBuildingCompletionProducerFactoryForTests(
  factory: ProducerFactory,
): void {
  producerFactory = factory;
  producerPromise = null;
}
