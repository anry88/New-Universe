import { db as defaultDb } from '../../db/index.js';
import { ships, shipTypes, buildings, planets, users, notifications } from '../../db/schema.js';
import { eq, and, sql, gte, isNotNull, lte, inArray } from 'drizzle-orm';
import { spendResources } from '../resources/transactions.js';
import { SHIP_RESEARCH_GATES } from '../../config/research-unlocks.js';
import { assertResearchRequirement, loadUserResearchLevels } from '../research/gates.js';
import { rushDiamondCost, rushRemainingSeconds } from '../../lib/diamonds.js';
import { getPlayerPlanetSettlement } from '../colonies/ownership.js';
import { env } from '../../lib/env.js';

export interface BuildShipRequest {
  planetId: string;
  typeSlug: string;
}

export interface BuildShipResult {
  success: boolean;
  status: number;
  ship?: typeof ships.$inferSelect;
  error?: string;
}

const MAX_QUEUED_SHIPS = 1;

export async function buildShip(
  userId: string,
  req: BuildShipRequest,
): Promise<BuildShipResult> {
  const { planetId, typeSlug } = req;
  const db = defaultDb;

  const planet = await db.query.planets.findFirst({
    where: eq(planets.id, planetId),
  });
  if (!planet) {
    return { success: false, status: 404, error: 'Planet not found' };
  }

  const settlement = await getPlayerPlanetSettlement(userId, planetId, db);
  if (!settlement?.isSettled) {
    return { success: false, status: 403, error: 'Planet does not belong to you' };
  }

  const shipyard = await db.query.buildings.findFirst({
    where: and(
      eq(buildings.planetId, planetId),
      eq(buildings.typeId, 'shipyard'),
    ),
  });
  if (!shipyard) {
    return {
      success: false,
      status: 400,
      error: 'Shipyard required to build ships',
    };
  }

  const type = await db.query.shipTypes.findFirst({
    where: eq(shipTypes.id, typeSlug),
  });
  if (!type) {
    return { success: false, status: 404, error: `Unknown ship type: ${typeSlug}` };
  }

  const requiredBldgs = type.requiredBuildings as { typeId: string; level: number }[];
  for (const dep of requiredBldgs) {
    const depBuilding = await db.query.buildings.findFirst({
      where: and(
        eq(buildings.planetId, planetId),
        eq(buildings.typeId, dep.typeId),
      ),
    });
    if (!depBuilding || depBuilding.level < dep.level) {
      return {
        success: false,
        status: 400,
        error: `Missing required building: ${dep.typeId} level ${dep.level}`,
      };
    }
  }

  const shipGate = SHIP_RESEARCH_GATES[typeSlug];
  if (shipGate) {
    try {
      const levels = await loadUserResearchLevels(userId, db);
      assertResearchRequirement(levels, shipGate, `Build ship ${typeSlug}`);
    } catch (e: any) {
      return { success: false, status: 400, error: e.message ?? String(e) };
    }
  }

  const queuedShips = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(ships)
    .where(
      and(
        eq(ships.locationPlanetId, planetId),
        eq(ships.status, 'building'),
      ),
    );
  const queueCount = Number(queuedShips[0]?.count || 0);
  if (queueCount >= MAX_QUEUED_SHIPS) {
    return {
      success: false,
      status: 400,
      error: `Shipyard queue is full (max ${MAX_QUEUED_SHIPS} ship at a time)`,
    };
  }

  const costs = type.buildCost as Record<string, number>;
  const costEntries = Object.entries(costs);

  const result = await db.transaction(async (tx) => {
    if (costEntries.length > 0) {
      const resourceCosts = costEntries.map(([resourceId, amount]) => ({
        resourceId,
        amount,
      }));
      const spendResult = await spendResources(planetId, resourceCosts, tx);
      if (!spendResult.success) {
        return { success: false, status: 400, error: spendResult.error } as BuildShipResult;
      }
    }

    const [newShip] = await tx
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: typeSlug,
        locationPlanetId: planetId,
        status: 'building',
        queueCompletesAt: new Date(Date.now() + type.buildTimeSec * 1000),
        cargoJson: {},
        fuel: '0',
      })
      .returning();

    if (env.ENABLE_BULLMQ) {
      try {
        const { Queue: BQueue } = await import('bullmq');
        const Redis = (await import('ioredis')).default as unknown as new (...args: any[]) => any;
        const redis = new Redis(env.REDIS_URL, {
          maxRetriesPerRequest: null,
          lazyConnect: true,
        });
        const shipQueue = new BQueue('ships', { connection: redis });
        await shipQueue.add(
          'complete-build',
          { shipId: newShip.id, planetId },
          { delay: type.buildTimeSec * 1000 },
        );
        await shipQueue.close();
        await redis.quit();
      } catch {
        // Redis/BullMQ not available — worker handles completion via polling
      }
    }

    return {
      success: true,
      status: 200,
      ship: newShip,
    } satisfies BuildShipResult;
  });

  return result;
}

