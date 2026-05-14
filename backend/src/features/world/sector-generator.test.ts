import { describe, it, expect, beforeEach } from 'vitest';
import {
  COMMON_SYSTEM_PLANET_COUNT_MAX,
  COMMON_SYSTEM_PLANET_COUNT_MIN,
  generateCommonPlanetRichness,
  generateSystemsInSector,
} from './sector-generator.js';
import { db } from '../../db/index.js';
import {
  sectors,
  systems,
  planets,
  planetResources,
  richness,
  buildings,
  discoveredPlanets,
  ships,
  colonies,
  productionOrders,
} from '../../db/schema.js';
import { BIOMES, type BiomeType, isAnomalousCommonBiome } from './biomes.js';
import { RESOURCE_CATALOG_ROWS } from '../../db/seed/catalog-rows.js';
import { seedResources } from '../../db/seed/resources.js';

describe('generateSystemsInSector', () => {
  beforeEach(async () => {
    await seedResources();
  });

  beforeEach(async () => {
    await db.delete(productionOrders);
    await db.delete(ships);
    await db.delete(colonies);
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
      expect(systemPlanets.length).toBeGreaterThanOrEqual(COMMON_SYSTEM_PLANET_COUNT_MIN);
      expect(systemPlanets.length).toBeLessThanOrEqual(COMMON_SYSTEM_PLANET_COUNT_MAX);

      for (const planet of systemPlanets) {
        const richnessRows = await db.query.richness.findMany({
          where: (richness, { eq }) => eq(richness.planetId, planet.id),
        });
        const resourceRows = await db.query.planetResources.findMany({
          where: (planetResources, { eq }) => eq(planetResources.planetId, planet.id),
        });

        if (planet.biome === 'energy') {
          expect(richnessRows).toHaveLength(0);
          expect(resourceRows).toHaveLength(0);
        } else {
          expect(richnessRows.length).toBeGreaterThan(0);
          expect(resourceRows.map((row) => row.resourceId).sort()).toEqual(
            richnessRows.map((row) => row.resourceId).sort(),
          );
          expect(resourceRows.every((row) => Number(row.amount) === 0)).toBe(true);
          expect(resourceRows.every((row) => Number(row.regenRate) === 0)).toBe(true);
        }
      }
    }
  });

  it('guarantees an anomalous subtype when a common system rolls 9 planets', async () => {
    let foundNinePlanetSystem = false;

    for (let seed = 1; seed <= 60; seed += 1) {
      const [sector] = await db.insert(sectors).values({
        x: 1000 + seed,
        y: 0,
        z: 0,
        seed,
      }).returning();

      const [system] = await generateSystemsInSector(sector, 1);
      const systemPlanets = await db.query.planets.findMany({
        where: (planets, { eq }) => eq(planets.systemId, system!.id),
      });

      if (systemPlanets.length !== COMMON_SYSTEM_PLANET_COUNT_MAX) continue;

      foundNinePlanetSystem = true;
      expect(
        systemPlanets.some((planet) => isAnomalousCommonBiome(planet.biome as BiomeType)),
      ).toBe(true);
      break;
    }

    expect(foundNinePlanetSystem).toBe(true);
  });

  it('maps every active natural catalog resource to at least one common planet type', () => {
    const naturalCatalogResourceIds = RESOURCE_CATALOG_ROWS
      .filter((row) => Number(row.baseRegenRate) > 0)
      .map((row) => row.id);
    const biomeResourceIds = new Set(
      Object.values(BIOMES).flatMap((biome) => [
        ...biome.commonResources,
        ...biome.rareResources,
      ]),
    );

    for (const resourceId of naturalCatalogResourceIds) {
      expect(biomeResourceIds.has(resourceId)).toBe(true);
    }
    expect(biomeResourceIds.has('silicon_carbide')).toBe(false);
    expect(biomeResourceIds.has(['dark', 'matter'].join('_'))).toBe(false);
    expect(generateCommonPlanetRichness('energy', 20, 12, () => 0.5)).toEqual({});
  });
});
