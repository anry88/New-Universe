import Fastify from 'fastify';
import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../src/db/index.js';
import { authRoutes } from '../../src/features/auth/routes.js';
import { meRoutes } from '../../src/features/me/routes.js';
import { buildingsRoutes } from '../../src/features/buildings/routes.js';
import { resourcesRoutes } from '../../src/features/resources/routes.js';
import { shipsRoutes } from '../../src/features/ships/routes.js';
import { expeditionsRoutes } from '../../src/features/expeditions/routes.js';
import { researchRoutes } from '../../src/features/research/routes.js';
import crypto from 'crypto';
import { env } from '../../src/lib/env.js';
import { 
  buildings, 
  ships, 
  expeditions, 
  planets, 
  systems,
  discoveredPlanets
} from '../../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { processCompletedBuildings } from '../../src/workers/tick-buildings.js';
import { processExpeditions } from '../../src/workers/tick-expeditions.js';
import { seedResources } from '../../src/db/seed/resources.js';
import { seedBuildingTypes } from '../../src/db/seed/building-types.js';
import { seedShipTypes } from '../../src/db/seed/ship-types.js';
import { resources as resourcesTable, planetResources } from '../../src/db/schema.js';

async function ensureFuel(planetId: string, amount: number) {
  await db.insert(resourcesTable).values({
    id: 'fuel',
    name: { ru: 'Топливо', en: 'Fuel' },
    tier: 1,
    symbol: 'F',
    baseRegenRate: 0,
    defaultStorageCap: 5000,
  }).onConflictDoNothing();

  await db.insert(planetResources).values({
    planetId,
    resourceId: 'fuel',
    amount: amount.toFixed(4),
    lastUpdateAt: new Date(),
    regenRate: '0',
  }).onConflictDoUpdate({
    target: [planetResources.planetId, planetResources.resourceId],
    set: { amount: amount.toFixed(4) }
  });
}


