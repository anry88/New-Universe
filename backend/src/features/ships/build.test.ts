import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { shipsRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { meRoutes } from '../me/routes.js';
import { db } from '../../db/index.js';
import { planets, systems, buildings, ships, planetResources, resources } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';

describe('Ship Building - POST /ships/build', () => {
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

  it('should build a scout ship with shipyard', async () => {
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
    expect(body.ship.queueCompletesAt).toBeTruthy();
    expect(body.ship.ownerId).toBe(userId);
    expect(body.ship.locationPlanetId).toBe(planetId);
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
    expect(body.error).toContain('Shipyard required');
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
    expect(body.error).toContain('Unknown ship type');
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
  });
});
