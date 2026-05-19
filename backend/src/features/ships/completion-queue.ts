import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';

export type ShipCompletionJobName = 'complete-build';

export interface ShipCompletionJob {
  name: ShipCompletionJobName;
  shipId: string;
  planetId: string;
  delayMs: number;
}

export interface ShipQueue {
  add(
    name: ShipCompletionJobName,
    data: { shipId: string; planetId: string },
    options: { delay: number },
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface RedisConnection {
  quit(): Promise<void>;
}

export interface ShipQueueProducer {
  queue: ShipQueue;
  connection: RedisConnection;
}

export type ProducerFactory = () => Promise<ShipQueueProducer>;

let producerFactory: ProducerFactory = createDefaultProducer;
let producerPromise: Promise<ShipQueueProducer> | null = null;
const pendingEnqueues = new Set<Promise<void>>();

async function createDefaultProducer(): Promise<ShipQueueProducer> {
  const { Queue } = await import('bullmq');
  const Redis = (await import('ioredis')).default as unknown as new (
    ...args: any[]
  ) => RedisConnection;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const queue = new Queue('ships', {
    connection: connection as any,
  }) as unknown as ShipQueue;
  return { queue, connection };
}

function getProducer(): Promise<ShipQueueProducer> {
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

async function enqueueShipCompletionJob(job: ShipCompletionJob): Promise<void> {
  if (!env.ENABLE_BULLMQ) return;

  const producer = await getProducer();
  await producer.queue.add(
    job.name,
    { shipId: job.shipId, planetId: job.planetId },
    { delay: Math.max(0, job.delayMs) },
  );
}

export function scheduleShipCompletionJob(job: ShipCompletionJob): void {
  if (!env.ENABLE_BULLMQ) return;

  let pending: Promise<void>;
  pending = enqueueShipCompletionJob(job)
    .catch((err) => {
      logger.warn(
        { err: describeError(err), job },
        'Ship completion BullMQ enqueue failed; Postgres polling will complete the due row',
      );
    })
    .finally(() => {
      pendingEnqueues.delete(pending);
    });

  pendingEnqueues.add(pending);
}

export function warmShipCompletionQueueProducer(): void {
  if (!env.ENABLE_BULLMQ) return;

  void getProducer().catch((err) => {
    logger.warn(
      { err: describeError(err) },
      'Ship completion BullMQ producer warmup failed; Postgres polling remains authoritative',
    );
  });
}

export async function closeShipCompletionQueueProducer(): Promise<void> {
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
      'Failed to close ship completion BullMQ producer cleanly',
    );
  }
}

export async function drainShipCompletionEnqueuesForTests(): Promise<void> {
  await Promise.allSettled([...pendingEnqueues]);
}

export async function resetShipCompletionQueueForTests(): Promise<void> {
  await drainShipCompletionEnqueuesForTests();
  await closeShipCompletionQueueProducer();
  producerFactory = createDefaultProducer;
}

export function setShipCompletionProducerFactoryForTests(
  factory: ProducerFactory,
): void {
  producerFactory = factory;
  producerPromise = null;
}
