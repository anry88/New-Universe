/**
 * Phase 2 regression gate (task P2-POL-003): one synthetic player runs research start→complete,
 * first extra colony, cargo transfer between owned planets, then first NPC market sell order.
 * Expect messages are prefixed by feature area so failures map to Colonization / Cargo / Market / Research.
 */
import Fastify from 'fastify';
import crypto from 'crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import {
  buildings,
  colonies,
  discoveredPlanets,
  planets,
  planetResources,
  resources,
  researchProgress,
  ships,
  systems,
} from '../../src/db/schema.js';
import { authRoutes } from '../../src/features/auth/routes.js';
import { meRoutes } from '../../src/features/me/routes.js';
import { buildingsRoutes } from '../../src/features/buildings/routes.js';
import { resourcesRoutes } from '../../src/features/resources/routes.js';
import { shipsRoutes } from '../../src/features/ships/routes.js';
import { expeditionsRoutes } from '../../src/features/expeditions/routes.js';
import { researchRoutes } from '../../src/features/research/routes.js';
import { coloniesRoutes } from '../../src/routes/colonies.js';
import { cargoRoutes } from '../../src/routes/cargo.js';
import { marketRoutes } from '../../src/routes/market.js';
import { seedResources } from '../../src/db/seed/resources.js';
import { seedBuildingTypes } from '../../src/db/seed/building-types.js';
import { seedShipTypes } from '../../src/db/seed/ship-types.js';
import { env } from '../../src/lib/env.js';
import { processCompletedResearch } from '../../src/features/research/completion.js';
import { calculateNpcMarketQuote } from '../../src/features/market/pricing.js';

const AREA = {
  colonization: '[Colonization]',
  cargo: '[Cargo]',
  market: '[Market]',
  research: '[Research]',
} as const;

async function planetAmount(planetId: string, resourceId: string): Promise<number> {
  const row = await db.query.planetResources.findFirst({
    where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
  });
  return row ? Number(row.amount) : 0;
}

