import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../db/index.js';
import { colonyService } from './colonies.js';
import {
  users,
  planets,
  systems,
  discoveredPlanets,
  researchProgress,
} from '../../db/schema.js';
import { maxColoniesForLogisticsLevel } from '../../config/colonization-rules.js';

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
      x: '0.00',
      y: '0.00',
      z: '0.00',
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
      x: '100.00',
      y: '100.00',
      z: '100.00',
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

  it('rejects undiscovered own home-system planets', async () => {
    const result = await colonyService.canColonize(userId, homePlanetId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Planet not discovered');
  });

  it('allows discovered own home-system planets without an active base', async () => {
    await db
      .insert(discoveredPlanets)
      .values({ userId, planetId: homePlanetId })
      .onConflictDoNothing();

    const result = await colonyService.canColonize(userId, homePlanetId);
    expect(result.allowed).toBe(true);
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

  it('enforces the Logistics-scaled colony limit', async () => {
    const [limitUser] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: `ColLimit${Math.random()}`,
    }).returning();

    const [system] = await db.insert(systems).values({
      isHome: false,
      sectorX: Math.floor(Math.random() * 100),
      sectorY: Math.floor(Math.random() * 100),
      sectorZ: Math.floor(Math.random() * 100),
      x: '100.00',
      y: '100.00',
      z: '100.00',
      name: `Limit System ${Math.random()}`,
      seed: 789,
    }).returning();

    const createDiscoveredPlanet = async (name: string) => {
      const [planet] = await db.insert(planets).values({
        systemId: system.id,
        biome: 'rocky',
        size: 10,
        slotCount: 8,
        name: `${name} ${Math.random()}`,
      }).returning();
      await db.insert(discoveredPlanets).values({
        userId: limitUser.id,
        planetId: planet.id,
      });
      return planet;
    };

    const firstPlanet = await createDiscoveredPlanet('Base Limit Planet');
    await colonyService.foundColony(limitUser.id, firstPlanet.id);

    const secondPlanet = await createDiscoveredPlanet('Second Limit Planet');
    const blockedAtBase = await colonyService.canColonize(limitUser.id, secondPlanet.id);
    expect(blockedAtBase.allowed).toBe(false);
    expect(blockedAtBase.reason).toBe('Colony limit reached');

    await db.insert(researchProgress).values({
      userId: limitUser.id,
      branch: 'logistics',
      level: 1,
    });

    const allowedWithLogistics = await colonyService.canColonize(limitUser.id, secondPlanet.id);
    expect(allowedWithLogistics.allowed).toBe(true);

    await colonyService.foundColony(limitUser.id, secondPlanet.id);
    for (let i = 2; i < maxColoniesForLogisticsLevel(1); i++) {
      const planet = await createDiscoveredPlanet(`Limit Fill Planet ${i}`);
      await colonyService.foundColony(limitUser.id, planet.id);
    }

    const extraPlanet = await createDiscoveredPlanet('Extra Limit Planet');
    const result = await colonyService.canColonize(limitUser.id, extraPlanet.id);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Colony limit reached');
  });
});
