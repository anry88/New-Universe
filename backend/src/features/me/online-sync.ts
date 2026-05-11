import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { buildingService } from '../buildings/service.js';
import { processCompletedResearch } from '../research/completion.js';
import { syncReadyShips } from '../ships/build.js';
import { processExpeditions } from '../../workers/tick-expeditions.js';
import { colonies, notifications, planets, systems } from '../../db/schema.js';

const ONLINE_SYNC_NOTIFICATION_TYPES = [
  'building_done',
  'research_done',
  'ship_done',
  'expedition_returned',
  'colony_founded',
];

async function playerPlanetIds(userId: string): Promise<string[]> {
  const homePlanets = await db
    .select({ id: planets.id })
    .from(planets)
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(eq(systems.ownerId, userId));

  const colonyPlanets = await db
    .select({ id: colonies.planetId })
    .from(colonies)
    .where(and(eq(colonies.ownerId, userId), eq(colonies.status, 'active')));

  return [...new Set([...homePlanets, ...colonyPlanets].map((row) => row.id))];
}

export async function suppressPendingOnlineCompletionNotifications(userId: string): Promise<void> {
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

export async function syncDuePlayerState(userId: string): Promise<void> {
  const planetIds = await playerPlanetIds(userId);

  for (const planetId of planetIds) {
    await buildingService.syncPlanetBuildings(userId, planetId);
  }

  await syncReadyShips(userId, { skipNotifications: true });
  await processCompletedResearch(db, { userId, skipNotification: true });
  await processExpeditions({ userId, skipNotifications: true });
  await suppressPendingOnlineCompletionNotifications(userId);
}
