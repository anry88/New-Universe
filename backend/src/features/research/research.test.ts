import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { researchRoutes } from './routes.js';
import { authRoutes } from '../auth/routes.js';
import { db } from '../../db/index.js';
import { buildings, planetResources, planets, researchProgress, systems } from '../../db/schema.js';
import { and, eq, isNotNull } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '../../lib/env.js';
import { getResearchDef } from './data.js';
import { resourceLabel } from '@shared/types/entity-labels.js';

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

  it('spends iron and silicon when starting mining level 1 research', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'lab',
      slotIndex: 1,
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
    expect(ironAfter).toBeCloseTo(ironBefore - ironCost, 1);
    expect(siliconAfter).toBeCloseTo(siliconBefore - siliconCost, 1);

    const progress = await db.query.researchProgress.findFirst({
      where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')),
    });
    expect(progress).toBeTruthy();
    expect(progress?.level).toBe(0);
    expect(progress?.completesAt).toBeTruthy();
  });

  it('uses the current lab level while that lab is upgrading', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'lab',
      slotIndex: 1,
      level: 1,
      queueAction: 'upgrade',
      queueCompletesAt: new Date(Date.now() + 60_000),
    });

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
  });

  it('rejects starting a second branch while one research timer is active', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'lab',
      slotIndex: 1,
      level: 1,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/research/start',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        branch: 'mining',
        planetId,
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/research/start',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        branch: 'engineering',
        planetId,
      },
    });

    expect(second.statusCode).toBe(400);
    expect(second.json()).toMatchObject({
      error: 'Research queue is busy',
      activeBranch: 'mining',
    });

    const activeRows = await db.query.researchProgress.findMany({
      where: and(eq(researchProgress.userId, userId), isNotNull(researchProgress.completesAt)),
    });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]?.branch).toBe('mining');
  });

  it('returns localized resource labels when research stock is insufficient', async () => {
    const { app, token, userId } = await createTestUser();
    const planetId = await getHomePlanetId(userId);

    await db.insert(buildings).values({
      planetId,
      typeId: 'lab',
      slotIndex: 1,
      level: 1,
    });

    const miningL1 = getResearchDef('mining', 1)!;
    const firstCostResourceId = Object.keys(miningL1.cost)[0]!;
    await db
      .update(planetResources)
      .set({ amount: '0', regenRate: '0', lastUpdateAt: new Date() })
      .where(and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, firstCostResourceId),
      ));

    const response = await app.inject({
      method: 'POST',
      url: '/research/start',
      headers: {
        authorization: `Bearer ${token}`,
        'accept-language': 'ru',
      },
      payload: {
        branch: 'mining',
        planetId,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain(resourceLabel(firstCostResourceId, 'ru'));
    expect(response.json().error).not.toContain(firstCostResourceId);
  });
});
