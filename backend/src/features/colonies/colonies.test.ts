import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../db/index.js';
import { colonyService } from './colonies.js';
import { users, planets, systems, discoveredPlanets, colonies } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

describe('ColonyService', () => {
  let userId: string;
  let homePlanetId: string;
  let otherPlanetId: string;

  beforeAll(async () => {
    // Setup test user
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'ColTest' + Math.random(),
    }).returning();
    userId = user.id;

    // Setup home system
    const [homeSystem] = await db.insert(systems).values({
      ownerId: userId,
      isHome: true,
      sectorX: Math.floor(Math.random() * 100),
      sectorY: Math.floor(Math.random() * 100),
      sectorZ: Math.floor(Math.random() * 100),
      name: 'Home',
      seed: 123,
    }).returning();

    const [homePlanet] = await db.insert(planets).values({
      systemId: homeSystem.id,
      biome: 'rocky',
      size: 10,
      slotCount: 8,
      name: 'Home Planet',
    }).returning();
    homePlanetId = homePlanet.id;

    // Setup other system
    const [otherSystem] = await db.insert(systems).values({
      isHome: false,
      sectorX: Math.floor(Math.random() * 100),
      sectorY: Math.floor(Math.random() * 100),
      sectorZ: Math.floor(Math.random() * 100),
      name: 'Other' + Math.random(),
      seed: 456,
    }).returning();

    const [otherPlanet] = await db.insert(planets).values({
      systemId: otherSystem.id,
      biome: 'ice',
      size: 15,
      slotCount: 12,
      name: 'Other Planet',
    }).returning();
    otherPlanetId = otherPlanet.id;
  });

  it('rejects colonization of home system planets', async () => {
    const result = await colonyService.canColonize(userId, homePlanetId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cannot colonize home systems');
  });

  it('rejects colonization of undiscovered planets', async () => {
    const result = await colonyService.canColonize(userId, otherPlanetId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Planet not discovered');
  });

  it('allows colonization of discovered non-home planets', async () => {
    await db.insert(discoveredPlanets).values({
      userId,
      planetId: otherPlanetId,
    });

    const result = await colonyService.canColonize(userId, otherPlanetId);
    expect(result.allowed).toBe(true);
  });

  it('rejects colonization of already colonized planets', async () => {
    await colonyService.foundColony(userId, otherPlanetId);

    const result = await colonyService.canColonize(userId, otherPlanetId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Planet already colonized');
  });

  it('enforces colony limit', async () => {
    // Find the system ID of the "Other" system
    const system = await db.query.planets.findFirst({
        where: eq(planets.id, otherPlanetId)
    });
    const systemId = system!.systemId;

    // Current count for this user is 1. Limit is 5. Add 4 more.
    for (let i = 0; i < 4; i++) {
        const [p] = await db.insert(planets).values({
            systemId: systemId,
            biome: 'rocky',
            size: 10,
            slotCount: 8,
            name: `Limit Planet ${i} ${Math.random()}`,
        }).returning();
        
        await db.insert(discoveredPlanets).values({ userId, planetId: p.id });
        await colonyService.foundColony(userId, p.id);
    }

    // Try to add 6th
    const [extraPlanet] = await db.insert(planets).values({
        systemId: systemId,
        biome: 'rocky',
        size: 10,
        slotCount: 8,
        name: `Extra Planet ${Math.random()}`,
    }).returning();
    await db.insert(discoveredPlanets).values({ userId, planetId: extraPlanet.id });

    const result = await colonyService.canColonize(userId, extraPlanet.id);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Colony limit reached');
  });
});
