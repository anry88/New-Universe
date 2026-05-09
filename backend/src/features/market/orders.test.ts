import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { env } from '../../lib/env.js';
import { authRoutes } from '../auth/routes.js';
import { marketRoutes } from '../../routes/market.js';
import { db } from '../../db/index.js';
import { planetResources, planets, resources, systems, researchProgress } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { calculateNpcMarketQuote } from './pricing.js';

function createValidInitData(user: any): string {
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

async function createTestUser() {
  await ensureMarketOrderTable();

  const app = Fastify();
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(marketRoutes);

  const tgId = Math.floor(Math.random() * 100000000);
  const tgUser = { id: tgId, first_name: 'MarketTest', username: `market_${tgId}` };
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

let marketTableReady = false;
async function ensureMarketOrderTable() {
  if (marketTableReady) return;
  const tableCheck = await db.execute<{ exists: string | null }>(
    sql`select to_regclass('public.market_orders') as exists`,
  );
  if (tableCheck[0]?.exists) {
    marketTableReady = true;
    return;
  }

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_scope') THEN
        CREATE TYPE market_scope AS ENUM ('npc', 'player');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_side') THEN
        CREATE TYPE market_side AS ENUM ('buy', 'sell');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_order_type') THEN
        CREATE TYPE market_order_type AS ENUM ('market', 'limit');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_order_status') THEN
        CREATE TYPE market_order_status AS ENUM ('open', 'partially_filled', 'filled', 'cancelled', 'expired', 'failed', 'settled');
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS market_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope market_scope NOT NULL DEFAULT 'npc',
      side market_side NOT NULL,
      order_type market_order_type NOT NULL DEFAULT 'market',
      status market_order_status NOT NULL DEFAULT 'open',
      resource_id text NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
      requested_qty numeric(18,4) NOT NULL,
      filled_qty numeric(18,4) NOT NULL DEFAULT '0',
      limit_price numeric(18,4),
      avg_executed_price numeric(18,4),
      fee_bps integer NOT NULL DEFAULT 0,
      fee_amount numeric(18,4) NOT NULL DEFAULT '0',
      total_value numeric(18,4) NOT NULL DEFAULT '0',
      source_offer_id uuid,
      delivery_expedition_id uuid,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      closed_at timestamp
    );
  `);
  marketTableReady = true;
}

async function getResourceAmount(planetId: string, resourceId: string): Promise<number> {
  const row = await db.query.planetResources.findFirst({
    where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
  });
  return Number(row?.amount || 0);
}

async function getResourceTier(resourceId: string): Promise<number> {
  const row = await db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
    columns: { tier: true },
  });
  return row?.tier ?? 1;
}

describe('market order API', () => {
  it('GET /market/offers returns deterministic prices and availability', async () => {
    const { app } = await createTestUser();
    const response = await app.inject({ method: 'GET', url: '/market/offers' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { offers: Array<{ resourceId: string; side: string; pricePerUnit: number; availableQty: number }> };
    expect(body.offers.length).toBeGreaterThan(0);
    const ironBuy = body.offers.find((o) => o.resourceId === 'iron' && o.side === 'buy');
    const ironSell = body.offers.find((o) => o.resourceId === 'iron' && o.side === 'sell');
    expect(ironBuy).toBeDefined();
    expect(ironSell).toBeDefined();
    expect(ironBuy!.pricePerUnit).toBeGreaterThan(ironSell!.pricePerUnit);
    expect(ironBuy!.availableQty).toBeGreaterThan(0);
  });

  it('POST /market/orders creates sell order and reserves resources atomically', async () => {
    const { app, token, planetId } = await createTestUser();
    const beforeIron = await getResourceAmount(planetId, 'iron');
    const tier = await getResourceTier('iron');
    const quote = calculateNpcMarketQuote({ resourceId: 'iron', tier, stockRatio: 1 });

    const createRes = await app.inject({
      method: 'POST',
      url: '/market/orders',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        side: 'sell',
        resourceId: 'iron',
        quantity: 100,
        expectedUnitPrice: quote.sellPrice,
      },
    });

    expect(createRes.statusCode).toBe(200);
    const body = createRes.json() as any;
    expect(body.order).toBeDefined();
    expect(body.order.status).toBe('open');

    const afterIron = await getResourceAmount(planetId, 'iron');
    expect(afterIron).toBeCloseTo(beforeIron - 100, 2);
  });

  it('POST /market/orders rejects when user lacks reserved funds/resources', async () => {
    const { app, token, planetId } = await createTestUser();
    const tier = await getResourceTier('uranium');
    const quote = calculateNpcMarketQuote({ resourceId: 'uranium', tier, stockRatio: 1 });

    const createRes = await app.inject({
      method: 'POST',
      url: '/market/orders',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        side: 'buy',
        resourceId: 'uranium',
        quantity: 999999,
        expectedUnitPrice: quote.buyPrice,
      },
    });

    expect(createRes.statusCode).toBe(400);
    expect((createRes.json() as any).message).toBeTruthy();
  });

  it('cancel returns reserved resources for open sell order', async () => {
    const { app, token, planetId } = await createTestUser();
    const tier = await getResourceTier('silicon');
    const quote = calculateNpcMarketQuote({ resourceId: 'silicon', tier, stockRatio: 1 });

    const beforeSilicon = await getResourceAmount(planetId, 'silicon');
    const createRes = await app.inject({
      method: 'POST',
      url: '/market/orders',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planetId,
        side: 'sell',
        resourceId: 'silicon',
        quantity: 50,
        expectedUnitPrice: quote.sellPrice,
      },
    });
    expect(createRes.statusCode).toBe(200);
    const orderId = (createRes.json() as any).order.id as string;
    const afterCreate = await getResourceAmount(planetId, 'silicon');
    expect(afterCreate).toBeCloseTo(beforeSilicon - 50, 2);

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/market/orders/${orderId}/cancel`,
      headers: { authorization: `Bearer ${token}` },
      payload: { planetId },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect((cancelRes.json() as any).order.status).toBe('cancelled');

    const afterCancel = await getResourceAmount(planetId, 'silicon');
    expect(afterCancel).toBeCloseTo(beforeSilicon, 2);
  });
});
