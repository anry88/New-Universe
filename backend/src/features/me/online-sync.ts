import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { buildingService } from "../buildings/service.js";
import { processCompletedResearch } from "../research/completion.js";
import { productionService } from "../resources/production.js";
import { syncReadyShips } from "../ships/build.js";
import { processExpeditions } from "../../workers/tick-expeditions.js";
import { colonies, notifications, planets, systems } from "../../db/schema.js";

const ONLINE_SYNC_NOTIFICATION_TYPES = [
  "building_done",
  "research_done",
  "ship_done",
  "expedition_returned",
  "expedition_arrived",
  "planet_discovered",
  "colony_founded",
  "cargo_transfer_delivered",
  "combat_started",
  "ship_destroyed",
  "building_destroyed",
  "colony_destroyed",
];

async function playerPlanetIds(userId: string): Promise<string[]> {
  const [homePlanets, colonyPlanets] = await Promise.all([
    db
      .select({ id: planets.id })
      .from(planets)
      .innerJoin(systems, eq(systems.id, planets.systemId))
      .where(eq(systems.ownerId, userId)),
    db
      .select({ id: colonies.planetId })
      .from(colonies)
      .where(and(eq(colonies.ownerId, userId), eq(colonies.status, "active"))),
  ]);

  return [...new Set([...homePlanets, ...colonyPlanets].map((row) => row.id))];
}

export async function suppressPendingOnlineCompletionNotifications(
  userId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ pending: false, read: true })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.type, ONLINE_SYNC_NOTIFICATION_TYPES),
        eq(notifications.pending, true),
      ),
    );
}

interface SyncDuePlayerStateOptions {
  lightweight?: boolean;
}

const backgroundSyncByUserId = new Map<string, Promise<void>>();

export function queueDuePlayerStateSync(
  userId: string,
  log?: { error: (...args: any[]) => void },
): boolean {
  if (process.env.NODE_ENV === "test" || backgroundSyncByUserId.has(userId)) {
    return false;
  }

  const syncPromise = syncDuePlayerState(userId, { lightweight: true })
    .catch((err) => {
      log?.error({ err, userId }, "Background player state sync failed");
    })
    .finally(() => {
      backgroundSyncByUserId.delete(userId);
    });

  backgroundSyncByUserId.set(userId, syncPromise);
  return true;
}

export async function syncDuePlayerState(
  userId: string,
  options: SyncDuePlayerStateOptions = {},
): Promise<void> {
  const planetIds = await playerPlanetIds(userId);

  for (const planetId of planetIds) {
    await buildingService.syncPlanetBuildings(userId, planetId, {
      recalculateExisting: !options.lightweight,
    });
    await productionService.processDueOrders({ userId, planetId });
  }

  await syncReadyShips(userId, { skipNotifications: true });
  await processCompletedResearch(db, { userId, skipNotification: true });
  await processExpeditions({
    userId,
    skipNotifications: true,
    onlyDue: options.lightweight,
    skipVisibilityChecks: options.lightweight,
  });
  await suppressPendingOnlineCompletionNotifications(userId);
}
