import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../db/index.js';
import { foundColony } from './found-colony.js';
import { users, planets, systems, discoveredPlanets, ships, buildings, researchProgress } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

describe('foundColony', () => {
  let userId: string;
  let targetPlanetId: string;
  let colonizerShipId: string;
  let scoutShipId: string;

  beforeAll(async () => {
    // Setup test user
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'FoundColTest' + Math.random(),
    }).returning();
    userId = user.id;

    await db
      .insert(researchProgress)
      .values([
        { userId, branch: 'engineering', level: 5 },
        { userId, branch: 'logistics', level: 5 }
      ])
      .onConflictDoUpdate({
        target: [researchProgress.userId, researchProgress.branch],
        set: { level: 5 },
      });

    // Setup home system for the user (needed for distance and billing)
    const [homeSystem] = await db.insert(systems).values({
      ownerId: userId,
      isHome: true,
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      x: '0.00',
      y: '0.00',
      z: '0.00',
      name: 'Home System',
      seed: 123,
    }).returning();

    const [homePlanet] = await db.insert(planets).values({
      systemId: homeSystem.id,
      biome: 'green',
      size: 20,
      slotCount: 16,
      name: 'Home Planet',
    }).returning();

    // Seed resources on home planet
    const { resources: resourcesMeta } = await import('../../db/schema/resources.js');
    const allResources = await db.select().from(resourcesMeta);
    for (const res of allResources) {
      const { planetResources } = await import('../../db/schema/world.js');
      await db.insert(planetResources).values({
        planetId: homePlanet.id,
        resourceId: res.id,
        amount: '100000', // Plenty for testing
        regenRate: '10',
      });
    }

    // Setup target system and planet (close to home)
    const [system] = await db.insert(systems).values({
      isHome: false,
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      x: '100.00',
      y: '100.00',
      z: '100.00',
      name: 'Test System',
      seed: 789,
    }).returning();

    const [planet] = await db.insert(planets).values({
      systemId: system.id,
      biome: 'green',
      size: 10,
      slotCount: 8,
      name: 'Green Planet',
    }).returning();
    targetPlanetId = planet.id;

    // Discover the planet
    await db.insert(discoveredPlanets).values({
      userId,
      planetId: targetPlanetId,
    });

    // Setup colonizer ship
    const [colonizer] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'colonizer',
      locationPlanetId: targetPlanetId,
      status: 'idle',
    }).returning();
    colonizerShipId = colonizer.id;

    // Setup non-colonizer ship
    const [scout] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'scout',
      locationPlanetId: targetPlanetId,
      status: 'idle',
    }).returning();
    scoutShipId = scout.id;
  });

  it('rejects non-colonizer ships', async () => {
    await expect(foundColony(userId, scoutShipId, targetPlanetId)).rejects.toThrow('Only colonizer ships can found a colony');
  });

  it('rejects ships at different location', async () => {
    // Create another planet in the same system
    const [otherPlanet] = await db.insert(planets).values({
      systemId: (await db.query.planets.findFirst({ where: eq(planets.id, targetPlanetId) }))!.systemId,
      biome: 'rocky',
      size: 5,
      slotCount: 5,
      name: 'Other Planet' + Math.random(),
    }).returning();
    
    await expect(foundColony(userId, colonizerShipId, otherPlanet.id)).rejects.toThrow('Ship is not at the target planet');
  });

  it('successfully founds a colony and consumes ship', async () => {
    const colony = await foundColony(userId, colonizerShipId, targetPlanetId);
    
    expect(colony).toBeDefined();
    expect(colony.planetId).toBe(targetPlanetId);
    expect(colony.ownerId).toBe(userId);

    // Verify ship consumption
    const ship = await db.query.ships.findFirst({
      where: eq(ships.id, colonizerShipId)
    });
    expect(ship).toBeUndefined();

    // Verify initial building: Command Center L1 created *instantly*
    // (the colonizer ship IS the command center on arrival — no queue).
    const commandCenter = await db.query.buildings.findFirst({
      where: and(eq(buildings.planetId, targetPlanetId), eq(buildings.typeId, 'command_center'))
    });
    expect(commandCenter).toBeDefined();
    expect(commandCenter!.level).toBe(1);
    expect(commandCenter!.slotIndex).toBe(0);
    expect(commandCenter!.queueAction).toBeNull();
    expect(commandCenter!.queueCompletesAt).toBeNull();
  });

  it('rejects colonization if already colonized', async () => {
    // Create another colonizer
    const [newColonizer] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'colonizer',
      locationPlanetId: targetPlanetId,
      status: 'idle',
    }).returning();
    
    // Discover the planet again (it should already be discovered, but just in case)
    await db.insert(discoveredPlanets).values({
      userId,
      planetId: targetPlanetId,
    }).onConflictDoNothing();
    
    await expect(foundColony(userId, newColonizer.id, targetPlanetId)).rejects.toThrow('Planet already colonized');
  });
});
