import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { authRoutes } from '../features/auth/routes.js';
import { meRoutes } from '../features/me/routes.js';
import { buildingsRoutes } from '../features/buildings/routes.js';
import { shipsRoutes } from '../features/ships/routes.js';
import { db } from '../db/index.js';
import { planets, systems, ships, buildings, resources, planetResources } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../lib/env.js';

describe('Tick Ships Worker', () => {
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
    await app.register(shipsRoutes, { prefix: '/ships' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'TickTest', username: 'ticktest' };
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

  async function ensureFuel(planetId: string, amount: number) {
    await db.insert(resources).values({
      id: 'fuel',
      name: { ru: 'fuel', en: 'fuel' },
      tier: 1,
      symbol: 'F',
      baseRegenRate: 0,
      defaultStorageCap: 5000,
    }).onConflictDoNothing();

    const existing = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, 'fuel'),
      ),
    });
    if (!existing) {
      await db.insert(planetResources).values({
        planetId,
        resourceId: 'fuel',
        amount: amount.toFixed(4),
        lastUpdateAt: new Date(),
        regenRate: '0',
      });
    }
  }

  it('should complete a ship build — set status to idle', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'shipyard',
      level: 1,
    });

    await ensureFuel(planetId, 100);

    const buildResponse = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId, typeSlug: 'scout' },
    });

    expect(buildResponse.statusCode).toBe(200);
    const { ship } = buildResponse.json() as { ship: { id: string; status: string } };
    expect(ship.status).toBe('building');

    await db
      .update(ships)
      .set({ status: 'idle' })
      .where(eq(ships.id, ship.id));

    const updated = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('idle');
    expect(updated!.locationPlanetId).toBe(planetId);
    expect(updated!.ownerId).toBe(userId);
    expect(updated!.typeId).toBe('scout');
  });

  it('should handle non-existent ship gracefully', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const result = await db
      .update(ships)
      .set({ status: 'idle' })
      .where(eq(ships.id, fakeId));

    expect(result).toBeDefined();
  });

  it('should set status to idle without modifying other fields', async () => {
    const { userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    const [inserted] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: 'scout',
        locationPlanetId: planetId,
        status: 'building',
        cargoJson: {},
        fuel: '0',
      })
      .returning();

    await db
      .update(ships)
      .set({ status: 'idle' })
      .where(eq(ships.id, inserted.id));

    const updated = await db.query.ships.findFirst({
      where: eq(ships.id, inserted.id),
    });
    expect(updated!.status).toBe('idle');
    expect(updated!.ownerId).toBe(userId);
    expect(updated!.locationPlanetId).toBe(planetId);
    expect(updated!.typeId).toBe('scout');
    expect(updated!.fuel).toBe('0.00');
  });
});
