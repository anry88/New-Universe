import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildingsRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { meRoutes } from '../me/routes.js';
import { db } from '../../db/index.js';
import { planets, systems, buildings, buildingTypes, planetResources } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';
import { buildingUpgradeResourceCosts, MAX_BUILDING_LEVEL } from '@shared/config/buildingUpgradeEconomy.js';

describe('Building Upgrade - POST /buildings/upgrade', () => {
  const botToken = env.TELEGRAM_BOT_TOKEN;

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
    const tgUser = { id: tgId, first_name: 'UpgradeTest', username: 'upgradetest' };
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
      with: { resources: true },
    
      orderBy: (p, { asc }) => asc(p.name),
    });
    return planet!.id;
  }

  async function getResourceAmount(planetId: string, resourceId: string): Promise<number> {
    const record = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, resourceId),
      ),
    });
    return record ? Number(record.amount) : 0;
  }

  async function setCommandCenterLevel(planetId: string, level: number): Promise<void> {
    await db.update(buildings)
      .set({ level })
      .where(and(eq(buildings.planetId, planetId), eq(buildings.typeId, 'command_center')));
  }

  async function setBuildingTypeMaxLevel(typeId: string, maxLevel: number): Promise<void> {
    await db.update(buildingTypes)
      .set({ maxLevel })
      .where(eq(buildingTypes.id, typeId));
  }

  async function setResourceAmount(planetId: string, resourceId: string, amount: number): Promise<void> {
    const existing = await db.query.planetResources.findFirst({
      where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
    });
    if (existing) {
      await db.update(planetResources)
        .set({ amount: String(amount), regenRate: existing.regenRate, lastUpdateAt: new Date() })
        .where(and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)));
    } else {
      await db.insert(planetResources).values({
        planetId,
        resourceId,
        amount: String(amount),
        regenRate: '0',
        lastUpdateAt: new Date(),
      });
    }
  }

  it('should upgrade a building successfully', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);
    await setCommandCenterLevel(planetId, 2);

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      selectedResourceId: 'iron',
      slotIndex: 0,
      level: 1,
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: building.id },
    });

    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.queueItem).toBeDefined();
    expect(body.queueItem.id).toBe(building.id);
    expect(body.queueItem.completesAt).toBeDefined();
    expect(body.queueItem.queueCompletesAt).toBeDefined();
    expect(body.queueItem.queueStartedAt).toBeDefined();
    expect(body.queueItem.planetId).toBe(planetId);
    expect(body.queueItem.buildingTypeId).toBe('mine');
    expect(body.queueItem.queueAction).toBe('upgrade');
    expect(body.queueItem.level).toBe(1);
  });

  it('should return 404 for non-existent building', async () => {
    const { app, token } = await createTestUser();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: '00000000-0000-0000-0000-000000000000' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message).toContain('Building not found');
  });

  it('should return 401 without authorization', async () => {
    const app = Fastify();
    await app.register(buildingsRoutes, { prefix: '/buildings' });

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      payload: { buildingId: '00000000-0000-0000-0000-000000000000' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 400 when building is already at max level', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);
    await setBuildingTypeMaxLevel('command_center', MAX_BUILDING_LEVEL);

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'command_center',
      slotIndex: 0,
      level: MAX_BUILDING_LEVEL,
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: building.id },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message).toContain('max level');
  });

  it('should return 400 when building is already in a queue', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);
    await setCommandCenterLevel(planetId, 2);

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      slotIndex: 0,
      level: 1,
      queueAction: 'build',
      queueCompletesAt: new Date(Date.now() + 60000),
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: building.id },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message).toContain('already in the queue');
  });

  it('should return 400 when planet build queue is full', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);
    await setCommandCenterLevel(planetId, 2);

    const [upgradeTarget] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      selectedResourceId: 'iron',
      slotIndex: 0,
      level: 1,
    }).returning();

    await db.insert(buildings).values({
      planetId,
      typeId: 'drill',
      slotIndex: 1,
      level: 1,
      queueAction: 'build',
      queueCompletesAt: new Date(Date.now() + 60000),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: upgradeTarget.id },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message).toContain('Build queue is full');
  });

  it('should calculate upgrade cost using base_cost * 1.6^level', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);
    await setCommandCenterLevel(planetId, 2);

    const ironBefore = await getResourceAmount(planetId, 'iron');

    const mineType = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, 'mine'),
    });
    const baseCost = mineType!.baseCost as Record<string, number>;
    const scaledIron = Math.floor((baseCost.iron || 0) * Math.pow(1.6, 1));

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      selectedResourceId: 'iron',
      slotIndex: 0,
      level: 1,
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: building.id },
    });

    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);

    const ironAfter = await getResourceAmount(planetId, 'iron');
    expect(ironAfter).toBeCloseTo(ironBefore - scaledIron, 1);
  });

  it('rejects non-command-center upgrades above the local command center level', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      selectedResourceId: 'iron',
      slotIndex: 2,
      level: 1,
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: building.id },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('building_blocked_command_center_level');
    expect(body.details).toMatchObject({ commandCenterLevel: 1, requiredLevel: 2 });
  });

  it('adds realistic home-system materials for upgrades targeting level 6+', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);
    await setCommandCenterLevel(planetId, 6);

    for (const resourceId of ['iron', 'carbon', 'steel', 'aluminum', 'titanium']) {
      await setResourceAmount(planetId, resourceId, 100000);
    }

    const [spaceport] = await db.insert(buildings).values({
      planetId,
      typeId: 'spaceport',
      slotIndex: 4,
      level: 5,
    }).returning();

    const typeInfo = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, 'spaceport'),
    });
    const expectedCosts = buildingUpgradeResourceCosts({
      typeId: 'spaceport',
      baseCost: typeInfo!.baseCost as Record<string, number>,
      currentLevel: 5,
    });
    expect(expectedCosts).toMatchObject({ steel: 26, titanium: 14, aluminum: 12 });
    expect(expectedCosts).not.toHaveProperty('biomass');

    const before = Object.fromEntries(
      await Promise.all(
        Object.keys(expectedCosts).map(async (resourceId) => [
          resourceId,
          await getResourceAmount(planetId, resourceId),
        ]),
      ),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: spaceport.id },
    });

    expect(response.statusCode).toBe(200);

    for (const [resourceId, amount] of Object.entries(expectedCosts)) {
      expect(await getResourceAmount(planetId, resourceId)).toBeCloseTo(Number(before[resourceId]) - amount, 1);
    }
  });

  it('charges basic resources for command center upgrades', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const commandCenter = await db.query.buildings.findFirst({
      where: and(
        eq(buildings.planetId, planetId),
        eq(buildings.typeId, 'command_center'),
      ),
    });
    expect(commandCenter).toBeDefined();

    const ironBefore = await getResourceAmount(planetId, 'iron');
    const carbonBefore = await getResourceAmount(planetId, 'carbon');
    const siliconBefore = await getResourceAmount(planetId, 'silicon');

    const commandCenterType = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, 'command_center'),
    });
    const baseCost = commandCenterType!.baseCost as Record<string, number>;
    expect(baseCost).toMatchObject({ iron: 80, carbon: 40, silicon: 10 });

    const scaledCost = Object.fromEntries(
      Object.entries(baseCost).map(([resourceId, amount]) => [
        resourceId,
        Math.floor(amount * Math.pow(1.6, commandCenter!.level)),
      ]),
    ) as Record<string, number>;

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: commandCenter!.id },
    });

    expect(response.statusCode).toBe(200);

    expect(await getResourceAmount(planetId, 'iron')).toBeCloseTo(ironBefore - scaledCost.iron, 1);
    expect(await getResourceAmount(planetId, 'carbon')).toBeCloseTo(carbonBefore - scaledCost.carbon, 1);
    expect(await getResourceAmount(planetId, 'silicon')).toBeCloseTo(siliconBefore - scaledCost.silicon, 1);
  });

  it('rejects command center upgrades when basic resources are missing', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const commandCenter = await db.query.buildings.findFirst({
      where: and(
        eq(buildings.planetId, planetId),
        eq(buildings.typeId, 'command_center'),
      ),
    });
    expect(commandCenter).toBeDefined();

    for (const resourceId of ['iron', 'carbon', 'silicon']) {
      await db.update(planetResources)
        .set({ amount: '0', regenRate: '0', lastUpdateAt: new Date() })
        .where(and(
          eq(planetResources.planetId, planetId),
          eq(planetResources.resourceId, resourceId),
        ));
    }

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: { buildingId: commandCenter!.id },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('not enough');

    const updatedCommandCenter = await db.query.buildings.findFirst({
      where: eq(buildings.id, commandCenter!.id),
    });
    expect(updatedCommandCenter?.queueAction).toBeNull();
  });
});
