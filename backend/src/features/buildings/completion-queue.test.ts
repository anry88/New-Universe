import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../lib/env.js';
import {
  drainBuildingCompletionEnqueuesForTests,
  resetBuildingCompletionQueueForTests,
  scheduleBuildingCompletionJob,
  setBuildingCompletionProducerFactoryForTests,
} from './completion-queue.js';

describe('building completion queue producer', () => {
  const originalEnableBullmq = env.ENABLE_BULLMQ;

  afterEach(async () => {
    env.ENABLE_BULLMQ = originalEnableBullmq;
    await resetBuildingCompletionQueueForTests();
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
    setBuildingCompletionProducerFactoryForTests(factory);

    scheduleBuildingCompletionJob({
      name: 'complete-build',
      buildingId: 'building-1',
      planetId: 'planet-1',
      delayMs: 1000,
    });
    await drainBuildingCompletionEnqueuesForTests();

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
    setBuildingCompletionProducerFactoryForTests(factory);

    scheduleBuildingCompletionJob({
      name: 'complete-build',
      buildingId: 'building-1',
      planetId: 'planet-1',
      delayMs: 1234,
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();

    resolveProducer({
      queue: { add, close },
      connection: { quit },
    });
    await drainBuildingCompletionEnqueuesForTests();

    expect(add).toHaveBeenCalledWith(
      'complete-build',
      { buildingId: 'building-1', planetId: 'planet-1' },
      { delay: 1234 },
    );

    scheduleBuildingCompletionJob({
      name: 'complete-upgrade',
      buildingId: 'building-2',
      planetId: 'planet-1',
      delayMs: 5678,
    });
    await drainBuildingCompletionEnqueuesForTests();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'complete-upgrade',
      { buildingId: 'building-2', planetId: 'planet-1' },
      { delay: 5678 },
    );
  });

  it('swallows enqueue errors so Postgres polling remains the fallback', async () => {
    env.ENABLE_BULLMQ = true;
    const add = vi.fn(async () => {
      throw new Error('redis unavailable');
    });
    setBuildingCompletionProducerFactoryForTests(async () => ({
      queue: {
        add,
        close: vi.fn(async () => undefined),
      },
      connection: {
        quit: vi.fn(async () => undefined),
      },
    }));

    scheduleBuildingCompletionJob({
      name: 'complete-build',
      buildingId: 'building-1',
      planetId: 'planet-1',
      delayMs: 0,
    });

    await expect(
      drainBuildingCompletionEnqueuesForTests(),
    ).resolves.toBeUndefined();
    expect(add).toHaveBeenCalledTimes(1);
  });
});
