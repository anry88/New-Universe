import { describe, expect, it } from 'vitest';
import { db } from '../db/index.js';
import {
  users,
  buildings,
  planetResources,
  notifications,
  systems,
  planets,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { processCompletedBuildings } from './tick-buildings.js';
import { generateHomeSystem } from '../features/world/home-system-generator.js';

async function createTestUser() {
  const [user] = await db.insert(users).values({
    tgId: BigInt(Math.floor(Math.random() * 100000000)),
    tgUsername: `bldtest_${Date.now()}`,
    tgFirstName: 'BuildTest',
  }).returning();

  await generateHomeSystem(user.id);
  return user;
}

async function getHomePlanetId(userId: string): Promise<string> {
  const system = await db.query.systems.findFirst({
    where: eq(systems.ownerId, userId),
  });
  const planet = await db.query.planets.findFirst({
    where: eq(planets.systemId, system!.id),
  
    orderBy: (p, { asc }) => asc(p.name),
    });
  return planet!.id;
}

describe('Tick Buildings Worker', () => {
  it('should complete a build queue item', async () => {
    const user = await createTestUser();
    const planetId = await getHomePlanetId(user.id);

    const past = new Date(Date.now() - 5000);

    const [mine] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      slotIndex: 0,
      level: 1,
      queueAction: 'build',
      queueCompletesAt: past,
    }).returning();

    await processCompletedBuildings();

    const updated = await db.query.buildings.findFirst({
      where: eq(buildings.id, mine.id),
    });
    expect(updated).toBeDefined();
    expect(updated!.level).toBe(1);
    expect(updated!.queueAction).toBeNull();
    expect(updated!.queueCompletesAt).toBeNull();
  });

  it('should complete an upgrade queue item', async () => {
    const user = await createTestUser();
    const planetId = await getHomePlanetId(user.id);

    const past = new Date(Date.now() - 5000);

    const [mine] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      slotIndex: 0,
      level: 2,
      queueAction: 'upgrade',
      queueCompletesAt: past,
    }).returning();

    await processCompletedBuildings();

    const updated = await db.query.buildings.findFirst({
      where: eq(buildings.id, mine.id),
    });
    expect(updated).toBeDefined();
    expect(updated!.level).toBe(3);
    expect(updated!.queueAction).toBeNull();
    expect(updated!.queueCompletesAt).toBeNull();
  });

  it('should update regen rate for production buildings', async () => {
    const user = await createTestUser();
    const planetId = await getHomePlanetId(user.id);

    const existingPr = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, 'iron'),
      ),
    });
    if (!existingPr) {
      await db.insert(planetResources).values({
        planetId,
        resourceId: 'iron',
        amount: '0.0000',
        lastUpdateAt: new Date(),
        regenRate: '0.0000',
      });
    }

    const past = new Date(Date.now() - 5000);

    await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      slotIndex: 0,
      level: 1,
      queueAction: 'build',
      queueCompletesAt: past,
    });

    await processCompletedBuildings();

    const pr = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, 'iron'),
      ),
    });
    expect(pr).toBeDefined();
    expect(Number(pr!.regenRate)).toBeCloseTo(50 / 3, 4);
  });

  it('should insert steel production when smelter completes (no prior steel row)', async () => {
    const user = await createTestUser();
    const planetId = await getHomePlanetId(user.id);

    const past = new Date(Date.now() - 5000);

    await db.insert(buildings).values({
      planetId,
      typeId: 'smelter',
      slotIndex: 3,
      level: 1,
      queueAction: 'build',
      queueCompletesAt: past,
    });

    await processCompletedBuildings();

    const steel = await db.query.planetResources.findFirst({
      where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, 'steel')),
    });
    expect(steel).toBeDefined();
    expect(Number(steel!.regenRate)).toBe(36);
  });

  it('should create a notification when building completes', async () => {
    const user = await createTestUser();
    const planetId = await getHomePlanetId(user.id);

    const past = new Date(Date.now() - 5000);

    await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      slotIndex: 0,
      level: 1,
      queueAction: 'build',
      queueCompletesAt: past,
    });

    await processCompletedBuildings();

    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, user.id),
    });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    const notif = notifs.find((n) => n.type === 'building_done');

    expect(notif).toBeDefined();
    expect(notif!.payload).toMatchObject({
      typeId: 'mine',
      action: 'build',
      level: 1,
    });
  });

  it('should handle buildings without resource output gracefully', async () => {
    const user = await createTestUser();
    const planetId = await getHomePlanetId(user.id);

    const past = new Date(Date.now() - 5000);

    await db.insert(buildings).values({
      planetId,
      typeId: 'command_center',
      slotIndex: 0,
      level: 1,
      queueAction: 'build',
      queueCompletesAt: past,
    });

    await expect(processCompletedBuildings()).resolves.toBeUndefined();

    const allOnPlanet = await db.query.buildings.findMany({
      where: eq(buildings.planetId, planetId),
    });
    const ccWithQueue = allOnPlanet.find(
      (b) => b.typeId === 'command_center' && b.queueAction === null && b.queueCompletesAt === null,
    );
    expect(ccWithQueue).toBeDefined();
  });

  it('should not process buildings with future queueCompletesAt', async () => {
    const user = await createTestUser();
    const planetId = await getHomePlanetId(user.id);

    const future = new Date(Date.now() + 3600000);

    const [mine] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      slotIndex: 0,
      level: 1,
      queueAction: 'build',
      queueCompletesAt: future,
    }).returning();

    await processCompletedBuildings();

    const updated = await db.query.buildings.findFirst({
      where: eq(buildings.id, mine.id),
    });
    expect(updated!.queueAction).toBe('build');
  });

  it('should be a no-op with no completed buildings', async () => {
    await expect(processCompletedBuildings()).resolves.toBeUndefined();
  });
});