export async function getShipQueue(userId: string): Promise<{
  queue: {
    id: string;
    planetId: string | null;
    typeId: string;
    status: string;
    queueCompletesAt: string;
    queueStartedAt: string | null;
    rushCost: number;
  }[];
}> {
  const rows = await defaultDb
    .select({
      id: ships.id,
      planetId: ships.locationPlanetId,
      typeId: ships.typeId,
      status: ships.status,
      queueCompletesAt: ships.queueCompletesAt,
      buildTimeSec: shipTypes.buildTimeSec,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .where(
      and(
        eq(ships.ownerId, userId),
        eq(ships.status, 'building'),
        isNotNull(ships.queueCompletesAt),
      ),
    );

  const queue = rows
    .map((row) => ({
      id: row.id,
      planetId: row.planetId,
      typeId: row.typeId,
      status: row.status,
      queueCompletesAt: row.queueCompletesAt!.toISOString(),
      queueStartedAt: new Date(
        row.queueCompletesAt!.getTime() - row.buildTimeSec * 1000,
      ).toISOString(),
      rushCost: rushDiamondCost(rushRemainingSeconds(row.queueCompletesAt!)),
    }))
    .sort((a, b) => new Date(a.queueCompletesAt).getTime() - new Date(b.queueCompletesAt).getTime());

  return { queue };
}

export async function rushShipBuild(userId: string, shipId: string): Promise<{
  success: boolean;
  cost: number;
  diamondsRemaining: number;
}> {
  const ship = await defaultDb.query.ships.findFirst({
    where: and(eq(ships.id, shipId), eq(ships.ownerId, userId)),
  });
  if (!ship) {
    throw new Error('Ship not found or not owned by user');
  }
  if (ship.status !== 'building' || !ship.queueCompletesAt) {
    throw new Error('Ship is not in the construction queue');
  }

  const remainingSec = rushRemainingSeconds(ship.queueCompletesAt);
  const cost = rushDiamondCost(remainingSec);

  return defaultDb.transaction(async (tx) => {
    if (cost > 0) {
      const rows = await tx
        .update(users)
        .set({ diamonds: sql`${users.diamonds} - ${cost}` })
        .where(and(eq(users.id, userId), gte(users.diamonds, cost)))
        .returning({ diamonds: users.diamonds });
      if (!rows.length) {
        throw new Error('Not enough diamonds');
      }
    }

    await tx
      .update(ships)
      .set({
        status: 'idle',
        queueCompletesAt: null,
      })
      .where(eq(ships.id, shipId));

    const userAfter = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    return {
      success: true,
      cost,
      diamondsRemaining: userAfter?.diamonds ?? 0,
    };
  });
}

export async function syncReadyShips(
  userId?: string,
  options: { skipNotifications?: boolean } = {},
): Promise<void> {
  const now = new Date();
  const conditions = [
    eq(ships.status, 'building'),
    isNotNull(ships.queueCompletesAt),
    lte(ships.queueCompletesAt, now),
  ];
  if (userId) {
    conditions.push(eq(ships.ownerId, userId));
  }

  const readyShips = await defaultDb
    .select({
      id: ships.id,
      ownerId: ships.ownerId,
    })
    .from(ships)
    .where(and(...conditions));

  if (readyShips.length === 0) return;

  const readyIds = readyShips.map((ship) => ship.id);

  await defaultDb
    .update(ships)
    .set({
      status: 'idle',
      queueCompletesAt: null,
    })
    .where(inArray(ships.id, readyIds));

  if (!options.skipNotifications) return;

  const ownerIds = [...new Set(readyShips.map((ship) => ship.ownerId))];
  for (const ownerId of ownerIds) {
    const shipIds = readyShips
      .filter((ship) => ship.ownerId === ownerId)
      .map((ship) => ship.id);
    for (const shipId of shipIds) {
      await defaultDb
        .update(notifications)
        .set({ pending: false, read: true })
        .where(
          and(
            eq(notifications.userId, ownerId),
            eq(notifications.type, 'ship_done'),
            sql`(${notifications.payload} ->> 'shipId') = ${shipId}`,
            eq(notifications.pending, true),
          ),
        );
    }
  }
}
