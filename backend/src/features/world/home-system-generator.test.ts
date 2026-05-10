import { describe, it, expect } from 'vitest';
import { generateHomeSystem, MIN_HOME_CAPITAL_SLOT_COUNT } from './home-system-generator.js';
import { HOME_SYSTEM_BASE_BIOMES } from './biomes.js';
import { db } from '../../db/index.js';
import { users, systems, planets, richness, planetResources } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { formatPlanetCode, homeSystemShortTag } from '@shared/format/homeSystemNaming.js';

describe('Home System Generator', () => {
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
    expect(systemPlanets.length).toBeGreaterThanOrEqual(6);
    expect(systemPlanets.length).toBeLessThanOrEqual(7);

    const capital = systemPlanets.find((p) => p.name === formatPlanetCode(shortTag, 1));
    expect(capital).toBeDefined();
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
    const capital = systemPlanets.find((p) => p.name === formatPlanetCode(shortTag, 1));
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

    let tritiumFound = false;
    for (const planet of systemPlanets) {
      const pRes = await db.query.planetResources.findMany({
        where: eq(planetResources.planetId, planet.id),
      });
      const tritium = pRes.find(r => r.resourceId === 'tritium');
      if (tritium) {
        tritiumFound = true;
        const rate = parseFloat(tritium.regenRate);
        expect(rate).toBeGreaterThanOrEqual(3);
        expect(rate).toBeLessThanOrEqual(8);
      }
    }
    expect(tritiumFound).toBe(true);

    const forbidden = ['uranium', 'antimatter', 'dark_matter'];
    for (const planet of systemPlanets) {
      const pRich = await db.query.richness.findMany({
        where: eq(richness.planetId, planet.id),
      });
      for (const r of pRich) {
        expect(forbidden).not.toContain(r.resourceId);
      }
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
    const capital = systemPlanets.find((p) => p.name === formatPlanetCode(shortTag, 1));
    expect(capital).toBeDefined();

    const biomes = systemPlanets.map((p) => p.biome);
    for (const b of HOME_SYSTEM_BASE_BIOMES) {
      expect(biomes).toContain(b);
    }

    expect(capital!.biome).toBe('green');
    expect(capital!.slotCount).toBeGreaterThanOrEqual(MIN_HOME_CAPITAL_SLOT_COUNT);
  });
});
