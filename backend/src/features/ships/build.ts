import { db as defaultDb } from '../../db/index.js';
import { ships, shipTypes, buildings, planets, users, notifications } from '../../db/schema.js';
import { eq, and, sql, gte, isNotNull, lte, inArray } from 'drizzle-orm';
import { spendResources } from '../resources/transactions.js';
import { SHIP_RESEARCH_GATES } from '../../config/research-unlocks.js';
import { loadUserResearchLevels, meetsResearchRequirement } from '../research/gates.js';
import { rushDiamondCost, rushRemainingSeconds } from '../../lib/diamonds.js';
import { getPlayerPlanetSettlement } from '../colonies/ownership.js';
import { env } from '../../lib/env.js';
import {
  formatShipBuildErrorMessage,
  type Ship,
  type ShipBuildErrorCode,
  type ShipBuildErrorDetails,
  type ShipQueueItem,
} from '@shared/types/ships.js';

export interface BuildShipRequest {
  planetId: string;
  typeSlug: string;
}

export interface BuildShipResult {
  success: boolean;
  status: number;
  ship?: Ship;
  queueItem?: ShipQueueItem;
  error?: string;
  code?: ShipBuildErrorCode;
  details?: Omit<ShipBuildErrorDetails, 'code'>;
}

const MAX_QUEUED_SHIPS = 1;

function shipBuildFailure(status: number, details: ShipBuildErrorDetails): BuildShipResult {
  const { code, ...rest } = details;
  return {
    success: false,
    status,
    error: formatShipBuildErrorMessage(details, 'en'),
    code,
    details: rest,
  };
}

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
    return shipBuildFailure(404, { code: 'ship_build_planet_not_found' });
  }

  const settlement = await getPlayerPlanetSettlement(userId, planetId, db);
  if (!settlement?.isSettled) {
    return shipBuildFailure(403, { code: 'ship_build_planet_not_owned' });
  }

  const shipyard = await db.query.buildings.findFirst({
    where: and(
      eq(buildings.planetId, planetId),
      eq(buildings.typeId, 'shipyard'),
    ),
  });
  if (!shipyard) {
    return shipBuildFailure(400, { code: 'ship_build_shipyard_required' });
  }

  const type = await db.query.shipTypes.findFirst({
    where: eq(shipTypes.id, typeSlug),
  });
  if (!type) {
    return shipBuildFailure(404, { code: 'ship_build_unknown_type', typeId: typeSlug });
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
      return shipBuildFailure(400, {
        code: 'ship_build_missing_building',
        typeId: dep.typeId,
        requiredLevel: dep.level,
      });
    }
  }

  const shipGate = SHIP_RESEARCH_GATES[typeSlug];
  if (shipGate) {
    const levels = await loadUserResearchLevels(userId, db);
    if (!meetsResearchRequirement(levels, shipGate)) {
      return shipBuildFailure(400, {
        code: 'ship_build_missing_research',
        branch: shipGate.branch,
        requiredLevel: shipGate.level,
        currentLevel: levels.get(shipGate.branch) ?? 0,
      });
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
    return shipBuildFailure(400, { code: 'ship_build_queue_full', maxQueuedShips: MAX_QUEUED_SHIPS });
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
        return shipBuildFailure(400, {
          code: 'insufficient_resource',
          resourceId: spendResult.details?.resourceId ?? resourceCosts[0]?.resourceId ?? 'resource',
          required: spendResult.details?.required,
          available: spendResult.details?.available,
        });
      }
    }

    const queueCompletesAt = new Date(Date.now() + type.buildTimeSec * 1000);
    const queueStartedAt = new Date(
      queueCompletesAt.getTime() - type.buildTimeSec * 1000,
    ).toISOString();

    const [newShip] = await tx
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: typeSlug,
        locationPlanetId: planetId,
        status: 'building',
        queueCompletesAt,
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
      ship: {
        ...newShip,
        queueCompletesAt: queueCompletesAt.toISOString(),
        queueStartedAt,
        cargoJson: newShip.cargoJson as Record<string, number>,
      },
      queueItem: {
        id: newShip.id,
        planetId,
        typeId: typeSlug,
        status: 'building',
        queueCompletesAt: queueCompletesAt.toISOString(),
        queueStartedAt,
        rushCost: rushDiamondCost(rushRemainingSeconds(queueCompletesAt)),
      },
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