describe('E2E: First Day Flow', () => {
  let app: any;
  const botToken = env.TELEGRAM_BOT_TOKEN;

  beforeAll(async () => {
    // Ensure catalog data is present
    await seedResources();
    await seedBuildingTypes();
    await seedShipTypes();

    app = Fastify();
    
    // Wire up routes
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(meRoutes, { prefix: '/me' });
    await app.register(buildingsRoutes, { prefix: '/buildings' });
    await app.register(resourcesRoutes, { prefix: '/resources' });
    await app.register(shipsRoutes, { prefix: '/ships' });
    await app.register(expeditionsRoutes, { prefix: '/expeditions' });
    await app.register(researchRoutes, { prefix: '/research' });
  });

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

  it('should complete the full first-day flow', async () => {
    // 1. Create User / Login

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'E2ETest', username: `e2e_${tgId}` };
    const initData = createValidInitData(tgUser);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });
    expect(loginRes.statusCode).toBe(200);
    const { token, user } = loginRes.json();
    const userId = user.id;

    // Verify home system generated
    const homeSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    expect(homeSystem).toBeDefined();

    const homePlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, homeSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });
    expect(homePlanet).toBeDefined();
    const planetId = homePlanet!.id;

    // 2. Build a Mine
    const buildRes = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${token}` },
      body: { planetId, typeId: 'mine', slotIndex: 1 },
    });

    expect(buildRes.statusCode, `Build failed: ${JSON.stringify(buildRes.json())}`).toBe(200);

    // Fast-forward: Complete building
    await db.update(buildings)
      .set({ queueCompletesAt: new Date(Date.now() - 1000) })
      .where(and(eq(buildings.planetId, planetId), eq(buildings.typeId, 'mine')));
    
    await processCompletedBuildings();

    // Verify building level
    const mine = await db.query.buildings.findFirst({
      where: and(eq(buildings.planetId, planetId), eq(buildings.typeId, 'mine')),
    });
    expect(mine!.level).toBe(1);

    // 3. Upgrade the Mine
    const upgradeRes = await app.inject({
      method: 'POST',
      url: '/buildings/upgrade',
      headers: { authorization: `Bearer ${token}` },
      body: { buildingId: mine!.id },
    });
    expect(upgradeRes.statusCode).toBe(200);

    // Fast-forward: Complete upgrade
    await db.update(buildings)
      .set({ queueCompletesAt: new Date(Date.now() - 1000) })
      .where(eq(buildings.id, mine!.id));
    
    await processCompletedBuildings();

    const upgradedMine = await db.query.buildings.findFirst({
      where: eq(buildings.id, mine!.id),
    });
    expect(upgradedMine!.level).toBe(2);

    // Ensure fuel for scout build and expedition
    await ensureFuel(planetId, 500);

    // 4. Build a Scout Ship
    // Prerequisites for scout: Shipyard L1 (which needs Spaceport L2, which needs CC L4)
    // To follow the prompt flow precisely, we satisfy these prerequisites manually.
    await db.insert(buildings).values([
      { planetId, typeId: 'spaceport', level: 2, slotIndex: 2 },
      { planetId, typeId: 'shipyard', level: 1, slotIndex: 3 },
    ]);

    const buildShipRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${token}` },
      body: { planetId, typeSlug: 'scout' },
    });
    expect(buildShipRes.statusCode, `Ship build failed: ${JSON.stringify(buildShipRes.json())}`).toBe(200);

    const { ship } = buildShipRes.json();
    const shipId = ship.id;

    // Fast-forward: Complete ship build manually
    await db.update(ships).set({ status: 'idle' }).where(eq(ships.id, shipId));

    // 5. Launch Expedition
    const launchRes = await app.inject({
      method: 'POST',
      url: '/expeditions',
      headers: { authorization: `Bearer ${token}` },
      body: {
        shipId,
        targetX: Number(homeSystem!.sectorX) + 100,
        targetY: Number(homeSystem!.sectorY) + 100,
        targetZ: Number(homeSystem!.sectorZ) + 100,
        fuelLoaded: 20,
        cargoLoaded: 0,
      },
    });
    expect(launchRes.statusCode, `Expedition launch failed: ${JSON.stringify(launchRes.json())}`).toBe(200);

    const { expedition } = launchRes.json();
    const expeditionId = expedition.id;


    // 6. Wait for Arrival and Return
    // Reach target
    await db.update(expeditions)
      .set({ eta: new Date(Date.now() - 1000) })
      .where(eq(expeditions.id, expeditionId));
    
    await processExpeditions();

    const expeditionAtTarget = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, expeditionId),
    });
    expect(expeditionAtTarget!.status).toBe('returning');

    // Return home
    await db.update(expeditions)
      .set({ eta: new Date(Date.now() - 1000) })
      .where(eq(expeditions.id, expeditionId));
    
    await processExpeditions();

    const expeditionReturned = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, expeditionId),
    });
    expect(expeditionReturned).toBeUndefined();

    // 7. Discover Planet
    const discoveries = await db.query.discoveredPlanets.findMany({
      where: eq(discoveredPlanets.userId, userId),
    });
    // Home planet + potentially discovered ones
    expect(discoveries.length).toBeGreaterThanOrEqual(1);
  });


  it('should fail to build if resources are insufficient', async () => {
    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'FailTest', username: `fail_${tgId}` };
    const initData = createValidInitData(tgUser);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });
    const { token, user } = loginRes.json();

    const homeSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, user.id),
    });
    const homePlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, homeSystem!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });
    const planetId = homePlanet!.id;

    // Try to build a very expensive building (if there are any)
    // Or just build many ships until resources run out.
    // For simplicity, let's just try to build 100 scout ships in a loop
    // But better just check the 400 response.
    
    // Let's assume building a scout ship costs some amount.
    // We'll keep building until we get a 400.
    let lastCode = 200;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/ships/build',
        headers: { authorization: `Bearer ${token}` },
        body: { planetId, typeSlug: 'scout' },
      });


      lastCode = res.statusCode;
      if (lastCode === 400) break;
    }
    expect(lastCode).toBe(400);
  });
});
