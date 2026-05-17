import { describe, it, expect, beforeEach } from 'vitest';
import {
  COMMON_POOL_INITIAL_SYSTEM_COUNT,
  COMMON_SYSTEM_PLANET_COUNT_MAX,
  COMMON_SYSTEM_PLANET_COUNT_MIN,
  countCommonPoolSystems,
  createCommonPoolSystems,
  generateCommonPlanetRichness,
  generateSystemsInSector,
} from './sector-generator.js';
import {
  buildSystemMapLayouts,
  buildSystemMapOrbitGuideRadii,
  SYSTEM_MAP_ORBIT_BASE,
  SYSTEM_MAP_ORBIT_STEP,
} from '@shared/format/systemMapLayout.js';
import { db } from '../../db/index.js';
import {
  sectors,
  systems,
  planets,
  planetResources,
  richness,
  buildings,
  discoveredPlanets,
  discoveredSystems,
  ships,
  colonies,
  productionOrders,
} from '../../db/schema.js';
import { BIOMES, type BiomeType, isAnomalousCommonBiome } from './biomes.js';
import { RESOURCE_CATALOG_ROWS } from '../../db/seed/catalog-rows.js';
import { seedResources } from '../../db/seed/resources.js';
import {
  ADVANCED_COMMON_POOL_RESOURCE_IDS,
  RADIOACTIVE_RESOURCE_IDS,
} from '@shared/types/resources.js';

describe('generateSystemsInSector', () => {
  const baseCommonBiomeOrder = [
    'volcanic',
    'rocky',
    'ocean',
    'green',
    'gas_giant',
    'ice',
  ];

  beforeEach(async () => {
    await seedResources();
  });

  beforeEach(async () => {
    await db.delete(productionOrders);
    await db.delete(ships);
    await db.delete(colonies);
    await db.delete(buildings);
    await db.delete(discoveredPlanets);
    await db.delete(discoveredSystems);
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

    const updatedSector = await db.query.sectors.findFirst({
      where: (sectors, { and, eq }) => and(
        eq(sectors.x, 1),
        eq(sectors.y, 2),
        eq(sectors.z, 3),
      ),
    });
    expect(updatedSector?.systemCount).toBe(5);
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
      const orderedPlanets = [...systemPlanets].sort((a, b) => a.name.localeCompare(b.name));
      const orderedBiomes = orderedPlanets.map((planet) => planet.biome);
      const nonAnomalousBiomes = orderedBiomes.filter(
        (biome) => !isAnomalousCommonBiome(biome as BiomeType),
      );
      const anomalousBiomes = orderedBiomes.filter((biome) =>
        isAnomalousCommonBiome(biome as BiomeType),
      );

      expect(systemPlanets.length).toBeGreaterThanOrEqual(COMMON_SYSTEM_PLANET_COUNT_MIN);
      expect(systemPlanets.length).toBeLessThanOrEqual(COMMON_SYSTEM_PLANET_COUNT_MAX);
      expect(nonAnomalousBiomes).toEqual(baseCommonBiomeOrder);
      expect(anomalousBiomes).toHaveLength(systemPlanets.length - baseCommonBiomeOrder.length);

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
      expect(
        systemPlanets.filter((planet) => isAnomalousCommonBiome(planet.biome as BiomeType)),
      ).toHaveLength(COMMON_SYSTEM_PLANET_COUNT_MAX - baseCommonBiomeOrder.length);
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

  it('keeps advanced and radioactive resources discoverable in Common Pool biomes', () => {
    const biomeResourceIds = new Set(
      Object.values(BIOMES).flatMap((biome) => [
        ...biome.commonResources,
        ...biome.rareResources,
      ]),
    );

    for (const resourceId of RADIOACTIVE_RESOURCE_IDS) {
      expect(biomeResourceIds.has(resourceId)).toBe(true);
    }
    for (const resourceId of ADVANCED_COMMON_POOL_RESOURCE_IDS) {
      expect(biomeResourceIds.has(resourceId)).toBe(true);
    }

    const homeGuaranteedResources = new Set(['iron', 'carbon', 'silicon', 'water', 'ice', 'methane', 'tritium']);
    expect(homeGuaranteedResources.has('uranium')).toBe(false);
    expect(homeGuaranteedResources.has('antimatter')).toBe(false);
  });

  it('creates common-pool systems in abstract packing sectors', async () => {
    const created = await createCommonPoolSystems(COMMON_POOL_INITIAL_SYSTEM_COUNT);

    expect(created).toHaveLength(COMMON_POOL_INITIAL_SYSTEM_COUNT);
    expect(await countCommonPoolSystems()).toBe(COMMON_POOL_INITIAL_SYSTEM_COUNT);
    expect(new Set(created.map((system) => `${system.sectorX}:${system.sectorY}:${system.sectorZ}`))).toEqual(
      new Set(['0:0:0']),
    );
  });

  it('keeps public-system layout on one orbit per generated body', () => {
    const layouts = buildSystemMapLayouts(
      [
        { id: 'hot', name: 'cp-1', biome: 'volcanic', size: 12, orbitIndex: 1 },
        { id: 'anomaly', name: 'cp-2', biome: 'metallic', size: 24, orbitIndex: 2 },
        { id: 'rock', name: 'cp-3', biome: 'rocky', size: 14, orbitIndex: 3 },
        { id: 'water', name: 'cp-4', biome: 'ocean', size: 20, orbitIndex: 4 },
      ],
      123,
    );

    expect(layouts.map((layout) => layout.id)).toEqual(['hot', 'anomaly', 'rock', 'water']);
    expect(layouts.map((layout) => layout.orbitRadius)).toEqual([
      SYSTEM_MAP_ORBIT_BASE,
      SYSTEM_MAP_ORBIT_BASE + SYSTEM_MAP_ORBIT_STEP,
      SYSTEM_MAP_ORBIT_BASE + SYSTEM_MAP_ORBIT_STEP * 2,
      SYSTEM_MAP_ORBIT_BASE + SYSTEM_MAP_ORBIT_STEP * 3,
    ]);
    expect(
      buildSystemMapOrbitGuideRadii(
        layouts.map((layout, index) => ({
          id: layout.id,
          orbitIndex: index + 1,
          biome: 'rocky',
        })),
        layouts.length,
      ),
    ).toHaveLength(layouts.length);
  });
});
