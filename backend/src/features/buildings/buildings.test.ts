import { describe, it, expect, beforeAll } from 'vitest';
import { buildingService } from './service.js';
import { db } from '../../db/index.js';
import { users, systems, planets, planetResources, buildings, buildingTypes } from '../../db/schema.js';
import { generateHomeSystem } from '../world/home-system-generator.js';
import { eq, and } from 'drizzle-orm';

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
    const planet = await db.query.planets.findFirst({
      where: eq(planets.systemId, (await db.query.systems.findFirst({ where: eq(systems.ownerId, userId) }))!.id),
    });
    planetId = planet!.id;

    await db.update(planetResources)
      .set({ amount: '1000000' })
      .where(eq(planetResources.planetId, planetId));
  });

  it('should list building types', async () => {
    const types = await buildingService.getBuildingTypes();
    expect(types.length).toBeGreaterThan(0);
    expect(types.find(t => t.id === 'mine')).toBeDefined();
  });

  it('should start building in an empty slot', async () => {
    await db.delete(buildings).where(eq(buildings.planetId, planetId));

    const result = await buildingService.build(userId, planetId, 'mine', 1);
    expect(result.success).toBe(true);
    expect(result.queueItem).toBeDefined();

    const building = await db.query.buildings.findFirst({
      where: (table, { eq }) => eq(table.id, result.queueItem!.id),
    });
    console.log('Building found:', JSON.stringify(building));
    expect(building?.typeId).toBe('mine');
    expect(building?.slotIndex).toBe(1);
    expect(building?.queueAction).toBe('build');
  });

  it('should fail if slot is occupied', async () => {
    await expect(buildingService.build(userId, planetId, 'mine', 1))
      .rejects.toThrow('Slot already occupied');
  });

  it('should start upgrading an existing building', async () => {
    const typeId = 'test_mine';
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
    const typeId = 'test_mine';
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
