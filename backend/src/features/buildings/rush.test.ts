import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildingService } from './service.js';
import { BuildingOperationError } from './building-operation-error.js';
import { db } from '../../db/index.js';
import { users, buildings, notifications } from '../../db/schema.js';
import { generateHomeSystem } from '../world/home-system-generator.js';
import { eq } from 'drizzle-orm';
import { rushDiamondCost, rushRemainingSeconds } from '../../lib/diamonds.js';

describe('rushQueuedBuilding', () => {
  let userId: string;
  let planetId: string;

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'rush_test_user',
    }).returning();
    userId = user.id;

    await generateHomeSystem(userId);

    const discovered = await db.query.discoveredPlanets.findFirst({
      where: (table, { eq }) => eq(table.userId, userId),
    });
    planetId = discovered!.planetId;
  });

  beforeEach(async () => {
    await db.delete(buildings).where(eq(buildings.planetId, planetId));
    await db.insert(buildings).values({
      planetId,
      typeId: 'command_center',
      level: 1,
      slotIndex: 0,
      queueAction: null,
      queueCompletesAt: null,
    });
    await db.update(users).set({ diamonds: 100 }).where(eq(users.id, userId));
  });

  it('deducts diamonds and completes the queued building', async () => {
    const completesAt = new Date(Date.now() + 120_000);
    const remainingSec = rushRemainingSeconds(completesAt);
    const expectedCost = rushDiamondCost(remainingSec);

    const [queued] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      level: 1,
      slotIndex: 1,
      queueAction: 'build',
      queueCompletesAt: completesAt,
    }).returning();

    const result = await buildingService.rushQueuedBuilding(userId, queued.id);
    expect(result.cost).toBe(expectedCost);
    expect(result.diamondsRemaining).toBe(100 - expectedCost);

    const updated = await db.query.buildings.findFirst({
      where: eq(buildings.id, queued.id),
    });
    expect(updated?.queueAction).toBeNull();
    expect(updated?.queueCompletesAt).toBeNull();

    const notes = await db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
    });
    expect(notes.filter((note) => note.type === 'building_done')).toHaveLength(0);
  });

  it('throws BuildingOperationError when balance is too low', async () => {
    await db.update(users).set({ diamonds: 1 }).where(eq(users.id, userId));

    const completesAt = new Date(Date.now() + 120_000);
    const [queued] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      level: 1,
      slotIndex: 1,
      queueAction: 'build',
      queueCompletesAt: completesAt,
    }).returning();

    await expect(buildingService.rushQueuedBuilding(userId, queued.id)).rejects.toBeInstanceOf(
      BuildingOperationError,
    );
  });

  it('rejects buildings not in queue', async () => {
    const [done] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      level: 1,
      slotIndex: 1,
      queueAction: null,
      queueCompletesAt: null,
    }).returning();

    await expect(buildingService.rushQueuedBuilding(userId, done.id)).rejects.toThrow(
      'not in the construction queue',
    );
  });
});
