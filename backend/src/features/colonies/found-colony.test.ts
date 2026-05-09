import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../db/index.js';
import { foundColony } from './found-colony.js';
import { users, planets, systems, discoveredPlanets, ships, buildings } from '../../db/schema.js';
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

    // Setup system and planet
    const [system] = await db.insert(systems).values({
      isHome: false,
      sectorX: Math.floor(Math.random() * 1000),
      sectorY: Math.floor(Math.random() * 1000),
      sectorZ: Math.floor(Math.random() * 1000),
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

    // Verify initial building (Command Center L1)
    const commandCenter = await db.query.buildings.findFirst({
      where: and(eq(buildings.planetId, targetPlanetId), eq(buildings.typeId, 'command_center'))
    });
    expect(commandCenter).toBeDefined();
    expect(commandCenter!.level).toBe(1);
    expect(commandCenter!.slotIndex).toBe(0);
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
