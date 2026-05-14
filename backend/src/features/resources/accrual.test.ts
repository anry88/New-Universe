import { describe, it, expect, beforeEach } from 'vitest';
import { computeCurrentResources, computeCurrentResourcesFromSnapshot } from './accrual.js';
import { db } from '../../db/index.js';
import { planetResources, resources, planets, systems, ships, richness, buildings, discoveredPlanets, discoveredSystems, colonies } from '../../db/schema.js';

describe('computeCurrentResources', () => {
  beforeEach(async () => {
    await db.delete(ships);
    await db.delete(buildings);
    await db.delete(colonies);
    await db.delete(discoveredPlanets);
    await db.delete(discoveredSystems);
    await db.delete(richness);
    await db.delete(planetResources);
    await db.delete(planets);
    await db.delete(systems);
  });

  async function createTestPlanet(): Promise<string> {
    const [system] = await db.insert(systems).values({
      sectorX: 999,
      sectorY: 999,
      sectorZ: 999,
      x: '0.00',
      y: '0.00',
      z: '0.00',
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

  it('computes resources from a single supplied energy and resource snapshot', () => {
    const now = new Date('2026-01-01T01:00:00Z');
    const lastUpdateAt = new Date('2026-01-01T00:00:00Z');

    const result = computeCurrentResourcesFromSnapshot({
      now,
      researchEffects: null,
      planet: {
        id: 'planet-snapshot',
        name: 'home-1',
        biome: 'green',
        size: 10,
        buildings: [],
      },
      energyState: {
        stored: 25,
        capacity: 100,
        produced: 0,
        consumed: 10,
        net: -10,
        shortage: true,
        netRate: -10,
        buildingStates: {},
      },
      resourceRows: [
        {
          planetId: 'planet-snapshot',
          resourceId: 'iron',
          amount: '10.0000',
          regenRate: '5.0000',
          lastUpdateAt,
          storageCap: 1000,
        },
        {
          planetId: 'planet-snapshot',
          resourceId: 'energy',
          amount: '40.0000',
          regenRate: '0.0000',
          lastUpdateAt,
          storageCap: 0,
        },
      ],
    });

    const iron = result.find((row) => row.resourceId === 'iron');
    const energy = result.find((row) => row.resourceId === 'energy');

    expect(iron?.amount).toBe(10);
    expect(iron?.regenRate).toBe(0);
    expect(energy?.amount).toBe(25);
    expect(energy?.regenRate).toBe(-10);
    expect(energy?.storageCap).toBe(100);
  });
});
