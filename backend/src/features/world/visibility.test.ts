import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkVisibility } from './visibility.js';
import { db } from '../../db/index.js';
import {
  systems,
  planets,
  discoveredPlanets,
  discoveredSystems,
  ships,
  users,
  planetResources,
  shipTypes,
  richness,
  buildings,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const TEST_SHIP_TYPE = 'test_scout';

describe('Visibility Check Service', () => {
  async function createTestUser(): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 1000000000)),
        tgUsername: 'visibility_test_user',
      })
      .returning();
    return user.id;
  }

  async function createTestShipType(sensorRange: number): Promise<void> {
    await db
      .insert(shipTypes)
      .values({
        id: TEST_SHIP_TYPE,
        name: { ru: 'Тестовый', en: 'Test Scout' },
        role: 'recon',
        hp: 10,
        speed: '1.00',
        cargo: 10,
        dps: 0,
        armor: 0,
        fuelConsumption: '0.10',
        buildTimeSec: 10,
        buildCost: { iron: 1 },
        requiredBuildings: [],
        sensorRange,
      })
      .onConflictDoUpdate({
        target: shipTypes.id,
        set: { sensorRange },
      });
  }

  async function createSystem(
    sectorX: number,
    sectorY: number,
    sectorZ: number,
    ownerId?: string,
    isHome: boolean = false,
  ): Promise<{ id: string; sectorX: number; sectorY: number; sectorZ: number }> {
    const [system] = await db
      .insert(systems)
      .values({
        sectorX,
        sectorY,
        sectorZ,
        x: '0.00',
        y: '0.00',
        z: '0.00',
        name: `System ${sectorX},${sectorY},${sectorZ}`,
        seed: Math.abs(sectorX * 10000 + sectorY * 100 + sectorZ),
        ownerId: ownerId || null,
        isHome,
      })
      .returning();
    return { id: system.id, sectorX, sectorY, sectorZ };
  }

  async function createPlanet(systemId: string, name: string): Promise<string> {
    const [planet] = await db
      .insert(planets)
      .values({
        systemId,
        biome: 'rocky',
        size: 10,
        slotCount: 8,
        name,
      })
      .returning();
    return planet.id;
  }

  async function createShip(
    userId: string,
    planetId: string,
  ): Promise<string> {
    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: TEST_SHIP_TYPE,
        locationPlanetId: planetId,
        status: 'idle',
      })
      .returning();
    return ship.id;
  }

  beforeEach(async () => {
    await db.delete(discoveredPlanets);
    await db.delete(discoveredSystems);
    await db.delete(planetResources);
    await db.delete(ships);
    await db.delete(buildings);
    await db.delete(richness);
    await db.delete(planets);
    await db.delete(systems);
    await db.delete(users);
    // Upsert test ship type instead of deleting all shipTypes — avoids races
    // with other parallel workers that may have ships referencing seed types.
    await createTestShipType(30);
  });

  afterEach(async () => {
    await db.delete(discoveredPlanets);
    await db.delete(discoveredSystems);
    await db.delete(planetResources);
    await db.delete(ships);
    await db.delete(buildings);
    await db.delete(richness);
    await db.delete(planets);
    await db.delete(systems);
    await db.delete(users);
  });

  it('discovers a planet in a nearby system within sensor range', async () => {
    const userId = await createTestUser();
    const shipSystem = await createSystem(0, 0, 0);
    const shipPlanetId = await createPlanet(shipSystem.id, 'Ship Planet');
    const shipId = await createShip(userId, shipPlanetId);

    const targetSystem = await createSystem(25, 0, 0);
    const targetPlanetId = await createPlanet(targetSystem.id, 'Target Planet');

    const discoveries = await checkVisibility(shipId);

    expect(discoveries.length).toBeGreaterThan(0);
    const planetDiscovery = discoveries.find((d) => d.id === targetPlanetId);
    expect(planetDiscovery).toBeDefined();
    expect(planetDiscovery?.type).toBe('planet');
    expect(planetDiscovery?.name).toBe('Target Planet');
  });

  it('does not discover a planet outside sensor range', async () => {
    const userId = await createTestUser();
    const shipSystem = await createSystem(0, 0, 0);
    const shipPlanetId = await createPlanet(shipSystem.id, 'Ship Planet');
    const shipId = await createShip(userId, shipPlanetId);

    // Mark ship's own system as already discovered to isolate the far-system test
    await db.insert(discoveredSystems).values({
      userId,
      systemId: shipSystem.id,
    });
    await db.insert(discoveredPlanets).values({
      userId,
      planetId: shipPlanetId,
    });

    const farSystem = await createSystem(100, 0, 0);
    await createPlanet(farSystem.id, 'Far Planet');

    const discoveries = await checkVisibility(shipId);

    expect(discoveries.length).toBe(0);
  });

  it('does not duplicate discoveries on repeated calls', async () => {
    const userId = await createTestUser();
    const shipSystem = await createSystem(0, 0, 0);
    const shipPlanetId = await createPlanet(shipSystem.id, 'Ship Planet');
    const shipId = await createShip(userId, shipPlanetId);

    const targetSystem = await createSystem(15, 0, 0);
    await createPlanet(targetSystem.id, 'Dupe Planet');

    await checkVisibility(shipId);
    const secondBatch = await checkVisibility(shipId);

    expect(secondBatch.length).toBe(0);
  });

  it('respects home system: foreign home system is not visible', async () => {
    const ownerId = await createTestUser();
    const foreignId = await createTestUser();

    const homeSystem = await createSystem(10, 0, 0, ownerId, true);
    await createPlanet(homeSystem.id, 'Home Planet');

    const shipSystem = await createSystem(0, 0, 0);
    const shipPlanetId = await createPlanet(shipSystem.id, 'Foreign Ship Planet');
    const shipId = await createShip(foreignId, shipPlanetId);

    // Pre-discover ship's own system so it doesn't appear in results
    await db.insert(discoveredSystems).values({
      userId: foreignId,
      systemId: shipSystem.id,
    });
    await db.insert(discoveredPlanets).values({
      userId: foreignId,
      planetId: shipPlanetId,
    });

    const discoveries = await checkVisibility(shipId);

    const systemDiscovery = discoveries.find((d) => d.type === 'system');
    expect(systemDiscovery).toBeUndefined();
  });

  it('discovers own home system', async () => {
    const userId = await createTestUser();

    const homeSystem = await createSystem(10, 0, 0, userId, true);
    const homePlanetId = await createPlanet(homeSystem.id, 'Home Planet');

    const shipPlanetId = await createPlanet(
      (await createSystem(0, 0, 0)).id,
      'Ship Planet',
    );
    const shipId = await createShip(userId, shipPlanetId);

    const discoveries = await checkVisibility(shipId);

    const systemDiscovery = discoveries.find((d) => d.type === 'system');
    expect(systemDiscovery).toBeDefined();
    expect(systemDiscovery?.id).toBe(homeSystem.id);
  });

  it('discovers all planets in a newly visible system', async () => {
    const userId = await createTestUser();
    const shipSystem = await createSystem(0, 0, 0);
    const shipPlanetId = await createPlanet(shipSystem.id, 'Ship Planet');
    const shipId = await createShip(userId, shipPlanetId);

    const targetSystem = await createSystem(20, 0, 0);
    const planet1 = await createPlanet(targetSystem.id, 'Planet A');
    const planet2 = await createPlanet(targetSystem.id, 'Planet B');
    const planet3 = await createPlanet(targetSystem.id, 'Planet C');

    const discoveries = await checkVisibility(shipId);

    const planetIds = discoveries
      .filter((d) => d.type === 'planet')
      .map((d) => d.id);
    expect(planetIds).toContain(planet1);
    expect(planetIds).toContain(planet2);
    expect(planetIds).toContain(planet3);
  });

  it('discovers both system and its planets', async () => {
    const userId = await createTestUser();
    const shipSystem = await createSystem(0, 0, 0);
    const shipPlanetId = await createPlanet(shipSystem.id, 'Ship Planet');
    const shipId = await createShip(userId, shipPlanetId);

    const targetSystem = await createSystem(18, 0, 0);
    await createPlanet(targetSystem.id, 'Planet in Range');

    const discoveries = await checkVisibility(shipId);

    const systemDisc = discoveries.find(
      (d) => d.type === 'system' && d.id === targetSystem.id,
    );
    expect(systemDisc).toBeDefined();

    const planetDisc = discoveries.find(
      (d) => d.type === 'planet' && d.name === 'Planet in Range',
    );
    expect(planetDisc).toBeDefined();
  });

  it('returns empty array for missing or invalid ship', async () => {
    const result = await checkVisibility('00000000-0000-0000-0000-000000000000');
    expect(result).toEqual([]);
  });

  it('respects Euclidean distance in 3D', async () => {
    const userId = await createTestUser();
    const shipSystem = await createSystem(0, 0, 0);
    const shipPlanetId = await createPlanet(shipSystem.id, 'Ship Planet');
    const shipId = await createShip(userId, shipPlanetId);

    const systemInside = await createSystem(10, 10, 10);
    await createPlanet(systemInside.id, 'Inside Planet');

    const systemOutside = await createSystem(20, 20, 20);
    await createPlanet(systemOutside.id, 'Outside Planet');

    const distInside = Math.sqrt(10 * 10 + 10 * 10 + 10 * 10);
    const distOutside = Math.sqrt(20 * 20 + 20 * 20 + 20 * 20);
    expect(distInside).toBeLessThanOrEqual(30);
    expect(distOutside).toBeGreaterThan(30);

    const discoveries = await checkVisibility(shipId);

    const insideDisc = discoveries.find(
      (d) => d.type === 'system' && d.id === systemInside.id,
    );
    expect(insideDisc).toBeDefined();

    const outsideDisc = discoveries.find(
      (d) => d.type === 'system' && d.id === systemOutside.id,
    );
    expect(outsideDisc).toBeUndefined();
  });
});
