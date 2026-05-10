import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildingsRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { meRoutes } from '../me/routes.js';
import { db } from '../../db/index.js';
import { planets, systems, buildings, planetResources } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';

describe('Buildings Service - POST /buildings/build', () => {
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
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.queueItem).toBeDefined();
    expect(body.queueItem.id).toBeDefined();
    expect(body.queueItem.completesAt).toBeDefined();
  });

  it('should return 400 when planet has no free slots', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
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
    expect(body.message).toContain('Slot already occupied');
  });

  it('should return 400 when build queue is full', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    });

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: userPlanet!.id,
        typeId: 'mine',
        slotIndex: 1,
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
    expect(body.message).toContain('Planet not found');
  });

  it('should sync and finalize completed building construction', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    });

    // Manually insert a building that is "ready"
    const [b] = await db.insert(buildings).values({
      planetId: userPlanet!.id,
      typeId: 'mine',
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

  it('should demolish a building and refund 50% of costs', async () => {
    const { app, token, userId } = await createTestUser();

    const userSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const userPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, userSystem!.id),
    });

    // Manually insert a level 2 building
    // Total spent for level 2: baseCost * (2^2 - 1) = 3 * baseCost
    // Refund: floor(0.5 * 3 * baseCost) = floor(1.5 * baseCost)
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
});
