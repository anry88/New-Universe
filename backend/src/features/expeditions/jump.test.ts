import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  buildings,
  colonies,
  discoveredPlanets,
  discoveredSystems,
  expeditions,
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
import { processExpeditions } from '../../workers/tick-expeditions.js';
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting.js';
import { SHIP_STATUS_DESTROYED } from '@shared/types/combat.js';
import { countCommonPoolSystems, createCommonPoolSystems } from '../world/sector-generator.js';

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
    await db.delete(expeditions);
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
    expect(result.error).toContain('known Jump Gate destination');
    expect(result.error).not.toContain('destinationSystemId');

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
      { now: RANDOM_JUMP_NOW },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Recon Probe');
    expect(result.error).not.toContain('recon_probe');
    const stillDocked = await db.query.ships.findFirst({
      where: eq(ships.id, scout.id),
    });
    expect(stillDocked?.locationPlanetId).toBe(originPlanet.id);
  });

  it('launches random discovery to the Home Gate, then opens the system and consumes the recon probe on arrival', async () => {
    const { user, ship, originPlanet } = await createSetup();
    await unlockJumpDrive(user.id);

    const result = await jumpShip(
      user.id,
      {
        shipId: ship.id,
        mode: 'random',
      },
      { now: RANDOM_JUMP_NOW },
    );

    expect(result.success).toBe(true);
    expect(result.ship).toMatchObject({
      id: ship.id,
      typeId: 'recon_probe',
      status: 'moving',
      locationPlanetId: null,
    });
    expect(result.queueItem?.id).toBeDefined();
    const updatedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(updatedShip?.status).toBe('moving');
    expect(updatedShip?.locationPlanetId).toBeNull();
    const originJumpFuel = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, originPlanet.id),
        eq(planetResources.resourceId, JUMP_FUEL_RESOURCE_ID),
      ),
    });
    expect(Number(originJumpFuel?.amount)).toBe(100 - JUMP_GATE_JUMP_FUEL_COST);

    const pendingExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, result.queueItem!.id),
    });
    const pendingTargetSystemId =
      typeof pendingExpedition?.result?.pendingRandomDiscoverySystemId === 'string'
        ? pendingExpedition.result.pendingRandomDiscoverySystemId
        : null;
    expect(pendingExpedition?.status).toBe('in_flight');
    expect(pendingExpedition?.result).toMatchObject({
      routeMode: 'jump_gate',
      originSystemId: expect.any(String),
      jumpFuelRequired: JUMP_GATE_JUMP_FUEL_COST,
      returnTrip: false,
    });
    expect(pendingTargetSystemId).toBeTruthy();

    const discovery = await db.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, user.id),
        eq(discoveredSystems.systemId, pendingTargetSystemId!),
      ),
    });
    expect(discovery).toBeUndefined();

    await processExpeditions({
      now: new Date(result.queueItem!.completesAt),
      onlyDue: true,
    });

    const consumedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(consumedShip!.status).toBe(SHIP_STATUS_DESTROYED);
    expect(consumedShip!.destroyedAt).not.toBeNull();
    const completedExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, result.queueItem!.id),
    });
    expect(completedExpedition!.status).toBe('completed');
    expect(completedExpedition!.returnedAt).not.toBeNull();

    const openedDiscovery = await db.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, user.id),
        eq(discoveredSystems.systemId, pendingTargetSystemId!),
      ),
    });
    expect(openedDiscovery?.source).toBe('random_jump');
    expect(openedDiscovery?.lastVisitedAt?.toISOString()).toBe(result.queueItem!.completesAt);

    const planetDiscoveries = await db.query.discoveredPlanets.findMany({
      where: eq(discoveredPlanets.userId, user.id),
    });
    expect(planetDiscoveries).toHaveLength(0);
  });

  it("keeps the player's first random public system free of foreign ships", async () => {
    const { user, ship } = await createSetup();
    await unlockJumpDrive(user.id);

    const [foreignUser] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 100000000)),
      tgUsername: `foreign_${Date.now()}`,
    }).returning();

    const publicSystems = await db.insert(systems).values(
      Array.from({ length: 5 }, (_, index) => ({
        name: index === 4 ? 'Ship-Free Public' : `Ship-Occupied Public ${index + 1}`,
        sectorX: index === 4 ? 1 : 0,
        sectorY: 0,
        sectorZ: 0,
        x: `${(index === 4 ? 500 : 0) + index}.00`,
        y: `${index}.00`,
        z: `${index}.00`,
        seed: 9000 + index,
        ownerId: null,
        isHome: false,
      })),
    ).returning();
    const publicPlanets = await db.insert(planets).values(
      publicSystems.map((system, index) => ({
        systemId: system.id,
        name: `pub${index + 1}-1`,
        biome: 'rocky',
        size: 12,
        slotCount: 8,
      })),
    ).returning();
    await db.insert(ships).values([
      {
        ownerId: foreignUser.id,
        typeId: 'scout',
        locationPlanetId: publicPlanets[2]!.id,
        status: 'idle',
        fuel: '100',
      },
      {
        ownerId: foreignUser.id,
        typeId: 'scout',
        locationPlanetId: publicPlanets[1]!.id,
        status: 'idle',
        fuel: '100',
      },
      {
        ownerId: foreignUser.id,
        typeId: 'scout',
        locationPlanetId: publicPlanets[2]!.id,
        status: 'idle',
        fuel: '100',
      },
      {
        ownerId: foreignUser.id,
        typeId: 'scout',
        locationPlanetId: publicPlanets[3]!.id,
        status: 'idle',
        fuel: '100',
      },
    ]);

    const result = await jumpShip(
      user.id,
      {
        shipId: ship.id,
        mode: 'random',
      },
      { now: RANDOM_JUMP_NOW },
    );

    expect(result.success).toBe(true);
    const pendingExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, result.queueItem!.id),
    });
    const pendingTargetSystemId =
      typeof pendingExpedition?.result?.pendingRandomDiscoverySystemId === 'string'
        ? pendingExpedition.result.pendingRandomDiscoverySystemId
        : null;
    expect(pendingTargetSystemId).toBeTruthy();
    const targetForeignShips = await db
      .select({ id: ships.id })
      .from(ships)
      .innerJoin(planets, eq(ships.locationPlanetId, planets.id))
      .where(and(
        eq(planets.systemId, pendingTargetSystemId!),
        ne(ships.ownerId, user.id),
        ne(ships.status, 'destroyed'),
      ));
    expect(targetForeignShips).toHaveLength(0);
  });

  it('repeats travel to a known destination by destination id', async () => {
    const { user, ship, originPlanet } = await createSetup();
    await unlockJumpDrive(user.id);

    const firstJump = await jumpShip(
      user.id,
      { shipId: ship.id, mode: 'random' },
      { now: RANDOM_JUMP_NOW },
    );
    expect(firstJump.success).toBe(true);
    const pendingExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, firstJump.queueItem!.id),
    });
    const firstJumpSystemId =
      typeof pendingExpedition?.result?.pendingRandomDiscoverySystemId === 'string'
        ? pendingExpedition.result.pendingRandomDiscoverySystemId
        : null;
    expect(firstJumpSystemId).toBeTruthy();
    await processExpeditions({
      now: new Date(firstJump.queueItem!.completesAt),
      onlyDue: true,
    });
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
        destinationSystemId: firstJumpSystemId!,
      },
      { now: REPEAT_JUMP_NOW },
    );

    expect(secondJump.success).toBe(true);
    expect(secondJump.targetSystem?.id).toBe(firstJumpSystemId);
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
    expect(Number(originJumpFuel?.amount)).toBe(100 - JUMP_GATE_JUMP_FUEL_COST * 2);

    const discovery = await db.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, user.id),
        eq(discoveredSystems.systemId, firstJumpSystemId!),
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
      { now: RANDOM_JUMP_NOW },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not enough jump fuel');
    expect(await countCommonPoolSystems()).toBe(0);
  });

  it("does not choose another player's home system as a random jump target", async () => {
    const { user, ship } = await createSetup();
    await unlockJumpDrive(user.id);

    const foreignOwner = await createTestUser('jump_foreign');
    const [foreignHome] = await db.insert(systems).values({
      name: 'Foreign Home System',
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
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
      { now: RANDOM_JUMP_NOW },
    );

    expect(result.success).toBe(true);
    const pendingExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, result.queueItem!.id),
    });
    const pendingTargetSystemId =
      typeof pendingExpedition?.result?.pendingRandomDiscoverySystemId === 'string'
        ? pendingExpedition.result.pendingRandomDiscoverySystemId
        : null;
    expect(pendingTargetSystemId).toBeTruthy();
    expect(pendingTargetSystemId).not.toBe(foreignHome.id);

    const targetSystem = await db.query.systems.findFirst({
      where: eq(systems.id, pendingTargetSystemId!),
    });
    expect(targetSystem?.isHome).toBe(false);
    expect(targetSystem?.ownerId).toBeNull();

    const targetPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, pendingTargetSystemId!),
    });
    expect(targetPlanet?.id).not.toBe(foreignHomePlanet.id);
  });

  it('blocks random discovery after five opened public systems until the player colonizes a public system', async () => {
    const { user, ship } = await createSetup();
    await unlockJumpDrive(user.id);
    const publicSystems = await createCommonPoolSystems(5);

    await db.insert(discoveredSystems).values(
      publicSystems.map((system) => ({
        userId: user.id,
        systemId: system.id,
        source: 'random_jump' as const,
      })),
    );

    const blocked = await jumpShip(
      user.id,
      { shipId: ship.id, mode: 'random' },
      { now: RANDOM_JUMP_NOW },
    );
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain('Colonize a planet');

    const [firstPublicPlanet] = await db.query.planets.findMany({
      where: eq(planets.systemId, publicSystems[0]!.id),
    });
    await db.insert(colonies).values({
      ownerId: user.id,
      planetId: firstPublicPlanet!.id,
    });

    const unlocked = await jumpShip(
      user.id,
      { shipId: ship.id, mode: 'random' },
      { now: new Date(RANDOM_JUMP_NOW.getTime() + 60_000) },
    );
    expect(unlocked.success).toBe(true);
    const pendingExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, unlocked.queueItem!.id),
    });
    const pendingTargetSystemId =
      typeof pendingExpedition?.result?.pendingRandomDiscoverySystemId === 'string'
        ? pendingExpedition.result.pendingRandomDiscoverySystemId
        : null;
    expect(pendingTargetSystemId).toBeTruthy();
    expect(pendingTargetSystemId).not.toBe(publicSystems[0]!.id);
  });
});
