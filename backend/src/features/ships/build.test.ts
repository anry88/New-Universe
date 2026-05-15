import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { shipsRoutes } from './routes.js';
import { syncReadyShips } from './build.js';
import { authRoutes } from '../auth/routes.js';
import { meRoutes } from '../me/routes.js';
import { db } from '../../db/index.js';
import { planets, systems, buildings, ships, planetResources, resources, notifications, researchProgress, expeditions } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';
import { seedShipTypes } from '../../db/seed/ship-types.js';
import { seedResearchCatalog } from '../../db/seed/research.js';

describe('Ship Building - POST /ships/build', () => {
  const botToken = env.TELEGRAM_BOT_TOKEN;

  beforeAll(async () => {
    await seedShipTypes();
    await seedResearchCatalog();
  });

  function createValidInitData(user: any): string {
    const authDate = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams();
    params.append('auth_date', authDate.toString());
    params.append('user', JSON.stringify(user));
    params.sort();

    const dataToCheck = Array.from(params.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(dataToCheck)
      .digest('hex');

    params.append('hash', hash);
    return params.toString();
  }

  async function createTestUser() {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(meRoutes, { prefix: '/me' });
    await app.register(shipsRoutes, { prefix: '/ships' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'ShipTest', username: 'shiptest' };
    const initData = createValidInitData(tgUser);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });

    const { token, user } = loginResponse.json();
    return { app, token, userId: user.id };
  }

  async function getHomePlanetId(userId: string): Promise<string> {
    const system = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const planet = await db.query.planets.findFirst({
      where: eq(planets.systemId, system!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });
    return planet!.id;
  }

  async function ensureResource(planetId: string, resourceId: string, amount: number) {
    await db.insert(resources).values({
      id: resourceId,
      name: { ru: resourceId, en: resourceId },
      tier: 1,
      symbol: resourceId.charAt(0).toUpperCase(),
      baseRegenRate: 0,
      defaultStorageCap: 5000,
    }).onConflictDoNothing();

    const existing = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, resourceId),
      ),
    });
    if (!existing) {
      await db.insert(planetResources).values({
        planetId,
        resourceId,
        amount: amount.toFixed(4),
        lastUpdateAt: new Date(),
        regenRate: '0',
      });
    }
  }

  async function ensureSpaceport(planetId: string, level = 1) {
    await db.insert(buildings).values({
      planetId,
      typeId: 'spaceport',
      slotIndex: 2,
      level,
    });
  }

  it('should build a scout ship with shipyard', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });
    await ensureSpaceport(planetId);

    await ensureResource(planetId, 'fuel', 100);

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ship).toBeDefined();
    expect(body.ship.typeId).toBe('scout');
    expect(body.ship.status).toBe('building');
    expect(body.ship.hp).toBe(40);
    expect(body.ship.maxHp).toBe(40);
    expect(body.ship.combatStats.targetClass).toBe('civilian');
    expect(body.ship.queueCompletesAt).toBeTruthy();
    expect(body.ship.queueStartedAt).toBeTruthy();
    expect(body.ship.ownerId).toBe(userId);
    expect(body.ship.locationPlanetId).toBe(planetId);
    expect(body.queueItem).toMatchObject({
      id: body.ship.id,
      planetId,
      typeId: 'scout',
      status: 'building',
    });
    expect(body.queueItem.queueCompletesAt).toBeTruthy();
    expect(body.queueItem.queueStartedAt).toBeTruthy();
  });

  it('blocks cargo_light until shipyard L2 and Logistics L1, then builds from capital resources', async () => {
    await seedShipTypes();

    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 1,
      level: 1,
    });
    await ensureSpaceport(planetId);

    await ensureResource(planetId, 'iron', 500);
    await ensureResource(planetId, 'silicon', 300);
    await ensureResource(planetId, 'carbon', 200);
    await ensureResource(planetId, 'methane', 100);

    const blockedResponse = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'cargo_light',
      },
    });

    expect(blockedResponse.statusCode).toBe(400);
    expect(blockedResponse.json().error).toContain('Shipyard level 2');
    expect(blockedResponse.json().error).not.toContain('cargo_light');

    await db
      .update(buildings)
      .set({ level: 2 })
      .where(and(eq(buildings.planetId, planetId), eq(buildings.typeId, 'shipyard')));

    const researchBlockedResponse = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'cargo_light',
      },
    });

    expect(researchBlockedResponse.statusCode).toBe(400);
    expect(researchBlockedResponse.json().error).toContain('Logistics research level 1');
    expect(researchBlockedResponse.json().error).not.toContain('cargo_light');

    await db.insert(researchProgress).values({
      userId,
      branch: 'logistics',
      level: 1,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'cargo_light',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ship.typeId).toBe('cargo_light');
    expect(body.ship.status).toBe('building');
  });

  it('should return 400 without shipyard', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('Shipyard is required');
    expect(body.error).not.toContain('shipyard');
    expect(body.code).toBe('ship_build_shipyard_required');
  });

  it('should return 400 when shipyard queue is full', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });
    await ensureSpaceport(planetId);

    await ensureResource(planetId, 'fuel', 100);

    await db.insert(ships).values({
      ownerId: userId,
      typeId: 'scout',
      locationPlanetId: planetId,
      status: 'building',
      cargoJson: {},
      fuel: '0',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('Shipyard queue is full');
  });

  it('should return 400 without a completed spaceport', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });
    await ensureResource(planetId, 'fuel', 100);

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: {
        authorization: `Bearer ${token}`,
        'accept-language': 'ru',
      },
      payload: {
        planetId,
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('ship_build_spaceport_required');
    expect(body.error).toContain('Космопорт');
  });

  it('should return 400 when the spaceport landing capacity is full', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await ensureSpaceport(planetId, 1);
    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });
    await ensureResource(planetId, 'fuel', 100);
    await db.insert(ships).values({
      ownerId: userId,
      typeId: 'scout',
      locationPlanetId: planetId,
      status: 'idle',
      cargoJson: {},
      fuel: '0',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('ship_build_spaceport_capacity_full');
    expect(body.error).toContain('Spaceport');
    expect(body.details).toMatchObject({
      capacity: 1,
      occupied: 1,
      reserved: 0,
    });
  });

  it('counts return-trip expeditions as reserved origin spaceport slots', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await ensureSpaceport(planetId, 1);
    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });
    await ensureResource(planetId, 'fuel', 100);

    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'scout',
      locationPlanetId: planetId,
      status: 'moving',
      cargoJson: {},
      fuel: '0',
    }).returning();

    await db.insert(expeditions).values({
      shipId: ship.id,
      type: 'scout',
      originPlanetId: planetId,
      targetX: '0',
      targetY: '0',
      targetZ: '0',
      status: 'in_flight',
      eta: new Date(Date.now() + 60_000),
      result: {
        returnTrip: true,
        spaceportReservation: { originPlanetId: planetId },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('ship_build_spaceport_capacity_full');
    expect(body.details).toMatchObject({
      capacity: 1,
      occupied: 0,
      reserved: 1,
    });
  });

  it('does not reserve the origin spaceport slot for one-way expeditions after launch', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await ensureSpaceport(planetId, 1);
    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });
    await ensureResource(planetId, 'fuel', 100);

    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'colonizer',
      locationPlanetId: planetId,
      status: 'moving',
      cargoJson: {},
      fuel: '0',
    }).returning();

    await db.insert(expeditions).values({
      shipId: ship.id,
      type: 'colonizer',
      originPlanetId: planetId,
      targetX: '0',
      targetY: '0',
      targetZ: '0',
      status: 'in_flight',
      eta: new Date(Date.now() + 60_000),
      result: {
        returnTrip: false,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ship.typeId).toBe('scout');
  });

  it('light_fighter: blocks without military_shipyard, then builds with Weapons I', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({ planetId, typeId: 'shipyard', slotIndex: 0, level: 2 });
    await ensureSpaceport(planetId);
    await ensureResource(planetId, 'iron', 500);
    await ensureResource(planetId, 'silicon', 500);
    await ensureResource(planetId, 'fuel', 100);

    // Blocked: no military_shipyard at all
    const noYardRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'light_fighter' },
    });
    expect(noYardRes.statusCode).toBe(400);
    expect(noYardRes.json().error.toLowerCase()).toContain('military shipyard');

    await db.insert(buildings).values({ planetId, typeId: 'military_shipyard', slotIndex: 3, level: 1 });

    // Blocked: Weapons I research not completed
    const noResearchRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'light_fighter' },
    });
    expect(noResearchRes.statusCode).toBe(400);
    expect(noResearchRes.json().error).toMatch(/weapons/i);

    await db.insert(researchProgress).values({ userId, branch: 'weapons', level: 1 });

    // Allowed
    const okRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'light_fighter' },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().ship.typeId).toBe('light_fighter');
  });

  it('light_bomber: blocks at Military Shipyard L1 and without Weapons II, then builds at L2 + Weapons II', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({ planetId, typeId: 'shipyard', slotIndex: 0, level: 2 });
    await ensureSpaceport(planetId);
    await ensureResource(planetId, 'steel', 2000);
    await ensureResource(planetId, 'military_alloy', 500);
    await ensureResource(planetId, 'electronics', 500);
    await ensureResource(planetId, 'fuel', 200);

    await db.insert(buildings).values({ planetId, typeId: 'military_shipyard', slotIndex: 4, level: 1 });
    await db.insert(researchProgress).values({ userId, branch: 'weapons', level: 1 });

    // Blocked: military_shipyard L1 < required L2
    const levelBlockRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'light_bomber' },
    });
    expect(levelBlockRes.statusCode).toBe(400);
    expect(levelBlockRes.json().error).toMatch(/military shipyard level 2/i);

    await db
      .update(buildings)
      .set({ level: 2 })
      .where(and(eq(buildings.planetId, planetId), eq(buildings.typeId, 'military_shipyard')));

    // Blocked: Weapons II not completed (only Weapons I unlocked)
    const researchBlockRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'light_bomber' },
    });
    expect(researchBlockRes.statusCode).toBe(400);
    expect(researchBlockRes.json().error).toMatch(/weapons/i);

    await db
      .update(researchProgress)
      .set({ level: 2 })
      .where(and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'weapons')));

    // Allowed
    const okRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'light_bomber' },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().ship.typeId).toBe('light_bomber');
  });

  it('light_laser: requires Military Shipyard L2, Weapons II, and liquid_nitrogen in build cost', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({ planetId, typeId: 'shipyard', slotIndex: 0, level: 2 });
    await ensureSpaceport(planetId);
    await ensureResource(planetId, 'steel', 1000);
    await ensureResource(planetId, 'silicon', 500);
    await ensureResource(planetId, 'electronics', 500);
    // Intentionally not adding liquid_nitrogen yet

    await db.insert(buildings).values({ planetId, typeId: 'military_shipyard', slotIndex: 5, level: 2 });
    await db.insert(researchProgress).values({ userId, branch: 'weapons', level: 2 });

    // Blocked: missing liquid_nitrogen
    const noLnRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'light_laser' },
    });
    expect(noLnRes.statusCode).toBe(400);
    expect(noLnRes.json().code).toBe('insufficient_resource');
    expect(noLnRes.json().error.toLowerCase()).toContain('liquid nitrogen');

    await ensureResource(planetId, 'liquid_nitrogen', 100);

    // Allowed
    const okRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'light_laser' },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().ship.typeId).toBe('light_laser');
  });

  it('ship catalog contains light, medium, heavy and rocket combat hulls with correct stats', async () => {
    const { app, token } = await createTestUser();

    const res = await app.inject({
      method: 'GET',
      url: '/ships/types',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const types: Array<{
      id: string;
      hp: number;
      dps: number;
      fuelCapacity: number;
      jumpFuelCapacity: number;
      requiredBuildings: { typeId: string; level: number }[];
      combatStats: {
        targetClass: string;
        missilePayload?: { alphaDamage: number; validTargetClasses: string[] };
        shields?: { capacity: number; radius: number; rechargeRate: number; downtimeSec: number };
      };
    }> = res.json();

    const lightFighter = types.find((t) => t.id === 'light_fighter');
    expect(lightFighter).toBeDefined();
    expect(lightFighter!.hp).toBe(200);
    expect(lightFighter!.fuelCapacity).toBe(100);
    expect(lightFighter!.jumpFuelCapacity).toBe(5);

    const lightBomber = types.find((t) => t.id === 'light_bomber');
    expect(lightBomber).toBeDefined();
    expect(lightBomber!.hp).toBe(350);
    expect(lightBomber!.fuelCapacity).toBe(200);
    expect(lightBomber!.jumpFuelCapacity).toBe(8);

    const lightLaser = types.find((t) => t.id === 'light_laser');
    expect(lightLaser).toBeDefined();
    expect(lightLaser!.hp).toBe(280);
    expect(lightLaser!.fuelCapacity).toBe(150);
    expect(lightLaser!.jumpFuelCapacity).toBe(6);

    const mediumFighter = types.find((t) => t.id === 'medium_fighter');
    expect(mediumFighter).toBeDefined();
    expect(mediumFighter!.hp).toBeGreaterThan(lightFighter!.hp);
    expect(mediumFighter!.dps).toBeGreaterThan(lightFighter!.dps);
    expect(mediumFighter!.requiredBuildings).toEqual([{ typeId: 'military_shipyard', level: 3 }]);

    const heavyFighter = types.find((t) => t.id === 'heavy_fighter');
    expect(heavyFighter).toBeDefined();
    expect(heavyFighter!.hp).toBeGreaterThan(mediumFighter!.hp);
    expect(heavyFighter!.dps).toBeGreaterThan(mediumFighter!.dps);
    expect(heavyFighter!.requiredBuildings).toEqual([{ typeId: 'military_shipyard', level: 5 }]);

    const rocketCarrier = types.find((t) => t.id === 'rocket_carrier');
    expect(rocketCarrier).toBeDefined();
    expect(rocketCarrier!.combatStats.missilePayload).toMatchObject({
      alphaDamage: 1500,
      validTargetClasses: ['military_medium', 'military_heavy'],
    });

    const heavyRocketCarrier = types.find((t) => t.id === 'heavy_rocket_carrier');
    expect(heavyRocketCarrier).toBeDefined();
    expect(heavyRocketCarrier!.hp).toBeGreaterThan(rocketCarrier!.hp);
    expect(heavyRocketCarrier!.combatStats.missilePayload).toMatchObject({
      alphaDamage: 3300,
      validTargetClasses: ['military_medium', 'military_heavy'],
    });

    const smallShield = types.find((t) => t.id === 'small_shield_ship');
    const mediumShield = types.find((t) => t.id === 'medium_shield_ship');
    const largeShield = types.find((t) => t.id === 'large_shield_ship');
    expect(smallShield!.combatStats.shields).toMatchObject({ capacity: 700, radius: 1.5 });
    expect(mediumShield!.combatStats.shields).toMatchObject({ capacity: 1800, radius: 3.5 });
    expect(largeShield!.combatStats.shields).toMatchObject({ capacity: 4200, radius: 6 });
    expect(largeShield!.requiredBuildings).toEqual([{ typeId: 'military_shipyard', level: 6 }]);
  });

  it('should return 401 without authorization', async () => {
    const app = Fastify();
    await app.register(shipsRoutes, { prefix: '/ships' });

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      payload: {
        planetId: '00000000-0000-0000-0000-000000000000',
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 404 for unknown ship type', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });
    await ensureSpaceport(planetId);

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'nonexistent_ship',
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toContain('Ship type not found');
    expect(body.error).not.toContain('nonexistent_ship');
    expect(body.code).toBe('ship_build_unknown_type');
  });

  it('should return 400 when research gate blocks gated hull types', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });

    await ensureResource(planetId, 'steel', 10000);
    await ensureResource(planetId, 'silicon', 10000);
    await ensureResource(planetId, 'biomass', 10000);

    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'colonizer',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toMatch(/engineering/i);
  });

  it('should return 400 when not enough resources', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      slotIndex: 0,
      level: 1,
    });
    await ensureSpaceport(planetId);

    // Don't add fuel — scout needs 30 fuel, so spendResources will fail
    const response = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        typeSlug: 'scout',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('not enough');
    expect(body.error).toContain('fuel');
    expect(body.error).not.toContain('fuelRequired');
    expect(body.code).toBe('insufficient_resource');
  });

  it('syncs only the current user ready ships and suppresses stale pending notifications', async () => {
    const { userId } = await createTestUser();
    const other = await createTestUser();
    const planetId = await getHomePlanetId(userId);
    const otherPlanetId = await getHomePlanetId(other.userId);

    const [readyShip] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: 'scout',
        locationPlanetId: planetId,
        status: 'building',
        queueCompletesAt: new Date(Date.now() - 1000),
        cargoJson: {},
        fuel: '0',
      })
      .returning();

    const [otherReadyShip] = await db
      .insert(ships)
      .values({
        ownerId: other.userId,
        typeId: 'scout',
        locationPlanetId: otherPlanetId,
        status: 'building',
        queueCompletesAt: new Date(Date.now() - 1000),
        cargoJson: {},
        fuel: '0',
      })
      .returning();

    await db.insert(notifications).values({
      userId,
      type: 'ship_done',
      payload: { shipId: readyShip.id },
    });

    await syncReadyShips(userId, { skipNotifications: true });

    const updated = await db.query.ships.findFirst({ where: eq(ships.id, readyShip.id) });
    expect(updated?.status).toBe('idle');
    expect(updated?.queueCompletesAt).toBeNull();

    const untouched = await db.query.ships.findFirst({ where: eq(ships.id, otherReadyShip.id) });
    expect(untouched?.status).toBe('building');
    expect(untouched?.queueCompletesAt).not.toBeNull();

    const pendingNotes = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, 'ship_done'),
          sql`(${notifications.payload} ->> 'shipId') = ${readyShip.id}`,
          eq(notifications.pending, true),
        ),
      );
    expect(pendingNotes).toHaveLength(0);
  });
});
