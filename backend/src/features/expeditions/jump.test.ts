import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  buildings,
  colonies,
  discoveredPlanets,
  discoveredSystems,
  jumpGates,
  notifications,
  planets,
  planetResources,
  productionOrders,
  researchProgress,
  richness,
  sectors,
  ships,
  shipTypes,
  systems,
  users,
} from '../../db/schema.js';
import { seedResearchCatalog } from '../../db/seed/research.js';
import { seedResources } from '../../db/seed/resources.js';
import { jumpShip } from './jump.js';
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting.js';

const RANDOM_JUMP_NOW = new Date('2026-05-13T12:00:00.000Z');
const REPEAT_JUMP_NOW = new Date('2026-05-13T12:10:00.000Z');

describe('Recon Probe Jump Gate Discovery', () => {
  async function createTestUser(usernamePrefix: string) {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 100000000)),
      tgUsername: `${usernamePrefix}_${Date.now()}`,
    }).returning();
    return user;
  }

  async function createSetup() {
    const user = await createTestUser('jumptest');

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

    await db.insert(planetResources).values({
      planetId: originPlanet.id,
      resourceId: JUMP_FUEL_RESOURCE_ID,
      amount: '100',
      regenRate: '0',
    });

    await db.insert(shipTypes).values({
      id: 'recon_probe',
      name: { ru: 'Разведывательный зонд', en: 'Recon Probe' },
      role: 'exploration',
      hp: 20,
      speed: '4.00',
      cargo: 0,
      dps: 0,
      armor: 0,
      fuelConsumption: '0.10',
      buildTimeSec: 300,
      buildCost: {},
      sensorRange: 60,
    }).onConflictDoNothing();
    await db.insert(shipTypes).values({
      id: 'scout',
      name: { ru: 'Разведчик', en: 'Scout' },
      role: 'recon',
      hp: 40,
      speed: '2.00',
      cargo: 50,
      dps: 0,
      armor: 0,
      fuelConsumption: '0.30',
      buildTimeSec: 600,
      buildCost: {},
      sensorRange: 30,
    }).onConflictDoNothing();

    const [ship] = await db.insert(ships).values({
      ownerId: user.id,
      typeId: 'recon_probe',
      locationPlanetId: originPlanet.id,
      status: 'idle',
      fuel: '100',
    }).returning();

    return { user, originSystem, originPlanet, ship };
  }

  async function unlockJumpDrive(userId: string) {
    await db.insert(researchProgress).values({
      userId,
      branch: 'jump_drive',
      level: 1,
    });
  }

  beforeEach(async () => {
    await db.delete(jumpGates);
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
    await db.delete(sectors);
    await seedResearchCatalog();
    await seedResources();
  });

  it('denies random jump while the Jump Gate is locked', async () => {
    const { user, ship } = await createSetup();

    const result = await jumpShip(
      user.id,
      {
        shipId: ship.id,
        mode: 'random',
      },
      { now: RANDOM_JUMP_NOW },
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/jump drive research level 1 required/i);

    const gateRows = await db.query.jumpGates.findMany({
      where: eq(jumpGates.userId, user.id),
    });
    expect(gateRows).toHaveLength(0);
  });

  it('rejects deprecated manual sector jumps without using client coordinates', async () => {
    const { user, ship } = await createSetup();
    await unlockJumpDrive(user.id);

    const result = await jumpShip(user.id, {
      shipId: ship.id,
      targetSector: { x: 2, y: 3, z: 4 },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/manual sector jumps are deprecated/i);

    const createdSector = await db.query.sectors.findFirst({
      where: and(eq(sectors.x, 2), eq(sectors.y, 3), eq(sectors.z, 4)),
    });
    expect(createdSector).toBeUndefined();
  });

  it('requires a recon probe only for opening a new random system', async () => {
    const { user, originPlanet } = await createSetup();
    await unlockJumpDrive(user.id);
    const [scout] = await db.insert(ships).values({
      ownerId: user.id,
      typeId: 'scout',
      locationPlanetId: originPlanet.id,
      status: 'idle',
      fuel: '100',
    }).returning();

    const result = await jumpShip(
      user.id,
      { shipId: scout.id, mode: 'random' },
      {
        now: RANDOM_JUMP_NOW,
        selectRandomSector: () => ({ x: 2, y: 3, z: 4 }),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only recon probes/i);
    const stillDocked = await db.query.ships.findFirst({
      where: eq(ships.id, scout.id),
    });
    expect(stillDocked?.locationPlanetId).toBe(originPlanet.id);
  });

  it('performs a server-authoritative random jump, records a known destination, and consumes the recon probe', async () => {
    const { user, ship, originPlanet } = await createSetup();
    await unlockJumpDrive(user.id);

    const result = await jumpShip(
      user.id,
      {
        shipId: ship.id,
        mode: 'random',
      },
      {
        now: RANDOM_JUMP_NOW,
        selectRandomSector: () => ({ x: 2, y: 3, z: 4 }),
      },
    );

    expect(result.success).toBe(true);
    expect(result.targetSystem).toMatchObject({
      sector: { x: 2, y: 3, z: 4 },
    });
    expect(result.targetPlanet).toBeDefined();
    expect(result.targetSystem?.id).toBe(result.destination?.systemId);
    expect(result.destination).toMatchObject({
      source: 'random_jump',
      lastVisitedAt: RANDOM_JUMP_NOW.toISOString(),
    });

    expect(result.ship).toMatchObject({
      id: ship.id,
      typeId: 'recon_probe',
      status: 'consumed',
      locationPlanetId: null,
    });
    const updatedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(updatedShip).toBeUndefined();
    const originJumpFuel = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, originPlanet.id),
        eq(planetResources.resourceId, JUMP_FUEL_RESOURCE_ID),
      ),
    });
    expect(Number(originJumpFuel?.amount)).toBe(50);

    const discovery = await db.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, user.id),
        eq(discoveredSystems.systemId, result.targetSystem!.id),
      ),
    });
    expect(discovery?.source).toBe('random_jump');
    expect(discovery?.lastVisitedAt?.toISOString()).toBe(RANDOM_JUMP_NOW.toISOString());

    const planetDiscoveries = await db.query.discoveredPlanets.findMany({
      where: eq(discoveredPlanets.userId, user.id),
    });
    expect(planetDiscoveries).toHaveLength(0);
  });

  it('repeats travel to a known destination by destination id', async () => {
    const { user, ship, originPlanet } = await createSetup();
    await unlockJumpDrive(user.id);

    const firstJump = await jumpShip(
      user.id,
      { shipId: ship.id, mode: 'random' },
      {
        now: RANDOM_JUMP_NOW,
        selectRandomSector: () => ({ x: 5, y: 6, z: 7 }),
      },
    );
    expect(firstJump.success).toBe(true);
    const [scout] = await db.insert(ships).values({
      ownerId: user.id,
      typeId: 'scout',
      locationPlanetId: originPlanet.id,
      status: 'idle',
      fuel: '100',
    }).returning();

    const secondJump = await jumpShip(
      user.id,
      {
        shipId: scout.id,
        destinationSystemId: firstJump.destination!.systemId,
      },
      { now: REPEAT_JUMP_NOW },
    );

    expect(secondJump.success).toBe(true);
    expect(secondJump.targetSystem?.id).toBe(firstJump.targetSystem?.id);
    expect(secondJump.destination?.source).toBe('random_jump');
    expect(secondJump.destination?.lastVisitedAt).toBe(REPEAT_JUMP_NOW.toISOString());

    const updatedShip = await db.query.ships.findFirst({
      where: eq(ships.id, scout.id),
    });
    expect(Number(updatedShip?.fuel)).toBe(100);
    expect(updatedShip?.locationPlanetId).toBe(secondJump.arrivalPlanetId);
    const originJumpFuel = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, originPlanet.id),
        eq(planetResources.resourceId, JUMP_FUEL_RESOURCE_ID),
      ),
    });
    expect(Number(originJumpFuel?.amount)).toBe(0);

    const discovery = await db.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, user.id),
        eq(discoveredSystems.systemId, firstJump.destination!.systemId),
      ),
    });
    expect(discovery?.source).toBe('random_jump');
    expect(discovery?.lastVisitedAt?.toISOString()).toBe(REPEAT_JUMP_NOW.toISOString());
  });

  it('rejects random jump without stored Jump Fuel on the current planet', async () => {
    const { user, ship, originPlanet } = await createSetup();
    await unlockJumpDrive(user.id);
    await db
      .update(planetResources)
      .set({ amount: String(JUMP_GATE_JUMP_FUEL_COST - 1) })
      .where(
        and(
          eq(planetResources.planetId, originPlanet.id),
          eq(planetResources.resourceId, JUMP_FUEL_RESOURCE_ID),
        ),
      );

    const result = await jumpShip(
      user.id,
      { shipId: ship.id, mode: 'random' },
      {
        now: RANDOM_JUMP_NOW,
        selectRandomSector: () => ({ x: 11, y: 12, z: 13 }),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not enough jump_fuel');
    const createdSector = await db.query.sectors.findFirst({
      where: and(eq(sectors.x, 11), eq(sectors.y, 12), eq(sectors.z, 13)),
    });
    expect(createdSector).toBeUndefined();
  });

  it("does not choose another player's home system as a random jump target", async () => {
    const { user, ship } = await createSetup();
    const targetSector = { x: 8, y: 9, z: 10 };
    await unlockJumpDrive(user.id);

    const foreignOwner = await createTestUser('jump_foreign');
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

    const result = await jumpShip(
      user.id,
      { shipId: ship.id, mode: 'random' },
      {
        now: RANDOM_JUMP_NOW,
        selectRandomSector: () => targetSector,
      },
    );

    expect(result.success).toBe(true);
    expect(result.targetSystem?.id).not.toBe(foreignHome.id);
    expect(result.arrivalPlanetId).not.toBe(foreignHomePlanet.id);

    const targetSystem = await db.query.systems.findFirst({
      where: eq(systems.id, result.targetSystem!.id),
    });
    expect(targetSystem?.isHome).toBe(false);
    expect(targetSystem?.ownerId).toBeNull();
  });
});
