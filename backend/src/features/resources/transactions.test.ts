import { describe, it, expect, beforeEach } from 'vitest';
import { spendResources, gainResources } from './transactions.js';
import { db } from '../../db/index.js';
import { planetResources, resources, planets, systems } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

describe('Resource Transactions', () => {
  async function createTestPlanet(): Promise<string> {
    const [system] = await db.insert(systems).values({
      sectorX: 998,
      sectorY: 998,
      sectorZ: 998,
      x: '100.00',
      y: '200.00',
      z: '300.00',
      name: 'Test System',
      seed: 12345,
    }).returning();

    const [planet] = await db.insert(planets).values({
      systemId: system.id,
      biome: 'rocky',
      size: 10,
      slotCount: 8,
      name: 'Test Planet',
    }).returning();

    return planet.id;
  }

  beforeEach(async () => {
    await db.delete(planetResources);
    await db.delete(planets);
    await db.delete(systems);

    await db.insert(resources).values([
      {
        id: 'test-iron',
        name: { ru: 'Тест Железо', en: 'Test Iron' },
        tier: 1,
        symbol: 'Fe',
        baseRegenRate: 5,
        defaultStorageCap: 1000,
      },
      {
        id: 'test-water',
        name: { ru: 'Тест Вода', en: 'Test Water' },
        tier: 1,
        symbol: 'H2O',
        baseRegenRate: 8,
        defaultStorageCap: 1000,
      },
    ]).onConflictDoUpdate({
      target: resources.id,
      set: { defaultStorageCap: 1000 },
    });
  });

  it('should successfully spend resources when enough balance', async () => {
    const planetId = await createTestPlanet();

    await db.insert(planetResources).values([
      {
        planetId,
        resourceId: 'test-iron',
        amount: '100.0000',
        lastUpdateAt: new Date(),
        regenRate: '5.0000',
      },
    ]);

    const result = await spendResources(planetId, [
      { resourceId: 'test-iron', amount: 30 },
    ]);

    expect(result.success).toBe(true);
    expect(result.balanceAfter?.['test-iron']).toBeCloseTo(70, 0);
  });

  it('should fail when not enough resource', async () => {
    const planetId = await createTestPlanet();

    await db.insert(planetResources).values([
      {
        planetId,
        resourceId: 'test-iron',
        amount: '20.0000',
        lastUpdateAt: new Date(),
        regenRate: '5.0000',
      },
    ]);

    const result = await spendResources(planetId, [
      { resourceId: 'test-iron', amount: 50 },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not enough test-iron');

    const record = await db.query.planetResources.findFirst({
      where: (pr, { eq }) => and(eq(pr.planetId, planetId), eq(pr.resourceId, 'test-iron')),
    });
    expect(Number(record?.amount)).toBe(20); // Nothing spent - transaction rolled back
  });

  it('should gain resources correctly', async () => {
    const planetId = await createTestPlanet();

    await db.insert(planetResources).values([
      {
        planetId,
        resourceId: 'test-water',
        amount: '50.0000',
        lastUpdateAt: new Date(),
        regenRate: '8.0000',
      },
    ]);

    const result = await gainResources(planetId, [
      { resourceId: 'test-water', amount: 25 },
    ]);

    expect(result.success).toBe(true);
    expect(result.balanceAfter?.['test-water']).toBeCloseTo(75, 0);
  });

  it('should sync last_update_at with spend', async () => {
    const planetId = await createTestPlanet();

    await db.insert(planetResources).values([
      {
        planetId,
        resourceId: 'test-iron',
        amount: '100.0000',
        lastUpdateAt: new Date(Date.now() - 3600000),
        regenRate: '5.0000',
      },
    ]);

    await spendResources(planetId, [
      { resourceId: 'test-iron', amount: 10 },
    ]);

    const record = await db.query.planetResources.findFirst({
      where: (pr, { eq }) => and(eq(pr.planetId, planetId), eq(pr.resourceId, 'test-iron')),
    });

    const now = new Date();
    const recordTime = new Date(record!.lastUpdateAt);
    expect(now.getTime() - recordTime.getTime()).toBeLessThan(5000);
  });

  it('should handle multiple resources atomically', async () => {
    const planetId = await createTestPlanet();

    await db.insert(planetResources).values([
      {
        planetId,
        resourceId: 'test-iron',
        amount: '100.0000',
        lastUpdateAt: new Date(),
        regenRate: '5.0000',
      },
      {
        planetId,
        resourceId: 'test-water',
        amount: '50.0000',
        lastUpdateAt: new Date(),
        regenRate: '8.0000',
      },
    ]);

    const result = await spendResources(planetId, [
      { resourceId: 'test-iron', amount: 30 },
      { resourceId: 'test-water', amount: 20 },
    ]);

    expect(result.success).toBe(true);
    expect(result.balanceAfter?.['test-iron']).toBeCloseTo(70, 0);
    expect(result.balanceAfter?.['test-water']).toBeCloseTo(30, 0);
  });
});
