import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { researchRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { db } from '../../db/index.js';
import { buildings, planetResources, planets, researchProgress, systems } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';
import { getResearchDef } from './data.js';

describe('Research Routes', () => {
  const botToken = env.TELEGRAM_BOT_TOKEN;

  function createValidInitData(user: any): string {
    const authDate = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams();
    params.append('auth_date', authDate.toString());
    params.append('user', JSON.stringify(user));
    params.sort();
    const dataToCheck = Array.from(params.entries()).map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataToCheck).digest('hex');
    params.append('hash', hash);
    return params.toString();
  }

  async function createTestUser() {
    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(researchRoutes, { prefix: '/research' });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'ResTest', username: 'restest' };
    const initData = createValidInitData(tgUser);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });

    const { token, user } = loginResponse.json();
    return { app, token, userId: user.id as string };
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

  async function getResourceAmount(planetId: string, resourceId: string): Promise<number> {
    const record = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, resourceId),
      ),
    });
    return record ? Number(record.amount) : 0;
  }

  it('spends iron and silicon when starting mining level 1 research', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'lab',
      slotIndex: 0,
      level: 1,
    });

    const ironBefore = await getResourceAmount(planetId, 'iron');
    const siliconBefore = await getResourceAmount(planetId, 'silicon');

    const response = await app.inject({
      method: 'POST',
      url: '/research/start',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        branch: 'mining',
        planetId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    const miningL1 = getResearchDef('mining', 1);
    expect(miningL1).toBeTruthy();
    const ironCost = miningL1!.cost.iron ?? 0;
    const siliconCost = miningL1!.cost.silicon ?? 0;

    const ironAfter = await getResourceAmount(planetId, 'iron');
    const siliconAfter = await getResourceAmount(planetId, 'silicon');
    expect(ironAfter).toBe(ironBefore - ironCost);
    expect(siliconAfter).toBe(siliconBefore - siliconCost);

    const progress = await db.query.researchProgress.findFirst({
      where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')),
    });
    expect(progress).toBeTruthy();
    expect(progress?.level).toBe(0);
    expect(progress?.completesAt).toBeTruthy();
  });
});
