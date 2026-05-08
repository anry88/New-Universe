import { describe, it, expect, beforeEach } from 'vitest';
import { generateSystemsInSector } from './sector-generator.js';
import { db } from '../../db/index.js';
import { sectors, systems, planets, planetResources, richness, buildings, discoveredPlanets, ships } from '../../db/schema.js';

describe('generateSystemsInSector', () => {
  beforeEach(async () => {
    await db.delete(ships);
    await db.delete(buildings);
    await db.delete(discoveredPlanets);
    await db.delete(planetResources);
    await db.delete(richness);
    await db.delete(planets);
    await db.delete(systems);
    await db.delete(sectors);
  });

  it('should generate 5 systems for an empty sector', async () => {
    const [sector] = await db.insert(sectors).values({
      x: 1,
      y: 2,
      z: 3,
      seed: 12345,
    }).returning();

    const result = await generateSystemsInSector(sector, 5);

    expect(result).toHaveLength(5);

    const dbSystems = await db.query.systems.findMany({
      where: (systems, { eq }) => eq(systems.sectorX, 1),
    });
    expect(dbSystems).toHaveLength(5);
  });

  it('should not add systems if already at target count', async () => {
    const [sector] = await db.insert(sectors).values({
      x: 1,
      y: 2,
      z: 3,
      seed: 12345,
    }).returning();

    await generateSystemsInSector(sector, 5);

    const result = await generateSystemsInSector(sector, 5);

    expect(result).toHaveLength(5);

    const dbSystems = await db.query.systems.findMany({
      where: (systems, { eq }) => eq(systems.sectorX, 1),
    });
    expect(dbSystems).toHaveLength(5);
  });

  it('should not exceed 12 systems per sector', async () => {
    const [sector] = await db.insert(sectors).values({
      x: 1,
      y: 2,
      z: 3,
      seed: 12345,
    }).returning();

    const result = await generateSystemsInSector(sector, 15);

    expect(result.length).toBeLessThanOrEqual(12);
  });

  it('should create systems with correct sector coordinates', async () => {
    const [sector] = await db.insert(sectors).values({
      x: 5,
      y: 10,
      z: 15,
      seed: 99999,
    }).returning();

    await generateSystemsInSector(sector, 5);

    const dbSystems = await db.query.systems.findMany({
      where: (systems, { and, eq }) => and(
        eq(systems.sectorX, 5),
        eq(systems.sectorY, 10),
        eq(systems.sectorZ, 15)
      ),
    });

    expect(dbSystems).toHaveLength(5);
    for (const system of dbSystems) {
      expect(system.sectorX).toBe(5);
      expect(system.sectorY).toBe(10);
      expect(system.sectorZ).toBe(15);
      expect(system.ownerId).toBeNull();
      expect(system.isHome).toBe(false);
    }
  });

  it('should generate planets for each system', async () => {
    const [sector] = await db.insert(sectors).values({
      x: 1,
      y: 2,
      z: 3,
      seed: 12345,
    }).returning();

    await generateSystemsInSector(sector, 5);

    const dbSystems = await db.query.systems.findMany({
      where: (systems, { eq }) => eq(systems.sectorX, 1),
    });

    for (const system of dbSystems) {
      const systemPlanets = await db.query.planets.findMany({
        where: (planets, { eq }) => eq(planets.systemId, system.id),
      });
      expect(systemPlanets.length).toBeGreaterThanOrEqual(4);
      expect(systemPlanets.length).toBeLessThanOrEqual(7);
    }
  });
});
