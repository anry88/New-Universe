import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';

export type CargoRouteCompletionJobName = 'arrive_cargo';

export interface CargoRouteCompletionJob {
  name: CargoRouteCompletionJobName;
  expeditionId: string;
  shipId: string;
  delayMs: number;
}

export interface ExpeditionQueue {
  add(
    name: CargoRouteCompletionJobName,
    data: { expeditionId: string; shipId: string },
    options: { delay: number },
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface RedisConnection {
  quit(): Promise<void>;
}

export interface CargoRouteQueueProducer {
  queue: ExpeditionQueue;
  connection: RedisConnection;
}

export type ProducerFactory = () => Promise<CargoRouteQueueProducer>;

let producerFactory: ProducerFactory = createDefaultProducer;
let producerPromise: Promise<CargoRouteQueueProducer> | null = null;
const pendingEnqueues = new Set<Promise<void>>();

async function createDefaultProducer(): Promise<CargoRouteQueueProducer> {
  const { Queue } = await import('bullmq');
  const Redis = (await import('ioredis')).default as unknown as new (
    ...args: any[]
  ) => RedisConnection;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const queue = new Queue('expeditions', {
    connection: connection as any,
  }) as unknown as ExpeditionQueue;
  return { queue, connection };
}

function getProducer(): Promise<CargoRouteQueueProducer> {
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

async function enqueueCargoRouteCompletionJob(
  job: CargoRouteCompletionJob,
): Promise<void> {
  if (!env.ENABLE_BULLMQ) return;

  const producer = await getProducer();
  await producer.queue.add(
    job.name,
    { expeditionId: job.expeditionId, shipId: job.shipId },
    { delay: Math.max(0, job.delayMs) },
  );
}

export function scheduleCargoRouteCompletionJob(
  job: CargoRouteCompletionJob,
): void {
  if (!env.ENABLE_BULLMQ) return;

  let pending: Promise<void>;
  pending = enqueueCargoRouteCompletionJob(job)
    .catch((err) => {
      logger.warn(
        { err: describeError(err), job },
        'Cargo route BullMQ enqueue failed; Postgres polling will complete the due row',
      );
    })
    .finally(() => {
      pendingEnqueues.delete(pending);
    });

  pendingEnqueues.add(pending);
}

export function warmCargoRouteQueueProducer(): void {
  if (!env.ENABLE_BULLMQ) return;

  void getProducer().catch((err) => {
    logger.warn(
      { err: describeError(err) },
      'Cargo route BullMQ producer warmup failed; Postgres polling remains authoritative',
    );
  });
}

export async function closeCargoRouteQueueProducer(): Promise<void> {
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
      'Failed to close cargo route BullMQ producer cleanly',
    );
  }
}

export async function drainCargoRouteEnqueuesForTests(): Promise<void> {
  await Promise.allSettled([...pendingEnqueues]);
}

export async function resetCargoRouteQueueForTests(): Promise<void> {
  await drainCargoRouteEnqueuesForTests();
  await closeCargoRouteQueueProducer();
  producerFactory = createDefaultProducer;
}

export function setCargoRouteProducerFactoryForTests(
  factory: ProducerFactory,
): void {
  producerFactory = factory;
  producerPromise = null;
}