describe('Phase 2 regression suite', () => {
  let app: ReturnType<typeof Fastify>;
  const botToken = env.TELEGRAM_BOT_TOKEN;

  beforeAll(async () => {
    await seedResources();
    await seedBuildingTypes();
    await seedShipTypes();

    app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(meRoutes, { prefix: '/me' });
    await app.register(buildingsRoutes, { prefix: '/buildings' });
    await app.register(resourcesRoutes, { prefix: '/resources' });
    await app.register(shipsRoutes, { prefix: '/ships' });
    await app.register(expeditionsRoutes, { prefix: '/expeditions' });
    await app.register(researchRoutes, { prefix: '/research' });
    await app.register(coloniesRoutes, { prefix: '/colonies' });
    await app.register(cargoRoutes, { prefix: '/cargo' });
    await app.register(marketRoutes);
  });

  function createValidInitData(user: { id: number; first_name: string; username: string }): string {
    const authDate = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams();
    params.append('auth_date', authDate.toString());
    params.append('user', JSON.stringify(user));
    params.sort();
    const dataToCheck = Array.from(params.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataToCheck).digest('hex');
    params.append('hash', hash);
    return params.toString();
  }

  it('full path: research → first colony → cargo transfer → NPC market sell (resource accounting)', async () => {
    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'P2Regress', username: `p2reg_${tgId}` };
    const initData = createValidInitData(tgUser);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });
    expect(loginRes.statusCode, `${AREA.colonization} login`).toBe(200);
    const { token, user } = loginRes.json();
    const userId = user.id as string;

    const homeSystem = await db.query.systems.findFirst({
      where: and(eq(systems.ownerId, userId), eq(systems.isHome, true)),
      with: { planets: { limit: 1 } },
    });
    expect(homeSystem?.planets?.[0], `${AREA.colonization} home planet`).toBeDefined();
    const homePlanetId = homeSystem!.planets![0].id;

    await db
      .insert(researchProgress)
      .values({ userId, branch: 'engineering', level: 2 })
      .onConflictDoUpdate({
        target: [researchProgress.userId, researchProgress.branch],
        set: { level: 2 },
      });
    await db
      .insert(researchProgress)
      .values({ userId, branch: 'logistics', level: 1 })
      .onConflictDoUpdate({
        target: [researchProgress.userId, researchProgress.branch],
        set: { level: 1 },
      });

    const colonizationPack = [
      { resourceId: 'iron', amount: '30000' },
      { resourceId: 'water', amount: '12000' },
      { resourceId: 'carbon', amount: '8000' },
      { resourceId: 'silicon', amount: '4000' },
    ];
    for (const row of colonizationPack) {
      await db
        .insert(planetResources)
        .values({
          planetId: homePlanetId,
          resourceId: row.resourceId,
          amount: row.amount,
          regenRate: '0',
        })
        .onConflictDoUpdate({
          target: [planetResources.planetId, planetResources.resourceId],
          set: { amount: row.amount },
        });
    }

    await db.insert(buildings).values({
      planetId: homePlanetId,
      typeId: 'lab',
      level: 1,
      slotIndex: 1,
    });

    const resStart = await app.inject({
      method: 'POST',
      url: '/research/start',
      headers: { authorization: `Bearer ${token}` },
      payload: { branch: 'mining', planetId: homePlanetId },
    });
    expect(resStart.statusCode, `${AREA.research} POST /research/start (mining I)`).toBe(200);

    await db
      .update(researchProgress)
      .set({ completesAt: new Date(Date.now() - 60_000) })
      .where(and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')));
    await processCompletedResearch(db);

    const miningDone = await db.query.researchProgress.findFirst({
      where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')),
    });
    expect(miningDone?.level, `${AREA.research} mining level after tick`).toBe(1);
    expect(miningDone?.completesAt, `${AREA.research} mining completesAt cleared`).toBeNull();

    await db
      .update(systems)
      .set({ x: '0.00', y: '0.00', z: '0.00' })
      .where(and(eq(systems.ownerId, userId), eq(systems.isHome, true)));

    const [targetSystem] = await db
      .insert(systems)
      .values({
        sectorX: 2,
        sectorY: 2,
        sectorZ: 2,
        x: '1000.00',
        y: '1000.00',
        z: '1000.00',
        name: 'Regression Target System',
        seed: 424242,
      })
      .returning();

    const [targetPlanet] = await db
      .insert(planets)
      .values({
        systemId: targetSystem.id,
        biome: 'green',
        size: 14,
        slotCount: 10,
        name: 'Regression Target Planet',
      })
      .returning();

    await db.insert(discoveredPlanets).values({
      userId,
      planetId: targetPlanet.id,
    });

    const [colonizer] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: 'colonizer',
        locationPlanetId: targetPlanet.id,
        status: 'idle',
      })
      .returning();

    const foundRes = await app.inject({
      method: 'POST',
      url: '/colonies/found',
      headers: { authorization: `Bearer ${token}` },
      body: { shipId: colonizer.id, planetId: targetPlanet.id },
    });
    expect(foundRes.statusCode, `${AREA.colonization} POST /colonies/found`).toBe(200);

    const colonyPlanetId = targetPlanet.id;

    const [scout] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: 'scout',
        locationPlanetId: homePlanetId,
        status: 'idle',
      })
      .returning();

    const cargoQty = 40;
    const ironBeforeCargo = await planetAmount(homePlanetId, 'iron');
    expect(ironBeforeCargo, `${AREA.cargo} iron on home before transfer`).toBeGreaterThanOrEqual(cargoQty);

    const cargoRes = await app.inject({
      method: 'POST',
      url: '/cargo/transfer',
      headers: { authorization: `Bearer ${token}` },
      body: {
        shipId: scout.id,
        targetPlanetId: colonyPlanetId,
        resources: [{ resourceId: 'iron', amount: cargoQty }],
      },
    });
    expect(cargoRes.statusCode, `${AREA.cargo} POST /cargo/transfer`).toBe(200);

    const ironAfterCargo = await planetAmount(homePlanetId, 'iron');
    expect(
      ironAfterCargo,
      `${AREA.cargo} iron on home must drop by cargo amount only (no duplicate booking vs planet stock)`,
    ).toBeCloseTo(ironBeforeCargo - cargoQty, 4);

    const carbonMeta = await db.query.resources.findFirst({
      where: eq(resources.id, 'carbon'),
    });
    const carbonTier = carbonMeta?.tier ?? 1;

    const sellQty = 100;
    const carbonBeforeSell = await planetAmount(homePlanetId, 'carbon');
    expect(carbonBeforeSell, `${AREA.market} carbon on home before NPC sell`).toBeGreaterThanOrEqual(sellQty);

    const quote = calculateNpcMarketQuote({
      resourceId: 'carbon',
      tier: carbonTier,
      stockRatio: 1,
    });

    const marketRes = await app.inject({
      method: 'POST',
      url: '/market/orders',
      headers: { authorization: `Bearer ${token}` },
      body: {
        planetId: homePlanetId,
        side: 'sell',
        resourceId: 'carbon',
        quantity: sellQty,
        expectedUnitPrice: quote.sellPrice,
      },
    });
    expect(marketRes.statusCode, `${AREA.market} POST /market/orders (NPC sell)`).toBe(200);

    const carbonAfterSell = await planetAmount(homePlanetId, 'carbon');
    expect(
      carbonAfterSell,
      `${AREA.market} carbon must decrease by sold qty (stock not duplicated with order escrow)`,
    ).toBeCloseTo(carbonBeforeSell - sellQty, 4);

    const latestColony = await db.query.colonies.findFirst({
      where: eq(colonies.ownerId, userId),
      orderBy: desc(colonies.foundedAt),
    });
    expect(latestColony?.planetId, `${AREA.colonization} colony record`).toBe(colonyPlanetId);
  });
});
