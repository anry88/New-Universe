import { describe, it, expect, beforeEach } from 'vitest';
import { computeCurrentResources } from './accrual.js';
import { db } from '../../db/index.js';
import { planetResources, resources, planets, systems, ships } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

describe('computeCurrentResources', () => {
  beforeEach(async () => {
    await db.delete(ships);
    await db.delete(planetResources);
    await db.delete(planets);
    await db.delete(systems);
  });

  async function createTestPlanet(): Promise<string> {
    const [system] = await db.insert(systems).values({
      sectorX: 999,
      sectorY: 999,
      sectorZ: 999,
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

  it('should add 10 to amount when 3600s passed with rate 10/h', async () => {
    const planetId = await createTestPlanet();

    await db.insert(resources).values({
      id: 'test-iron',
      name: { ru: 'Тест Железо', en: 'Test Iron' },
      tier: 1,
      symbol: 'Fe',
      baseRegenRate: 10,
      defaultStorageCap: 1000,
    }).onConflictDoNothing();

    const pastTime = new Date(Date.now() - 3600 * 1000);

    await db.insert(planetResources).values({
      planetId,
      resourceId: 'test-iron',
      amount: '100.0000',
      lastUpdateAt: pastTime,
      regenRate: '10.0000',
    });

    const result = await computeCurrentResources(planetId);

    expect(result).toHaveLength(1);
    expect(result[0].resourceId).toBe('test-iron');
    expect(result[0].amount).toBeCloseTo(110, 0);
  });

  it('should return array of all planet resources', async () => {
    const planetId = await createTestPlanet();

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
    ]).onConflictDoNothing();

    await db.insert(planetResources).values([
      {
        planetId,
        resourceId: 'test-iron',
        amount: '50.0000',
        lastUpdateAt: new Date(),
        regenRate: '5.0000',
      },
      {
        planetId,
        resourceId: 'test-water',
        amount: '30.0000',
        lastUpdateAt: new Date(),
        regenRate: '8.0000',
      },
    ]);

    const result = await computeCurrentResources(planetId);

    expect(result).toHaveLength(2);
    const resourceIds = result.map(r => r.resourceId);
    expect(resourceIds).toContain('test-iron');
    expect(resourceIds).toContain('test-water');
  });

  it('should handle multiple resources with different regen rates', async () => {
    const planetId = await createTestPlanet();

    await db.insert(resources).values([
      {
        id: 'test-copper',
        name: { ru: 'Тест Медь', en: 'Test Copper' },
        tier: 1,
        symbol: 'Cu',
        baseRegenRate: 2,
        defaultStorageCap: 500,
      },
      {
        id: 'test-silicon',
        name: { ru: 'Тест Кремний', en: 'Test Silicon' },
        tier: 1,
        symbol: 'Si',
        baseRegenRate: 5,
        defaultStorageCap: 800,
      },
    ]).onConflictDoUpdate({
      target: resources.id,
      set: { defaultStorageCap: 500 },
    });

    const pastTime = new Date(Date.now() - 7200 * 1000);

    await db.insert(planetResources).values([
      {
        planetId,
        resourceId: 'test-copper',
        amount: '10.0000',
        lastUpdateAt: pastTime,
        regenRate: '2.0000',
      },
      {
        planetId,
        resourceId: 'test-silicon',
        amount: '20.0000',
        lastUpdateAt: pastTime,
        regenRate: '5.0000',
      },
    ]);

    const result = await computeCurrentResources(planetId);

    expect(result).toHaveLength(2);

    const copper = result.find(r => r.resourceId === 'test-copper');
    const silicon = result.find(r => r.resourceId === 'test-silicon');

    expect(copper?.amount).toBeCloseTo(14, 0);
    expect(silicon?.amount).toBeCloseTo(30, 0);
  });
});
