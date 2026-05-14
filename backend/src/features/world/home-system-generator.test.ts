import { beforeAll, describe, it, expect } from 'vitest';
import {
  generateHomeSystem,
  HOME_PLANET_COUNT,
  MIN_HOME_CAPITAL_SLOT_COUNT,
} from './home-system-generator.js';
import { BIOME_ORBIT_TIER, HOME_SYSTEM_BASE_BIOMES } from './biomes.js';
import { db } from '../../db/index.js';
import { users, systems, planets, richness, planetResources, buildings } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { formatPlanetCode, homeSystemShortTag } from '@shared/format/homeSystemNaming.js';
import {
  buildSystemMapLayouts,
  SYSTEM_MAP_ORBIT_BASE,
  SYSTEM_MAP_ORBIT_STEP,
} from '@shared/format/systemMapLayout.js';
import { seedResources } from '../../db/seed/resources.js';

describe('Home System Generator', () => {
  beforeAll(async () => {
    await seedResources();
  });

  it('should generate identical systems for the same userId (determinism)', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser',
    }).returning();

    const systemId1 = await generateHomeSystem(user.id);
    
    const systemId2 = await generateHomeSystem(user.id);
    expect(systemId1).toBe(systemId2);

    const system = await db.query.systems.findFirst({
      where: eq(systems.id, systemId1),
    });
    expect(system?.isHome).toBe(true);
    expect(system?.ownerId).toBe(user.id);
    const shortTag = homeSystemShortTag(systemId1);
    expect(system?.name).toContain(shortTag);
    expect(system?.name).toContain('system');

    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId1),
    });
    expect(systemPlanets.length).toBe(HOME_PLANET_COUNT);

    // The capital (green biome) is always inserted first so that
    // existing call sites that pick "the home planet" by the lowest
    // planet-name suffix keep working. Capital is `<tag>-1` and the
    // remaining planets are `<tag>-2..` in biome-orbit order.
    const capital = systemPlanets.find(
      (p) => p.name === formatPlanetCode(shortTag, 1),
    );
    expect(capital).toBeDefined();
    expect(capital!.biome).toBe('green');
  });

  it('should guarantee basic resources and tritium distribution', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_res',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    const shortTag = homeSystemShortTag(systemId);
    const capital = systemPlanets.find(
      (p) => p.name === formatPlanetCode(shortTag, 1),
    );
    expect(capital).toBeDefined();

    const firstPlanetRichness = await db.query.richness.findMany({
      where: eq(richness.planetId, capital!.id),
    });
    const resIds = firstPlanetRichness.map(r => r.resourceId);
    expect(resIds).toContain('water');
    expect(resIds).toContain('iron');
    expect(resIds).toContain('carbon');
    expect(resIds).toContain('silicon');
    expect(resIds).toContain('methane');
    expect(resIds).toContain('oil');
    expect(Object.fromEntries(firstPlanetRichness.map((row) => [row.resourceId, row.value]))).toMatchObject({
      iron: 2,
      carbon: 2,
      silicon: 2,
      water: 2,
    });

    let tritiumFound = false;
    for (const planet of systemPlanets) {
      const pRes = await db.query.planetResources.findMany({
        where: eq(planetResources.planetId, planet.id),
      });
      const tritium = pRes.find(r => r.resourceId === 'tritium');
      if (tritium) {
        tritiumFound = true;
        expect(Number(tritium.regenRate)).toBe(0);
      }
    }
    expect(tritiumFound).toBe(true);

    const forbidden = ['uranium', 'antimatter'];
    for (const planet of systemPlanets) {
      const pRich = await db.query.richness.findMany({
        where: eq(richness.planetId, planet.id),
      });
      for (const r of pRich) {
        expect(forbidden).not.toContain(r.resourceId);
      }
    }
  });

  it('starts all home-system resource rows without passive regen', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_zero_regen',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    for (const planet of systemPlanets) {
      const rows = await db.query.planetResources.findMany({
        where: eq(planetResources.planetId, planet.id),
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => Number(row.regenRate) === 0)).toBe(true);
    }
  });

  it('should cover every HOME_SYSTEM_BASE_BIOME and give the capital enough slots', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_biomes',
    }).returning();

    const systemId = await generateHomeSystem(user.id);

    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    const shortTag = homeSystemShortTag(systemId);
    const capital = systemPlanets.find(
      (p) => p.name === formatPlanetCode(shortTag, 1),
    );
    expect(capital).toBeDefined();

    const biomes = systemPlanets.map((p) => p.biome);
    for (const b of HOME_SYSTEM_BASE_BIOMES) {
      expect(biomes).toContain(b);
    }

    expect(capital!.biome).toBe('green');
    expect(capital!.slotCount).toBeGreaterThanOrEqual(MIN_HOME_CAPITAL_SLOT_COUNT);
  });

  it('places a finished Command Center on the capital (slot 0)', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_cc_genesis',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });
    const shortTag = homeSystemShortTag(systemId);
    const capital = systemPlanets.find(
      (p) => p.name === formatPlanetCode(shortTag, 1),
    );
    expect(capital).toBeDefined();
    const cc = await db.query.buildings.findFirst({
      where: and(eq(buildings.planetId, capital!.id), eq(buildings.typeId, 'command_center')),
    });
    expect(cc).toBeDefined();
    expect(cc!.slotIndex).toBe(0);
    expect(cc!.level).toBe(1);
    expect(cc!.queueAction).toBeNull();
    expect(cc!.queueCompletesAt).toBeNull();
  });

  it('orders non-capital planets by biome orbit tier (inner → outer)', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_orbits',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    // Planets are named `<tag>-1, <tag>-2, ...` in insertion order:
    // `-1` is the capital (always green), and `-2..-8` are the seven
    // remaining planets sorted by biome orbit tier (volcanic → ice).
    const byIndex = systemPlanets
      .map((p) => {
        const m = p.name?.match(/-(\d+)$/);
        return { planet: p, idx: m ? parseInt(m[1]!, 10) : 0 };
      })
      .sort((a, b) => a.idx - b.idx);

    expect(byIndex[0]!.planet.biome).toBe('green'); // capital first
    const nonCapital = byIndex.slice(1);
    expect(nonCapital.map(({ planet }) => planet.biome)).toEqual([
      'volcanic',
      'volcanic',
      'rocky',
      'rocky',
      'ocean',
      'gas_giant',
      'ice',
    ]);

    let prevTier = 0;
    for (const { planet } of nonCapital) {
      const tier =
        BIOME_ORBIT_TIER[planet.biome as keyof typeof BIOME_ORBIT_TIER];
      expect(tier).toBeGreaterThanOrEqual(prevTier);
      prevTier = tier;
    }

    // Inner non-capital must be volcanic (tier 1); outermost ice (tier 6).
    expect(nonCapital[0]!.planet.biome).toBe('volcanic');
    expect(nonCapital[nonCapital.length - 1]!.planet.biome).toBe('ice');
  });

  it('keeps extreme starter biomes bounded and applies the ice-world layer profile', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_biome_balance',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    expect(systemPlanets).toHaveLength(HOME_PLANET_COUNT);
    expect(systemPlanets.filter((p) => p.biome === 'volcanic')).toHaveLength(2);
    expect(systemPlanets.filter((p) => p.biome === 'ice')).toHaveLength(1);
    expect(systemPlanets.filter((p) => p.biome === 'rocky')).toHaveLength(2);

    const icePlanets = systemPlanets.filter((p) => p.biome === 'ice');
    for (const icePlanet of icePlanets) {
      const iceRichness = await db.query.richness.findMany({
        where: eq(richness.planetId, icePlanet.id),
      });
      const richnessByResource = Object.fromEntries(
        iceRichness.map((row) => [row.resourceId, row.value]),
      );
      expect(Object.keys(richnessByResource)).not.toContain('biomass');
      expect(richnessByResource.ice).toBeGreaterThan(richnessByResource.water ?? 0);
      expect(richnessByResource.oil).toBe(1);
      expect(richnessByResource.tritium).toBe(1);
      expect(richnessByResource.aluminum ?? 0).toBe(0);
    }
  });

  it('places the rebalance resource slots on ocean, rocky, and gas worlds', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_resource_rebalance',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    async function richnessMap(planetId: string) {
      const rows = await db.query.richness.findMany({
        where: eq(richness.planetId, planetId),
      });
      return Object.fromEntries(rows.map((row) => [row.resourceId, row.value]));
    }

    const ocean = systemPlanets.find((planet) => planet.biome === 'ocean');
    expect(ocean).toBeDefined();
    const oceanRichness = await richnessMap(ocean!.id);
    expect(oceanRichness.water).toBe(4);
    expect(oceanRichness.oxygen).toBe(2);
    expect(oceanRichness.hydrogen).toBe(1);

    const gas = systemPlanets.find((planet) => planet.biome === 'gas_giant');
    expect(gas).toBeDefined();
    const gasRichness = await richnessMap(gas!.id);
    expect(gasRichness).toMatchObject({
      methane: 2,
      oxygen: 2,
      hydrogen: 2,
      nitrogen: 1,
    });
    expect(gasRichness.tritium ?? 0).toBe(0);

    const rockyRichness = await Promise.all(
      systemPlanets
        .filter((planet) => planet.biome === 'rocky')
        .map((planet) => richnessMap(planet.id)),
    );
    expect(rockyRichness.some((row) => row.iron === 2)).toBe(true);
    expect(rockyRichness.some((row) => row.carbon === 2)).toBe(true);
    expect(rockyRichness.some((row) => row.silver === 1)).toBe(true);
    expect(rockyRichness.some((row) => row.gold === 1)).toBe(true);
  });

  it('covers local exit resources across the starter system', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_exit_resources',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    const allResourceIds = new Set<string>();
    for (const planet of systemPlanets) {
      const rows = await db.query.richness.findMany({
        where: eq(richness.planetId, planet.id),
      });
      rows.forEach((row) => allResourceIds.add(row.resourceId));
    }

    for (const resourceId of [
      'iron',
      'carbon',
      'silicon',
      'water',
      'methane',
      'oil',
      'biomass',
      'oxygen',
      'hydrogen',
      'copper',
      'aluminum',
      'silver',
      'titanium',
      'gold',
      'nitrogen',
      'sulfur',
      'ice',
      'tritium',
    ]) {
      expect(allResourceIds.has(resourceId)).toBe(true);
    }
  });

  it('gives every starter system enough tritium for Jump Fuel production', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_tritium_starter',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    // Tritium lives on the single ice world — outer-orbit rares are always
    // seeded by the generator, so it must be present.
    let totalTritiumRichness = 0;
    let iceTritiumRichness = 0;
    for (const planet of systemPlanets) {
      const rows = await db.query.richness.findMany({
        where: eq(richness.planetId, planet.id),
      });
      for (const r of rows) {
        if (r.resourceId === 'tritium') totalTritiumRichness += r.value;
        if (planet.biome === 'ice' && r.resourceId === 'tritium') {
          iceTritiumRichness += r.value;
        }
      }
    }
    expect(totalTritiumRichness).toBeGreaterThanOrEqual(1);
    expect(iceTritiumRichness).toBe(totalTritiumRichness);
  });

  it('planet sizes vary visibly across biomes', async () => {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'testuser_sizes',
    }).returning();

    const systemId = await generateHomeSystem(user.id);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, systemId),
    });

    const sizes = systemPlanets.map((p) => p.size);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    // Gas giants reach the "giant" band (30+) and rocky/volcanic worlds
    // sit in the "small" band (≤16). Spread must be visible.
    expect(maxSize - minSize).toBeGreaterThanOrEqual(10);

    // Specifically: every gas_giant must be larger than every volcanic.
    const volcanic = systemPlanets.filter((p) => p.biome === 'volcanic');
    const giants = systemPlanets.filter((p) => p.biome === 'gas_giant');
    for (const v of volcanic) {
      for (const g of giants) {
        expect(g.size).toBeGreaterThan(v.size);
      }
    }
  });

  it('lays out discovered planets visually from hot inner worlds to cold outer worlds', async () => {
    const planetsForLayout = [
      { id: 'ice', name: 'x-8', biome: 'ice', size: 26 },
      { id: 'capital', name: 'x-1', biome: 'green', size: 22 },
      { id: 'volcanic-a', name: 'x-2', biome: 'volcanic', size: 12 },
      { id: 'volcanic-b', name: 'x-3', biome: 'volcanic', size: 14 },
      { id: 'gas', name: 'x-7', biome: 'gas_giant', size: 36 },
      { id: 'ocean', name: 'x-6', biome: 'ocean', size: 22 },
      { id: 'rocky-a', name: 'x-4', biome: 'rocky', size: 14 },
      { id: 'rocky-b', name: 'x-5', biome: 'rocky', size: 15 },
    ];

    const layouts = buildSystemMapLayouts(planetsForLayout, 123);
    expect(layouts.map((layout) => layout.id)).toEqual([
      'volcanic-a',
      'volcanic-b',
      'rocky-a',
      'rocky-b',
      'ocean',
      'capital',
      'gas',
      'ice',
    ]);
    expect(layouts.find((layout) => layout.id === 'capital')!.orbitRadius).toBe(
      SYSTEM_MAP_ORBIT_BASE + 5 * SYSTEM_MAP_ORBIT_STEP,
    );
    expect(layouts.find((layout) => layout.id === 'capital')!.orbitRadius).toBeGreaterThan(
      layouts.find((layout) => layout.id === 'ocean')!.orbitRadius,
    );
    const capitalOnlyLayout = buildSystemMapLayouts(
      [{ id: 'capital', name: 'x-1', biome: 'green', size: 22 }],
      123,
    )[0]!;
    const capitalLayout = layouts.find((layout) => layout.id === 'capital')!;
    expect(capitalOnlyLayout.orbitRadius).toBe(capitalLayout.orbitRadius);
    expect(capitalOnlyLayout.x).toBeCloseTo(capitalLayout.x, 8);
    expect(capitalOnlyLayout.y).toBeCloseTo(capitalLayout.y, 8);
    expect(layouts.find((layout) => layout.id === 'gas')!.spriteSize).toBeGreaterThan(
      layouts.find((layout) => layout.id === 'rocky-a')!.spriteSize,
    );
  });
});
