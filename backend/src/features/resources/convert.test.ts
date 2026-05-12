import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { resourcesRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { meRoutes } from '../me/routes.js';
import { db } from '../../db/index.js';
import { planets, systems, buildings, planetResources } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';

describe('Resource Conversion - POST /resources/convert', () => {
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
    await app.register(resourcesRoutes, { prefix: '/resources' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'ConvertTest', username: 'converttest' };
    const initData = createValidInitData(tgUser);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });

    const { token, user } = loginResponse.json();
    return { app, token, userId: user.id };
  }

  async function getHomePlanet(userId: string): Promise<string> {
    const system = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const planet = await db.query.planets.findFirst({
      where: eq(planets.systemId, system!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });
    return planet!.id;
  }

  async function addBuilding(planetId: string, typeId: string, level = 1, slotIndex = 0) {
    await db.insert(buildings).values({
      planetId,
      typeId,
      slotIndex,
      level,
    });
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

  async function ensureResource(planetId: string, resourceId: string, amount: number) {
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

  it('should reject without Cryogenic Factory', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanet(userId);

    const response = await app.inject({
      method: 'POST',
      url: '/resources/convert',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        from: 'ice',
        to: 'water',
        amount: 10,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('Cryogenic Factory');
  });

  it('should convert ice to water with Cryo Factory and solar_plant', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanet(userId);

    await addBuilding(planetId, 'cryo_factory', 1, 0);
    await addBuilding(planetId, 'solar_plant', 1, 1);
    await addBuilding(planetId, 'battery', 1, 2);
    await ensureResource(planetId, 'ice', 200);
    await ensureResource(planetId, 'energy', 500);

    const iceBefore = await getResourceAmount(planetId, 'ice');
    const waterBefore = await getResourceAmount(planetId, 'water');

    const response = await app.inject({
      method: 'POST',
      url: '/resources/convert',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        from: 'ice',
        to: 'water',
        amount: 100,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.from).toBe('ice');
    expect(body.to).toBe('water');
    expect(body.fromAmount).toBe(100);
    expect(body.toAmount).toBe(100);

    const iceAfter = await getResourceAmount(planetId, 'ice');
    const waterAfter = await getResourceAmount(planetId, 'water');
    expect(iceAfter).toBeCloseTo(iceBefore - 100, 1);
    expect(waterAfter).toBeCloseTo(waterBefore + 100, 1);
  });

  it('should convert water to ice with 5% loss', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanet(userId);

    await addBuilding(planetId, 'cryo_factory', 1, 0);
    await addBuilding(planetId, 'solar_plant', 1, 1);
    await addBuilding(planetId, 'battery', 1, 2);
    await ensureResource(planetId, 'ice', 0);
    await ensureResource(planetId, 'energy', 500);

    const waterBefore = await getResourceAmount(planetId, 'water');
    expect(waterBefore).toBeGreaterThanOrEqual(100);

    const response = await app.inject({
      method: 'POST',
      url: '/resources/convert',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        from: 'water',
        to: 'ice',
        amount: 100,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.from).toBe('water');
    expect(body.to).toBe('ice');
    expect(body.fromAmount).toBe(100);
    expect(body.toAmount).toBe(95);

    const waterAfter = await getResourceAmount(planetId, 'water');
    const iceAfter = await getResourceAmount(planetId, 'ice');
    expect(waterAfter).toBeCloseTo(waterBefore - 100, 1);
    expect(iceAfter).toBeCloseTo(95, 1);
  });

  it('should return 401 without authorization', async () => {
    const app = Fastify();
    await app.register(resourcesRoutes, { prefix: '/resources' });

    const response = await app.inject({
      method: 'POST',
      url: '/resources/convert',
      payload: {
        planetId: '00000000-0000-0000-0000-000000000000',
        from: 'ice',
        to: 'water',
        amount: 10,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 404 for non-existent planet', async () => {
    const { app, token } = await createTestUser();

    const response = await app.inject({
      method: 'POST',
      url: '/resources/convert',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: '00000000-0000-0000-0000-000000000000',
        from: 'ice',
        to: 'water',
        amount: 10,
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toContain('Planet not found');
  });

  it('should return 400 for invalid resource type', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanet(userId);

    await addBuilding(planetId, 'cryo_factory', 1, 0);
    await addBuilding(planetId, 'solar_plant', 1, 1);

    const response = await app.inject({
      method: 'POST',
      url: '/resources/convert',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        from: 'iron',
        to: 'water',
        amount: 10,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('Invalid resource');
  });

  it('should return 400 when not enough source resource', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanet(userId);

    await addBuilding(planetId, 'cryo_factory', 1, 0);
    await addBuilding(planetId, 'solar_plant', 1, 1);
    await ensureResource(planetId, 'ice', 5);

    const response = await app.inject({
      method: 'POST',
      url: '/resources/convert',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        from: 'ice',
        to: 'water',
        amount: 100,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('not enough');
  });

  it('should buy planet resource with diamonds (tier-based pricing)', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanet(userId);
    const ironBefore = await getResourceAmount(planetId, 'iron');

    const response = await app.inject({
      method: 'POST',
      url: '/resources/buy-with-diamonds',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        resourceId: 'iron',
        amount: 250,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.resourceId).toBe('iron');
    expect(body.amount).toBe(250);
    expect(body.diamondsSpent).toBe(3); // tier1: 100 units/diamond
    expect(body.unitsPerDiamond).toBe(100);

    const ironAfter = await getResourceAmount(planetId, 'iron');
    expect(ironAfter).toBeCloseTo(ironBefore + 250, 1);
  });

  it('should reject diamond buy for resource absent on selected planet', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanet(userId);

    const response = await app.inject({
      method: 'POST',
      url: '/resources/buy-with-diamonds',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        resourceId: 'antimatter',
        amount: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('not available');
  });

  it('should return quote for diamond purchase', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanet(userId);

    const response = await app.inject({
      method: 'POST',
      url: '/resources/buy-with-diamonds/quote',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        resourceId: 'iron',
        amount: 250,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.diamondsNeeded).toBe(3);
    expect(body.unitsPerDiamond).toBe(100);
    expect(body.tier).toBe(1);
  });
});
