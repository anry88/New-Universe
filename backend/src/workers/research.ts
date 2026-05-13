import { db } from '../db/index.js';
import { processCompletedResearch } from '../features/research/completion.js';
import { createIntervalWorker, removeLegacyRepeatableJobs, type WorkerHandle } from './scheduler.js';

const POLL_INTERVAL_MS = 30000;

export async function createResearchWorker(): Promise<WorkerHandle> {
  await removeLegacyRepeatableJobs('research', { name: 'tick' });

  return createIntervalWorker('Research', POLL_INTERVAL_MS, () => processCompletedResearch(db), {
    runOnStart: true,
  });
}
