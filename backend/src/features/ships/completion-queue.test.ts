import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../lib/env.js';
import {
  drainShipCompletionEnqueuesForTests,
  resetShipCompletionQueueForTests,
  scheduleShipCompletionJob,
  setShipCompletionProducerFactoryForTests,
} from './completion-queue.js';

describe('ship completion queue producer', () => {
  const originalEnableBullmq = env.ENABLE_BULLMQ;

  afterEach(async () => {
    env.ENABLE_BULLMQ = originalEnableBullmq;
    await resetShipCompletionQueueForTests();
    vi.restoreAllMocks();
  });

  it('skips Redis/BullMQ entirely when BullMQ is disabled', async () => {
    env.ENABLE_BULLMQ = false;
    const factory = vi.fn(async () => ({
      queue: {
        add: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      },
      connection: {
        quit: vi.fn(async () => undefined),
      },
    }));
    setShipCompletionProducerFactoryForTests(factory);

    scheduleShipCompletionJob({
      name: 'complete-build',
      shipId: 'ship-1',
      planetId: 'planet-1',
      delayMs: 1000,
    });
    await drainShipCompletionEnqueuesForTests();

    expect(factory).not.toHaveBeenCalled();
  });

  it('does not block the caller while the shared producer is being created', async () => {
    env.ENABLE_BULLMQ = true;
    const add = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const quit = vi.fn(async () => undefined);
    let resolveProducer!: (producer: {
      queue: { add: typeof add; close: typeof close };
      connection: { quit: typeof quit };
    }) => void;
    const factory = vi.fn(
      () =>
        new Promise<{
          queue: { add: typeof add; close: typeof close };
          connection: { quit: typeof quit };
        }>((resolve) => {
          resolveProducer = resolve;
        }),
    );
    setShipCompletionProducerFactoryForTests(factory);

    scheduleShipCompletionJob({
      name: 'complete-build',
      shipId: 'ship-1',
      planetId: 'planet-1',
      delayMs: 1234,
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();

    resolveProducer({
      queue: { add, close },
      connection: { quit },
    });
    await drainShipCompletionEnqueuesForTests();

    expect(add).toHaveBeenCalledWith(
      'complete-build',
      { shipId: 'ship-1', planetId: 'planet-1' },
      { delay: 1234 },
    );

    scheduleShipCompletionJob({
      name: 'complete-build',
      shipId: 'ship-2',
      planetId: 'planet-1',
      delayMs: 5678,
    });
    await drainShipCompletionEnqueuesForTests();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'complete-build',
      { shipId: 'ship-2', planetId: 'planet-1' },
      { delay: 5678 },
    );
  });

  it('swallows enqueue errors so Postgres polling remains the fallback', async () => {
    env.ENABLE_BULLMQ = true;
    const add = vi.fn(async () => {
      throw new Error('redis unavailable');
    });
    setShipCompletionProducerFactoryForTests(async () => ({
      queue: {
        add,
        close: vi.fn(async () => undefined),
      },
      connection: {
        quit: vi.fn(async () => undefined),
      },
    }));

    scheduleShipCompletionJob({
      name: 'complete-build',
      shipId: 'ship-1',
      planetId: 'planet-1',
      delayMs: 0,
    });

    await expect(drainShipCompletionEnqueuesForTests()).resolves.toBeUndefined();
    expect(add).toHaveBeenCalledTimes(1);
  });
});
