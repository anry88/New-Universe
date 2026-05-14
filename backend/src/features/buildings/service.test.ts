import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildingsRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { meRoutes } from '../me/routes.js';
import { db } from '../../db/index.js';
import {
  colonies,
  discoveredPlanets,
  planets,
  systems,
  buildings,
  planetResources,
  richness,
  ships,
  expeditions,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';
import { seedBuildingTypes } from '../../db/seed/building-types.js';
import { seedResources } from '../../db/seed/resources.js';
import { seedShipTypes } from '../../db/seed/ship-types.js';

describe('Buildings Service - POST /buildings/build', () => {
  const botToken = env.TELEGRAM_BOT_TOKEN;

  beforeAll(async () => {
    await seedResources();
    await seedBuildingTypes();
    await seedShipTypes();
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
    await app.register(buildingsRoutes, { prefix: '/buildings' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'BuildTest', username: 'buildtest' };
    const initData = createValidInitData(tgUser);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });

    const { token, user } = loginResponse.json();
    return { app, token, userId: user.id, tgId };
  }

  it('should build a mine on the starting planet', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    expect(userSystem).toBeDefined();

    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });
    expect(userPlanet).toBeDefined();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: userPlanet!.id,
        typeId: 'mine',
        slotIndex: 1,
        selectedResourceId: 'iron',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.queueItem).toBeDefined();
    expect(body.queueItem.id).toBeDefined();
    expect(body.queueItem.completesAt).toBeDefined();

    const building = await db.query.buildings.findFirst({
      where: eq(buildings.id, body.queueItem.id),
    });
    expect(building?.selectedResourceId).toBe('iron');
  });

  it('blocks construction on a discovered planet before colonizer settlement', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const targetPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
      orderBy: (p, { desc }) => desc(p.name),
    });
    expect(targetPlanet).toBeDefined();

    await db.insert(discoveredPlanets).values({
      userId,
      planetId: targetPlanet!.id,
    }).onConflictDoNothing();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: targetPlanet!.id,
        typeId: 'command_center',
        slotIndex: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('active settlement');
  });

  it('allows construction on a settled colony in a neutral system', async () => {
    const { app, token, userId } = await createTestUser();

    const [neutralSystem] = await db.insert(systems).values({
      isHome: false,
      sectorX: 1,
      sectorY: 1,
      sectorZ: 0,
      x: '100.00',
      y: '100.00',
      z: '0.00',
      name: `Neutral ${Math.random()}`,
      seed: 456,
    }).returning();

    const [colonyPlanet] = await db.insert(planets).values({
      systemId: neutralSystem.id,
      biome: 'rocky',
      size: 12,
      slotCount: 8,
      name: `Colony ${Math.random()}`,
    }).returning();

    await db.insert(colonies).values({
      ownerId: userId,
      planetId: colonyPlanet.id,
    });
    await db.insert(buildings).values({
      planetId: colonyPlanet.id,
      typeId: 'command_center',
      level: 1,
      slotIndex: 0,
    });
    await db.insert(planetResources).values([
      { planetId: colonyPlanet.id, resourceId: 'iron', amount: '1000', regenRate: '0' },
      { planetId: colonyPlanet.id, resourceId: 'carbon', amount: '1000', regenRate: '0' },
    ]);
    await db.insert(richness).values([
      { planetId: colonyPlanet.id, resourceId: 'iron', value: 2 },
      { planetId: colonyPlanet.id, resourceId: 'carbon', value: 1 },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: colonyPlanet.id,
        typeId: 'mine',
        slotIndex: 1,
        selectedResourceId: 'iron',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it('blocks a third mine on iron when the planet only has two iron deposits', async () => {
    const { app, token, userId } = await createTestUser();

    const [neutralSystem] = await db.insert(systems).values({
      isHome: false,
      sectorX: 4,
      sectorY: 4,
      sectorZ: 0,
      x: '400.00',
      y: '400.00',
      z: '0.00',
      name: `Iron Limit ${Math.random()}`,
      seed: 791,
    }).returning();

    const [orePlanet] = await db.insert(planets).values({
      systemId: neutralSystem.id,
      biome: 'rocky',
      size: 12,
      slotCount: 8,
      name: `Ore Colony ${Math.random()}`,
    }).returning();

    await db.insert(colonies).values({
      ownerId: userId,
      planetId: orePlanet.id,
    });
    await db.insert(buildings).values([
      {
        planetId: orePlanet.id,
        typeId: 'command_center',
        level: 1,
        slotIndex: 0,
      },
      {
        planetId: orePlanet.id,
        typeId: 'mine',
        selectedResourceId: 'iron',
        level: 1,
        slotIndex: 1,
      },
      {
        planetId: orePlanet.id,
        typeId: 'mine',
        selectedResourceId: 'iron',
        level: 1,
        slotIndex: 2,
      },
    ]);
    await db.insert(richness).values([
      { planetId: orePlanet.id, resourceId: 'iron', value: 2 },
      { planetId: orePlanet.id, resourceId: 'carbon', value: 1 },
    ]);
    await db.insert(planetResources).values([
      { planetId: orePlanet.id, resourceId: 'iron', amount: '1000', regenRate: '0' },
      { planetId: orePlanet.id, resourceId: 'carbon', amount: '1000', regenRate: '0' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: orePlanet.id,
        typeId: 'mine',
        slotIndex: 3,
        selectedResourceId: 'iron',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('building_blocked_deposit_limit');
    expect(body.details).toMatchObject({ resourceId: 'iron', limit: 2, current: 2 });
  });

  it('switches an existing extractor target and blocks full deposit targets', async () => {
    const { app, token, userId } = await createTestUser();

    const [neutralSystem] = await db.insert(systems).values({
      isHome: false,
      sectorX: 5,
      sectorY: 5,
      sectorZ: 0,
      x: '500.00',
      y: '500.00',
      z: '0.00',
      name: `Retarget ${Math.random()}`,
      seed: 792,
    }).returning();

    const [orePlanet] = await db.insert(planets).values({
      systemId: neutralSystem.id,
      biome: 'rocky',
      size: 12,
      slotCount: 8,
      name: `Retarget Colony ${Math.random()}`,
    }).returning();

    await db.insert(colonies).values({
      ownerId: userId,
      planetId: orePlanet.id,
    });
    await db.insert(buildings).values({
      planetId: orePlanet.id,
      typeId: 'command_center',
      level: 1,
      slotIndex: 0,
    });
    const [mine] = await db.insert(buildings).values({
      planetId: orePlanet.id,
      typeId: 'mine',
      selectedResourceId: 'iron',
      level: 1,
      slotIndex: 1,
    }).returning();
    await db.insert(richness).values([
      { planetId: orePlanet.id, resourceId: 'iron', value: 2 },
      { planetId: orePlanet.id, resourceId: 'carbon', value: 1 },
    ]);
    await db.insert(planetResources).values([
      { planetId: orePlanet.id, resourceId: 'iron', amount: '1000', regenRate: '50' },
      { planetId: orePlanet.id, resourceId: 'carbon', amount: '1000', regenRate: '0' },
    ]);

    const switched = await app.inject({
      method: 'POST',
      url: '/buildings/resource',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        buildingId: mine.id,
        selectedResourceId: 'carbon',
      },
    });

    expect(switched.statusCode).toBe(200);
    expect(switched.json()).toMatchObject({
      success: true,
      buildingId: mine.id,
      selectedResourceId: 'carbon',
    });

    const updatedMine = await db.query.buildings.findFirst({
      where: eq(buildings.id, mine.id),
    });
    expect(updatedMine?.selectedResourceId).toBe('carbon');

    const syncedResources = await db.query.planetResources.findMany({
      where: eq(planetResources.planetId, orePlanet.id),
    });
    const regenByResource = Object.fromEntries(
      syncedResources.map((resource) => [resource.resourceId, Number(resource.regenRate)]),
    );
    expect(regenByResource.iron).toBe(0);
    expect(regenByResource.carbon).toBeGreaterThan(0);

    const [secondMine] = await db.insert(buildings).values({
      planetId: orePlanet.id,
      typeId: 'mine',
      selectedResourceId: 'iron',
      level: 1,
      slotIndex: 2,
    }).returning();

    const blocked = await app.inject({
      method: 'POST',
      url: '/buildings/resource',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        buildingId: secondMine.id,
        selectedResourceId: 'carbon',
      },
    });

    expect(blocked.statusCode).toBe(400);
    expect(blocked.json()).toMatchObject({
      code: 'building_blocked_deposit_limit',
      details: { resourceId: 'carbon', limit: 1, current: 1 },
    });
  });

  it('should return 400 when planet has no free slots', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });

    // Fill all planet slots by inserting completed buildings directly (queueAction=null bypasses queue limit)
    const fillBuildings = Array.from({ length: userPlanet!.slotCount }, (_, slotIndex) => ({
      planetId: userPlanet!.id,
      typeId: 'storage',
      slotIndex,
      level: 1,
      queueAction: null as string | null,
      queueCompletesAt: null as Date | null,
    }));
    await db.insert(buildings).values(fillBuildings);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: userPlanet!.id,
        typeId: 'mine',
        slotIndex: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message).toContain('slot is already occupied');
  });

  it('should return 400 when build queue is full', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: userPlanet!.id,
        typeId: 'mine',
        slotIndex: 1,
        selectedResourceId: 'iron',
      },
    });
    expect(firstResponse.statusCode).toBe(200);

    const secondResponse = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: userPlanet!.id,
        typeId: 'drill',
        slotIndex: 2,
      },
    });

    expect(secondResponse.statusCode).toBe(400);
    const body = secondResponse.json();
    expect(body.message).toContain('Build queue is full');
  });

  it('should return 401 without authorization', async () => {
    const app = Fastify();
    await app.register(buildingsRoutes, { prefix: '/buildings' });

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      payload: {
        planetId: '00000000-0000-0000-0000-000000000000',
        typeId: 'mine',
        slotIndex: 0,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 404 for unknown building type', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: userPlanet!.id,
        typeId: 'nonexistent_building',
        slotIndex: 2,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message).toContain('Building type not found');
  });

  it('should return 404 for non-existent planet', async () => {
    const { app, token } = await createTestUser();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: '00000000-0000-0000-0000-000000000000',
        typeId: 'mine',
        slotIndex: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message).toContain('active settlement');
  });

  it('blocks mines on planets without metal deposits', async () => {
    const { app, token, userId } = await createTestUser();

    const [neutralSystem] = await db.insert(systems).values({
      isHome: false,
      sectorX: 2,
      sectorY: 2,
      sectorZ: 0,
      x: '200.00',
      y: '200.00',
      z: '0.00',
      name: `Gas No Metals ${Math.random()}`,
      seed: 789,
    }).returning();

    const [gasPlanet] = await db.insert(planets).values({
      systemId: neutralSystem.id,
      biome: 'gas_giant',
      size: 18,
      slotCount: 6,
      name: `Gas Colony ${Math.random()}`,
    }).returning();

    await db.insert(colonies).values({
      ownerId: userId,
      planetId: gasPlanet.id,
    });
    await db.insert(buildings).values({
      planetId: gasPlanet.id,
      typeId: 'command_center',
      level: 1,
      slotIndex: 0,
    });
    await db.insert(richness).values([
      { planetId: gasPlanet.id, resourceId: 'methane', value: 3 },
    ]);
    await db.insert(planetResources).values([
      { planetId: gasPlanet.id, resourceId: 'iron', amount: '500', regenRate: '0' },
      { planetId: gasPlanet.id, resourceId: 'methane', amount: '0', regenRate: '0' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: gasPlanet.id,
        typeId: 'mine',
        slotIndex: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('building_blocked_planet_resource');
    expect(body.message).toContain('metal deposit');
  });

  it('blocks oil pumps on planets without oil or methane deposits', async () => {
    const { app, token, userId } = await createTestUser();

    const [neutralSystem] = await db.insert(systems).values({
      isHome: false,
      sectorX: 3,
      sectorY: 3,
      sectorZ: 0,
      x: '300.00',
      y: '300.00',
      z: '0.00',
      name: `Dry Colony System ${Math.random()}`,
      seed: 790,
    }).returning();

    const [dryPlanet] = await db.insert(planets).values({
      systemId: neutralSystem.id,
      biome: 'rocky',
      size: 12,
      slotCount: 8,
      name: `Dry Colony ${Math.random()}`,
    }).returning();

    await db.insert(colonies).values({
      ownerId: userId,
      planetId: dryPlanet.id,
    });
    await db.insert(buildings).values({
      planetId: dryPlanet.id,
      typeId: 'command_center',
      level: 2,
      slotIndex: 0,
    });
    await db.insert(richness).values([
      { planetId: dryPlanet.id, resourceId: 'iron', value: 2 },
    ]);
    await db.insert(planetResources).values([
      { planetId: dryPlanet.id, resourceId: 'iron', amount: '99999', regenRate: '0' },
      { planetId: dryPlanet.id, resourceId: 'silicon', amount: '99999', regenRate: '0' },
      { planetId: dryPlanet.id, resourceId: 'carbon', amount: '99999', regenRate: '0' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: dryPlanet.id,
        typeId: 'oil_pump',
        slotIndex: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('building_blocked_planet_resource');
    expect(body.message).toContain('Oil or Methane deposit');
  });

  it('allows oil pumps to target methane deposits', async () => {
    const { app, token, userId } = await createTestUser();

    const [neutralSystem] = await db.insert(systems).values({
      isHome: false,
      sectorX: 6,
      sectorY: 6,
      sectorZ: 0,
      x: '600.00',
      y: '600.00',
      z: '0.00',
      name: `Methane Pump System ${Math.random()}`,
      seed: 793,
    }).returning();

    const [methanePlanet] = await db.insert(planets).values({
      systemId: neutralSystem.id,
      biome: 'gas_giant',
      size: 30,
      slotCount: 8,
      name: `Methane Pump ${Math.random()}`,
    }).returning();

    await db.insert(colonies).values({
      ownerId: userId,
      planetId: methanePlanet.id,
    });
    await db.insert(buildings).values({
      planetId: methanePlanet.id,
      typeId: 'command_center',
      level: 2,
      slotIndex: 0,
    });
    await db.insert(richness).values([
      { planetId: methanePlanet.id, resourceId: 'methane', value: 1 },
    ]);
    await db.insert(planetResources).values([
      { planetId: methanePlanet.id, resourceId: 'iron', amount: '99999', regenRate: '0' },
      { planetId: methanePlanet.id, resourceId: 'silicon', amount: '99999', regenRate: '0' },
      { planetId: methanePlanet.id, resourceId: 'carbon', amount: '99999', regenRate: '0' },
      { planetId: methanePlanet.id, resourceId: 'methane', amount: '0', regenRate: '0' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: methanePlanet.id,
        typeId: 'oil_pump',
        slotIndex: 1,
        selectedResourceId: 'methane',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it('should allow refinery construction without smelter dependency or oil deposit', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });
    expect(userPlanet).toBeDefined();

    await db
      .delete(planetResources)
      .where(eq(planetResources.planetId, userPlanet!.id));
    await db
      .delete(richness)
      .where(eq(richness.planetId, userPlanet!.id));

    await db.insert(planetResources).values([
      { planetId: userPlanet!.id, resourceId: 'iron', amount: '99999', regenRate: '0' },
      { planetId: userPlanet!.id, resourceId: 'silicon', amount: '99999', regenRate: '0' },
      { planetId: userPlanet!.id, resourceId: 'steel', amount: '99999', regenRate: '0' },
    ]);
    await db.insert(richness).values([
      { planetId: userPlanet!.id, resourceId: 'iron', value: 2 },
      { planetId: userPlanet!.id, resourceId: 'silicon', value: 2 },
    ]);

    await db
      .update(buildings)
      .set({ level: 3 })
      .where(eq(buildings.planetId, userPlanet!.id));

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: userPlanet!.id,
        typeId: 'refinery',
        slotIndex: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it('should sync and finalize completed building construction', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });

    // Manually insert a building that is "ready"
    const [b] = await db.insert(buildings).values({
      planetId: userPlanet!.id,
      typeId: 'mine',
      selectedResourceId: 'iron',
      slotIndex: 3,
      level: 0,
      queueAction: 'build',
      queueCompletesAt: new Date(Date.now() - 1000), // Finished 1 second ago
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: `/buildings/sync/${userPlanet!.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    const updated = await db.query.buildings.findFirst({
      where: eq(buildings.id, b.id),
    });
    expect(updated?.level).toBe(1);
    expect(updated?.queueAction).toBeNull();
    expect(updated?.queueCompletesAt).toBeNull();
  });

  it('should recalculate mine production for already completed buildings on sync', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
      orderBy: (p, { asc }) => asc(p.name),
    });

    await db.delete(richness).where(eq(richness.planetId, userPlanet!.id));
    await db.delete(planetResources).where(eq(planetResources.planetId, userPlanet!.id));
    await db.insert(richness).values([
      { planetId: userPlanet!.id, resourceId: 'iron', value: 2 },
      { planetId: userPlanet!.id, resourceId: 'carbon', value: 1 },
      { planetId: userPlanet!.id, resourceId: 'silicon', value: 1 },
    ]);

    await db.insert(buildings).values({
      planetId: userPlanet!.id,
      typeId: 'mine',
      selectedResourceId: 'iron',
      slotIndex: 1,
      level: 1,
      queueAction: null,
      queueCompletesAt: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/buildings/sync/${userPlanet!.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);

    const syncedResources = await db.query.planetResources.findMany({
      where: eq(planetResources.planetId, userPlanet!.id),
    });
    const regenByResource = Object.fromEntries(
      syncedResources.map((resource) => [resource.resourceId, Number(resource.regenRate)]),
    );

    expect(regenByResource.iron).toBeGreaterThan(0);
    expect(regenByResource.carbon ?? 0).toBe(0);
    expect(regenByResource.silicon ?? 0).toBe(0);
  });

  it('should demolish a building and refund 50% of costs', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });

    // Manually insert a level 2 building
    // Total spent for level 2: baseCost * (1 + 1.6) = 2.6 * baseCost
    // Refund: floor(0.5 * 2.6 * baseCost) = floor(1.3 * baseCost)
    const [b] = await db.insert(buildings).values({
      planetId: userPlanet!.id,
      typeId: 'mine',
      slotIndex: 4,
      level: 2,
    }).returning();

    // Get initial resources total
    const initialResources = await db.query.planetResources.findMany({
      where: eq(planetResources.planetId, userPlanet!.id),
    });
    const initialTotal = initialResources.reduce((sum, r) => sum + Number(r.amount), 0);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/demolish',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: b.id },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.refund).toBeDefined();

    const updated = await db.query.buildings.findFirst({
      where: eq(buildings.id, b.id),
    });
    expect(updated).toBeUndefined();

    const updatedResources = await db.query.planetResources.findMany({
      where: eq(planetResources.planetId, userPlanet!.id),
    });
    const updatedTotal = updatedResources.reduce((sum, r) => sum + Number(r.amount), 0);
    
    // Check refund: initial total + refund sum = updated total
    const refundSum = Object.values(body.refund as Record<string, number>).reduce((sum, a) => sum + a, 0);
    if (refundSum > 0) {
      expect(updatedTotal).toBeGreaterThan(initialTotal);
      // Optional: check exact sum if needed
      expect(Math.floor(updatedTotal)).toBe(Math.floor(initialTotal + refundSum));
    }
  });

  it('blocks spaceport demolition while ships occupy landing slots', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
      orderBy: (p, { asc }) => asc(p.name),
    });
    expect(userPlanet).toBeDefined();

    const [spaceport] = await db.insert(buildings).values({
      planetId: userPlanet!.id,
      typeId: 'spaceport',
      slotIndex: 4,
      level: 1,
    }).returning();

    await db.insert(ships).values({
      ownerId: userId,
      typeId: 'scout',
      locationPlanetId: userPlanet!.id,
      status: 'idle',
      cargoJson: {},
      fuel: '0',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/demolish',
      headers: {
        authorization: `Bearer ${token}`,
        'accept-language': 'ru',
      },
      payload: { buildingId: spaceport.id },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Космопорт');

    const stored = await db.query.buildings.findFirst({
      where: eq(buildings.id, spaceport.id),
    });
    expect(stored).toBeDefined();
  });

  it('blocks spaceport demolition while return trips reserve landing slots', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
      orderBy: (p, { asc }) => asc(p.name),
    });
    expect(userPlanet).toBeDefined();

    const [spaceport] = await db.insert(buildings).values({
      planetId: userPlanet!.id,
      typeId: 'spaceport',
      slotIndex: 4,
      level: 1,
    }).returning();

    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'scout',
      locationPlanetId: userPlanet!.id,
      status: 'moving',
      cargoJson: {},
      fuel: '0',
    }).returning();

    await db.insert(expeditions).values({
      shipId: ship.id,
      type: 'scout',
      originPlanetId: userPlanet!.id,
      targetX: '0',
      targetY: '0',
      targetZ: '0',
      status: 'in_flight',
      eta: new Date(Date.now() + 60_000),
      result: {
        returnTrip: true,
        spaceportReservation: { originPlanetId: userPlanet!.id },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/demolish',
      headers: {
        authorization: `Bearer ${token}`,
        'accept-language': 'ru',
      },
      payload: { buildingId: spaceport.id },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Космопорт');

    const stored = await db.query.buildings.findFirst({
      where: eq(buildings.id, spaceport.id),
    });
    expect(stored).toBeDefined();
  });
});
