/**
 * Periodic combat tick worker — runs the ship-vs-ship engagement engine on a
 * fixed interval so combat progresses for offline players too. Online sessions
 * also force a tick via `features/me/online-sync.ts` so on-screen state stays
 * fresh between worker passes.
 */
import { processDueCombat } from '../features/combat/tick-combat.js';
import { createIntervalWorker, type WorkerHandle } from './scheduler.js';

const POLL_INTERVAL_MS = 10_000;

export async function createCombatWorker(): Promise<WorkerHandle> {
  return createIntervalWorker(
    'Combat',
    POLL_INTERVAL_MS,
    async () => {
      await processDueCombat();
    },
    { runOnStart: true },
  );
}
