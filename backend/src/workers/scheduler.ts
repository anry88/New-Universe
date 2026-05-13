import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

export interface WorkerHandle {
  close(): Promise<void>;
}

export function combineWorkerHandles(handles: WorkerHandle[]): WorkerHandle {
  return {
    async close() {
      await Promise.all(handles.map((handle) => handle.close()));
    },
  };
}

export function createIntervalWorker(
  name: string,
  intervalMs: number,
  run: () => Promise<void>,
  options: { runOnStart?: boolean } = {},
): WorkerHandle {
  let closed = false;
  let running: Promise<void> | null = null;

  const runOnce = () => {
    if (closed || running) return;

    running = (async () => {
      try {
        await run();
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : err },
          `${name} interval worker: tick failed`,
        );
      } finally {
        running = null;
      }
    })();
  };

  const timer = setInterval(runOnce, intervalMs);
  const unrefTimer = timer as ReturnType<typeof setInterval> & { unref?: () => void };
  unrefTimer.unref?.();

  if (options.runOnStart) {
    runOnce();
  }

  return {
    async close() {
      closed = true;
      clearInterval(timer);
      await running;
    },
  };
}

export async function removeLegacyRepeatableJobs(queueName: string): Promise<void> {
  const { Queue } = await import('bullmq');
  const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const queue = new Queue(queueName, { connection });

  try {
    const repeatableJobs = await queue.getRepeatableJobs();
    await Promise.all(repeatableJobs.map((job) => queue.removeRepeatableByKey(job.key)));

    if (repeatableJobs.length > 0) {
      logger.info(
        { queueName, removed: repeatableJobs.length },
        'Removed legacy BullMQ repeatable jobs',
      );
    }
  } finally {
    await queue.close();
    await connection.quit();
  }
}
