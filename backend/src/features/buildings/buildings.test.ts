import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildingService } from './service.js';
import { BuildingOperationError } from './building-operation-error.js';
import { db } from '../../db/index.js';
import { users, systems, buildings } from '../../db/schema.js';
import { generateHomeSystem } from '../world/home-system-generator.js';
import { eq } from 'drizzle-orm';

describe('Building Service', () => {
  let userId: string;
  let planetId: string;

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'build_test_user',
    }).returning();
    userId = user.id;

    await generateHomeSystem(userId);
    
    const system = await db.query.systems.findFirst({ where: eq(systems.ownerId, userId) });
    await db.query.planets.findMany({
      where: (table, { eq }) => eq(table.systemId, system!.id),
      orderBy: (table, { asc }) => [asc(table.name)],
    });
    
    // The home planet (where command center is) is actually the one from discovered_planets
    const discovered = await db.query.discoveredPlanets.findFirst({
      where: (table, { eq }) => eq(table.userId, userId)
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
  });


  it('should list building types', async () => {
    const types = await buildingService.getBuildingTypes();
    expect(types.length).toBeGreaterThan(0);
    expect(types.find(t => t.id === 'mine')).toBeDefined();
  });

  it('should start building in an empty slot', async () => {
    const result = await buildingService.build(userId, planetId, 'mine', 1);
    expect(result.success).toBe(true);
    expect(result.queueItem).toBeDefined();

    const building = await db.query.buildings.findFirst({
      where: (table, { eq }) => eq(table.id, result.queueItem!.id),
    });
    expect(building?.typeId).toBe('mine');
    expect(building?.slotIndex).toBe(1);
    expect(building?.queueAction).toBe('build');
  });

  it('should reject a second command center on the same planet', async () => {
    try {
      await buildingService.build(userId, planetId, 'command_center', 1);
      expect.fail('expected BuildingOperationError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BuildingOperationError);
      expect((err as BuildingOperationError).code).toBe('building_blocked_per_planet');
    }
  });

  it('should fail if slot is occupied', async () => {
    await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      level: 1,
      slotIndex: 1,
      queueAction: null,
      queueCompletesAt: null,
    });

    await expect(buildingService.build(userId, planetId, 'mine', 1))
      .rejects.toThrow('Slot already occupied');
  });

  it('should start upgrading an existing building', async () => {
    const typeId = 'mine';
    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: typeId,
      level: 1,
      slotIndex: 2,
    }).returning();

    const result = await buildingService.upgrade(userId, building.id);
    expect(result.success).toBe(true);
    expect(result.queueItem).toBeDefined();

    const updated = await db.query.buildings.findFirst({
      where: eq(buildings.id, building.id),
    });
    expect(updated?.queueAction).toBe('upgrade');
    expect(updated?.level).toBe(1);
  });

  it('should fail upgrade if already in queue', async () => {
    const typeId = 'mine';
    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: typeId,
      level: 1,
      slotIndex: 3,
      queueAction: 'build',
    }).returning();

    await expect(buildingService.upgrade(userId, building.id))
      .rejects.toThrow('Building already in queue');
  });
});
