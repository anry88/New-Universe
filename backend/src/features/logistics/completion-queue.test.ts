import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../lib/env.js';
import {
  drainCargoRouteEnqueuesForTests,
  resetCargoRouteQueueForTests,
  scheduleCargoRouteCompletionJob,
  setCargoRouteProducerFactoryForTests,
} from './completion-queue.js';

describe('cargo route completion queue producer', () => {
  const originalEnableBullmq = env.ENABLE_BULLMQ;

  afterEach(async () => {
    env.ENABLE_BULLMQ = originalEnableBullmq;
    await resetCargoRouteQueueForTests();
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
    setCargoRouteProducerFactoryForTests(factory);

    scheduleCargoRouteCompletionJob({
      name: 'arrive_cargo',
      expeditionId: 'expedition-1',
      shipId: 'ship-1',
      delayMs: 1000,
    });
    await drainCargoRouteEnqueuesForTests();

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
    setCargoRouteProducerFactoryForTests(factory);

    scheduleCargoRouteCompletionJob({
      name: 'arrive_cargo',
      expeditionId: 'expedition-1',
      shipId: 'ship-1',
      delayMs: 1234,
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();

    resolveProducer({
      queue: { add, close },
      connection: { quit },
    });
    await drainCargoRouteEnqueuesForTests();

    expect(add).toHaveBeenCalledWith(
      'arrive_cargo',
      { expeditionId: 'expedition-1', shipId: 'ship-1' },
      { delay: 1234 },
    );

    scheduleCargoRouteCompletionJob({
      name: 'arrive_cargo',
      expeditionId: 'expedition-2',
      shipId: 'ship-2',
      delayMs: 5678,
    });
    await drainCargoRouteEnqueuesForTests();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'arrive_cargo',
      { expeditionId: 'expedition-2', shipId: 'ship-2' },
      { delay: 5678 },
    );
  });

  it('swallows enqueue errors so Postgres polling remains the fallback', async () => {
    env.ENABLE_BULLMQ = true;
    const add = vi.fn(async () => {
      throw new Error('redis unavailable');
    });
    setCargoRouteProducerFactoryForTests(async () => ({
      queue: {
        add,
        close: vi.fn(async () => undefined),
      },
      connection: {
        quit: vi.fn(async () => undefined),
      },
    }));

    scheduleCargoRouteCompletionJob({
      name: 'arrive_cargo',
      expeditionId: 'expedition-1',
      shipId: 'ship-1',
      delayMs: 0,
    });

    await expect(drainCargoRouteEnqueuesForTests()).resolves.toBeUndefined();
    expect(add).toHaveBeenCalledTimes(1);
  });
});
