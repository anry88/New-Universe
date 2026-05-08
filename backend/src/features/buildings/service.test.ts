import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildingsRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { meRoutes } from '../me/routes.js';
import { db } from '../../db/index.js';
import { planets, systems, buildings } from '../../db/schema.js';
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
        typeSlug: 'mine',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.building).toBeDefined();
    expect(body.building.planetId).toBe(userPlanet!.id);
    expect(body.building.typeId).toBe('mine');
    expect(body.building.queueAction).toBe('build');
    expect(body.building.queueCompletesAt).toBeDefined();
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
        typeSlug: 'mine',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('No free slots');
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
        typeSlug: 'mine',
      },
    });
    expect(firstResponse.statusCode).toBe(200);

    const secondResponse = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: userPlanet!.id,
        typeSlug: 'drill',
      },
    });

    expect(secondResponse.statusCode).toBe(400);
    const body = secondResponse.json();
    expect(body.error).toContain('Build queue is full');
  });

  it('should return 401 without authorization', async () => {
    const app = Fastify();
    await app.register(buildingsRoutes, { prefix: '/buildings' });

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      payload: {
        planetId: '00000000-0000-0000-0000-000000000000',
        typeSlug: 'mine',
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
        typeSlug: 'nonexistent_building',
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toContain('Unknown building type');
  });

  it('should return 404 for non-existent planet', async () => {
    const { app, token } = await createTestUser();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId: '00000000-0000-0000-0000-000000000000',
        typeSlug: 'mine',
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toContain('Planet not found');
  });
});
