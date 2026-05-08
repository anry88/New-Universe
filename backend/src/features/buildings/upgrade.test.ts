import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildingsRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { meRoutes } from '../me/routes.js';
import { db } from '../../db/index.js';
import { planets, systems, buildings, buildingTypes } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';

describe('Building Upgrade - POST /buildings/:id/upgrade', () => {
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
    });
    return planet!.id;
  }

  it('should upgrade a building successfully', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      level: 1,
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: `/buildings/${building.id}/upgrade`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.building).toBeDefined();
    expect(body.building.id).toBe(building.id);
    expect(body.building.queueAction).toBe('upgrade');
    expect(body.building.queueCompletesAt).toBeDefined();
    expect(body.building.level).toBe(1);
  });

  it('should return 404 for non-existent building', async () => {
    const { app, token } = await createTestUser();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/00000000-0000-0000-0000-000000000000/upgrade',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toContain('Building not found');
  });

  it('should return 401 without authorization', async () => {
    const app = Fastify();
    await app.register(buildingsRoutes, { prefix: '/buildings' });

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/00000000-0000-0000-0000-000000000000/upgrade',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 400 when building is already at max level', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'command_center',
      level: 20,
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: `/buildings/${building.id}/upgrade`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('max level');
  });

  it('should return 400 when building is already in a queue', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      level: 1,
      queueAction: 'build',
      queueCompletesAt: new Date(Date.now() + 60000),
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: `/buildings/${building.id}/upgrade`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('already in a queue');
  });

  it('should return 400 when planet build queue is full', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const [upgradeTarget] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      level: 1,
    }).returning();

    await db.insert(buildings).values({
      planetId,
      typeId: 'drill',
      level: 1,
      queueAction: 'build',
      queueCompletesAt: new Date(Date.now() + 60000),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/buildings/${upgradeTarget.id}/upgrade`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain('Build queue is full');
  });

  it('should calculate upgrade cost using base_cost * 1.6^(level-1)', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const mineType = await db.query.buildingTypes.findFirst({
      where: eq(buildingTypes.id, 'mine'),
    });
    const baseCost = mineType!.baseCost as Record<string, number>;
    const scaledIron = Math.ceil((baseCost.iron || 0) * Math.pow(1.6, 0));

    const [building] = await db.insert(buildings).values({
      planetId,
      typeId: 'mine',
      level: 1,
    }).returning();

    const response = await app.inject({
      method: 'POST',
      url: `/buildings/${building.id}/upgrade`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);

    const ironAfter = await db.query.planetResources.findFirst({
      where: (pr, { eq: e, and: a }) => a(e(pr.planetId, planetId), e(pr.resourceId, 'iron')),
    });
    expect(Number(ironAfter?.amount || 0)).toBe(1000 - scaledIron);
  });
});
