import { productionService } from '../features/resources/production.js';
import { logger } from '../lib/logger.js';
import { createIntervalWorker, removeLegacyRepeatableJobs, type WorkerHandle } from './scheduler.js';

const POLL_INTERVAL_MS = 30000;

export async function processCompletedProductionOrders(): Promise<number> {
  return productionService.processDueOrders();
}

export async function createProductionOrdersWorker(): Promise<WorkerHandle> {
  await removeLegacyRepeatableJobs('production-orders');

  return createIntervalWorker(
    'Production orders',
    POLL_INTERVAL_MS,
    async () => {
      const completed = await processCompletedProductionOrders();
      logger.info({ completed }, 'Production orders worker: tick completed');
    },
    { runOnStart: true },
  );
}
