import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../db/index.js';
import {
  users,
  ships,
  planets,
  systems,
  shipTypes,
  researchProgress,
  discoveredSystems,
  discoveredPlanets,
  planetResources,
  richness,
  buildings,
  productionOrders,
  notifications,
  colonies,
} from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { jumpShip } from './jump.js';

describe('Jump Ship Feature', () => {
  async function createTestUser() {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 100000000)),
      tgUsername: `jumptest_${Date.now()}`,
    }).returning();
    return user;
  }

  async function createSetup() {
    const user = await createTestUser();
    
    const [originSystem] = await db.insert(systems).values({
      name: 'Origin System',
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      x: '0.00',
      y: '0.00',
      z: '0.00',
      seed: 123,
      ownerId: user.id,
      isHome: true,
    }).returning();

    const [originPlanet] = await db.insert(planets).values({
      systemId: originSystem.id,
      name: 'Origin Planet',
      biome: 'green',
      size: 15,
      slotCount: 12,
    }).returning();

    // Insert jump_ship type
    await db.insert(shipTypes).values({
      id: 'jump_ship',
      name: { ru: 'Прыжковый корабль', en: 'Jump Ship' },
      role: 'exploration',
      hp: 200,
      speed: '1.60',
      cargo: 50,
      dps: 25,
      armor: 10,
      fuelConsumption: '0.60',
      buildTimeSec: 2700,
      buildCost: {},
      sensorRange: 15,
    }).onConflictDoNothing();

    const [ship] = await db.insert(ships).values({
      ownerId: user.id,
      typeId: 'jump_ship',
      locationPlanetId: originPlanet.id,
      status: 'idle',
      fuel: '100',
    }).returning();

    return { user, originSystem, originPlanet, ship };
  }

  beforeEach(async () => {
    await db.delete(researchProgress);
    await db.delete(discoveredPlanets);
    await db.delete(discoveredSystems);
    await db.delete(ships);
    await db.delete(productionOrders);
    await db.delete(buildings);
    await db.delete(colonies);
    await db.delete(notifications);
    await db.delete(planetResources);
    await db.delete(richness);
    await db.delete(planets);
    await db.delete(systems);
    await db.delete(users);
  });

  it('should fail if Jump Drive research is missing', async () => {
    const { user, ship } = await createSetup();
    const result = await jumpShip(user.id, {
      shipId: ship.id,
      targetSector: { x: 1, y: 1, z: 1 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/jump_drive research level 1 required/i);
  });

  it('should fail if not a Jump Ship', async () => {
    const { user, originPlanet } = await createSetup();
    
    // Add a scout
    await db.insert(shipTypes).values({
      id: 'scout',
      name: { ru: 'Разведчик', en: 'Scout' },
      role: 'recon',
      hp: 40,
      speed: '2.00',
      cargo: 50,
      fuelConsumption: '0.30',
      buildTimeSec: 600,
      buildCost: {},
      sensorRange: 30,
    }).onConflictDoNothing();

    const [scout] = await db.insert(ships).values({
      ownerId: user.id,
      typeId: 'scout',
      locationPlanetId: originPlanet.id,
      status: 'idle',
    }).returning();

    const result = await jumpShip(user.id, {
      shipId: scout.id,
      targetSector: { x: 1, y: 1, z: 1 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Only Jump Ships');
  });

  it('should fail if not enough fuel', async () => {
    const { user, ship } = await createSetup();
    
    // Set research
    await db.insert(researchProgress).values({
      userId: user.id,
      branch: 'jump_drive',
      level: 1,
    });

    // Empty fuel
    await db.update(ships).set({ fuel: '10' }).where(eq(ships.id, ship.id));

    const result = await jumpShip(user.id, {
      shipId: ship.id,
      targetSector: { x: 1, y: 1, z: 1 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient Jump Fuel');
  });

  it('should perform jump successfully', async () => {
    const { user, ship } = await createSetup();
    
    // Set research
    await db.insert(researchProgress).values({
      userId: user.id,
      branch: 'jump_drive',
      level: 1,
    });

    const result = await jumpShip(user.id, {
      shipId: ship.id,
      targetSector: { x: 2, y: 3, z: 4 },
    });

    expect(result.success).toBe(true);
    expect(result.targetSystem).toBeDefined();
    expect(result.targetPlanet).toBeDefined();
    
    // Verify ship moved
    const updatedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(updatedShip!.locationPlanetId).toBe(result.targetPlanet.id);
    expect(Number(updatedShip!.fuel)).toBe(50); // 100 - 50

    // Verify discovery
    const discovery = await db.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, user.id),
        eq(discoveredSystems.systemId, result.targetSystem.id)
      ),
    });
    expect(discovery).toBeDefined();
  });

  it("does not choose another player's home system as a jump target", async () => {
    const { user, ship } = await createSetup();
    const targetSector = {
      x: Math.floor(Math.random() * 10000) + 100,
      y: Math.floor(Math.random() * 10000) + 100,
      z: Math.floor(Math.random() * 10000) + 100,
    };

    await db.insert(researchProgress).values({
      userId: user.id,
      branch: 'jump_drive',
      level: 1,
    });

    const [foreignOwner] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 100000000)),
      tgUsername: `jump_foreign_${Date.now()}`,
    }).returning();

    const [foreignHome] = await db.insert(systems).values({
      name: 'Foreign Home System',
      sectorX: targetSector.x,
      sectorY: targetSector.y,
      sectorZ: targetSector.z,
      x: '1.00',
      y: '1.00',
      z: '1.00',
      seed: 456,
      ownerId: foreignOwner.id,
      isHome: true,
    }).returning();

    const [foreignHomePlanet] = await db.insert(planets).values({
      systemId: foreignHome.id,
      name: 'Foreign Home Planet',
      biome: 'green',
      size: 12,
      slotCount: 10,
    }).returning();

    const result = await jumpShip(user.id, {
      shipId: ship.id,
      targetSector,
    });

    expect(result.success).toBe(true);
    expect(result.targetSystem?.id).not.toBe(foreignHome.id);
    expect(result.targetPlanet?.id).not.toBe(foreignHomePlanet.id);
    expect(result.targetSystem?.isHome).toBe(false);
    expect(result.targetSystem?.ownerId).toBeNull();
  });
});
