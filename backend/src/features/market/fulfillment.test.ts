import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { env } from '../../lib/env.js';
import { authRoutes } from '../auth/routes.js';
import { marketRoutes } from '../../routes/market.js';
import { db } from '../../db/index.js';
import { marketOrders, planetResources, planets, researchProgress, resources, systems } from '../../db/schema.js';
import { fulfillNpcMarketOrder, processNpcMarketFulfillment } from './fulfillment.js';
import { calculateNpcMarketQuote } from './pricing.js';

function createValidInitData(user: { id: number; first_name: string; username?: string }): string {
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams();
  params.append('auth_date', authDate.toString());
  params.append('user', JSON.stringify(user));
  params.sort();

  const dataToCheck = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(env.TELEGRAM_BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataToCheck).digest('hex');
  params.append('hash', hash);
  return params.toString();
}

async function createMarketTestUser() {
  const app = Fastify();
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(marketRoutes);

  const tgId = Math.floor(Math.random() * 100000000);
  const tgUser = { id: tgId, first_name: 'FulfillmentTest', username: `mktful_${tgId}` };
  const initData = createValidInitData(tgUser);

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    headers: { 'x-telegram-init-data': initData },
  });

  const { token, user } = loginResponse.json();
  const system = await db.query.systems.findFirst({
    where: eq(systems.ownerId, user.id),
  });
  const planet = await db.query.planets.findFirst({
    where: eq(planets.systemId, system!.id),
  
    orderBy: (p, { asc }) => asc(p.name),
    });

  await db
    .insert(researchProgress)
    .values({ userId: user.id, branch: 'logistics', level: 1 })
    .onConflictDoUpdate({
      target: [researchProgress.userId, researchProgress.branch],
      set: { level: 1 },
    });

  return { app, token, userId: user.id as string, planetId: planet!.id };
}

async function getAmount(planetId: string, resourceId: string): Promise<number> {
  const row = await db.query.planetResources.findFirst({
    where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
  });
  return Number(row?.amount || 0);
}

describe('NPC market fulfillment', () => {
  it('credits iron for fulfilled sell orders once (idempotent)', async () => {
    const { app, token, planetId } = await createMarketTestUser();
    const tier = (
      await db.query.resources.findFirst({
        where: eq(resources.id, 'silicon'),
        columns: { tier: true },
      })
    )!.tier;
    const quote = calculateNpcMarketQuote({ resourceId: 'silicon', tier, stockRatio: 1 });
    const qty = 40;
    const totalPay = qty * quote.sellPrice;

    const beforeSilicon = await getAmount(planetId, 'silicon');
    const beforeIron = await getAmount(planetId, 'iron');

    const createRes = await app.inject({
      method: 'POST',
      url: '/market/orders',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        side: 'sell',
        resourceId: 'silicon',
        quantity: qty,
        expectedUnitPrice: quote.sellPrice,
      },
    });
    expect(createRes.statusCode).toBe(200);
    const orderId = (createRes.json() as { order: { id: string } }).order.id;

    const afterCreateSilicon = await getAmount(planetId, 'silicon');
    expect(afterCreateSilicon).toBeCloseTo(beforeSilicon - qty, 2);

    await processNpcMarketFulfillment(db, () => new Date());

    const orderRow = await db.query.marketOrders.findFirst({
      where: eq(marketOrders.id, orderId),
    });
    expect(orderRow?.status).toBe('filled');

    const afterIron = await getAmount(planetId, 'iron');
    expect(afterIron).toBeCloseTo(beforeIron + totalPay, 2);

    await processNpcMarketFulfillment(db, () => new Date());
    const afterIron2 = await getAmount(planetId, 'iron');
    expect(afterIron2).toBeCloseTo(afterIron, 2);
  });

  it('delivers buy resources after ETA without duplicating on retry', async () => {
    const { app, token, planetId } = await createMarketTestUser();
    const tier = (
      await db.query.resources.findFirst({
        where: eq(resources.id, 'silicon'),
        columns: { tier: true },
      })
    )!.tier;
    const quote = calculateNpcMarketQuote({ resourceId: 'silicon', tier, stockRatio: 1 });
    const qty = 15;

    const beforeIron = await getAmount(planetId, 'iron');
    const beforeSi = await getAmount(planetId, 'silicon');

    const createRes = await app.inject({
      method: 'POST',
      url: '/market/orders',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        side: 'buy',
        resourceId: 'silicon',
        quantity: qty,
        expectedUnitPrice: quote.buyPrice,
      },
    });
    expect(createRes.statusCode).toBe(200);
    const orderId = (createRes.json() as { order: { id: string } }).order.id;

    const reservedIron = qty * quote.buyPrice;
    const afterCreateIron = await getAmount(planetId, 'iron');
    expect(afterCreateIron).toBeCloseTo(beforeIron - reservedIron, 2);

    await db
      .update(marketOrders)
      .set({ deliveryReadyAt: new Date(Date.now() - 60_000) })
      .where(eq(marketOrders.id, orderId));

    await processNpcMarketFulfillment(db, () => new Date());

    const orderRow = await db.query.marketOrders.findFirst({
      where: eq(marketOrders.id, orderId),
    });
    expect(orderRow?.status).toBe('filled');

    const afterSi = await getAmount(planetId, 'silicon');
    expect(afterSi).toBeCloseTo(beforeSi + qty, 2);

    await processNpcMarketFulfillment(db, () => new Date());
    const afterSi2 = await getAmount(planetId, 'silicon');
    expect(afterSi2).toBeCloseTo(afterSi, 2);
  });

  it('fulfillNpcMarketOrder is a no-op when order already settled', async () => {
    const { app, token, planetId } = await createMarketTestUser();
    const tier = (
      await db.query.resources.findFirst({
        where: eq(resources.id, 'iron'),
        columns: { tier: true },
      })
    )!.tier;
    const quote = calculateNpcMarketQuote({ resourceId: 'iron', tier, stockRatio: 1 });

    const createRes = await app.inject({
      method: 'POST',
      url: '/market/orders',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        side: 'sell',
        resourceId: 'iron',
        quantity: 20,
        expectedUnitPrice: quote.sellPrice,
      },
    });
    expect(createRes.statusCode).toBe(200);
    const orderId = (createRes.json() as { order: { id: string } }).order.id;

    await fulfillNpcMarketOrder(db, orderId, new Date());
    const iron1 = await getAmount(planetId, 'iron');

    await fulfillNpcMarketOrder(db, orderId, new Date());
    const iron2 = await getAmount(planetId, 'iron');
    expect(iron2).toBeCloseTo(iron1, 2);
  });
});
