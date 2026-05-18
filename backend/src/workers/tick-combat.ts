/**
 * Periodic combat tick worker — runs the ship-vs-ship engagement engine on a
 * fixed interval so combat progresses for online and offline players through
 * one authoritative mutation path.
 */
import { processDueCombat } from "../features/combat/tick-combat.js";
import { createIntervalWorker, type WorkerHandle } from "./scheduler.js";

const POLL_INTERVAL_MS = 3_000;

export async function createCombatWorker(): Promise<WorkerHandle> {
  return createIntervalWorker(
    "Combat",
    POLL_INTERVAL_MS,
    async () => {
      await processDueCombat();
    },
    { runOnStart: true },
  );
}
