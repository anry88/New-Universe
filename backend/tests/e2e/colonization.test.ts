import Fastify from 'fastify';
import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../src/db/index.js';
import { authRoutes } from '../../src/features/auth/routes.js';
import crypto from 'crypto';
import { env } from '../../src/lib/env.js';
import { ships, planets, systems, planetResources as planetResourcesTable, researchProgress, colonies, discoveredPlanets } from '../../src/db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { seedResources } from '../../src/db/seed/resources.js';
import { seedBuildingTypes } from '../../src/db/seed/building-types.js';
import { seedShipTypes } from '../../src/db/seed/ship-types.js';
import { meRoutes } from '../../src/features/me/routes.js';
import { buildingsRoutes } from '../../src/features/buildings/routes.js';
import { resourcesRoutes } from '../../src/features/resources/routes.js';
import { shipsRoutes } from '../../src/features/ships/routes.js';
import { expeditionsRoutes } from '../../src/features/expeditions/routes.js';
import { researchRoutes } from '../../src/features/research/routes.js';
import { coloniesRoutes } from '../../src/routes/colonies.js';
import { cargoRoutes } from '../../src/routes/cargo.js';

describe('E2E: Colonization Flow', () => {
  let app: any;
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
  });

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

  it('should pass minimal test', async () => {
    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: 'ColonyTest', username: `colony_${tgId}` };
    const initData = createValidInitData(tgUser);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });
    expect(loginRes.statusCode).toBe(200);
    const { token, user: loginUser } = loginRes.json();
    const userId = loginUser.id;

    // 2. Satisfy Research Prerequisites
    await db.insert(researchProgress).values([
      { userId, branch: 'engineering', level: 5 },
      { userId, branch: 'logistics', level: 1 },
    ]);

    // 3. Setup Target Planet (within 2000 range)
    const [targetSystem] = await db.insert(systems).values({
      sectorX: 1,
      sectorY: 1,
      sectorZ: 1,
      x: '1000.00',
      y: '1000.00',
      z: '1000.00',
      name: 'Far System',
      seed: 999,
    }).returning();

    const [targetPlanet] = await db.insert(planets).values({
      systemId: targetSystem.id,
      biome: 'green',
      size: 15,
      slotCount: 12,
      name: 'Far Planet',
    }).returning();

    // Discover it
    await db.insert(discoveredPlanets).values({
      userId,
      planetId: targetPlanet.id,
    });

    // 4. Setup Colonizer Ship
    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'colonizer',
      locationPlanetId: targetPlanet.id,
      status: 'idle',
    }).returning();
    // 5. Ensure resources on home planet and reset coordinates for deterministic distance check
    await db.update(systems)
      .set({ x: '0.00', y: '0.00', z: '0.00' })
      .where(and(eq(systems.ownerId, userId), eq(systems.isHome, true)));

    const [homeSystem] = await db.select().from(systems).where(and(eq(systems.ownerId, userId), eq(systems.isHome, true))).limit(1);
    const [homePlanet] = await db.select().from(planets).where(eq(planets.systemId, homeSystem.id)).limit(1);

    const costs = [
      { resourceId: 'iron', amount: '20000' },
      { resourceId: 'water', amount: '10000' },
      { resourceId: 'carbon', amount: '5000' },
      { resourceId: 'silicon', amount: '2000' }
    ];

    for (const cost of costs) {
      await db.insert(planetResourcesTable).values({
        planetId: homePlanet.id,
        resourceId: cost.resourceId,
        amount: cost.amount,
        regenRate: '0.0000'
      }).onConflictDoUpdate({
        target: [planetResourcesTable.planetId, planetResourcesTable.resourceId],
        set: { amount: cost.amount }
      });
    }

    // 6. Successful colonization
    const foundRes = await app.inject({
      method: 'POST',
      url: '/colonies/found',
      headers: { authorization: `Bearer ${token}` },
      body: { shipId: ship.id, planetId: targetPlanet.id },
    });
    expect(foundRes.statusCode, `Found colony failed: ${JSON.stringify(foundRes.json())}`).toBe(200);

    // 7. Test Blocked Attempt (Cooldown)
    const [secondTargetSystem] = await db.insert(systems).values({
      sectorX: 2,
      sectorY: 2,
      sectorZ: 2,
      x: '1500.00',
      y: '1500.00',
      z: '1500.00',
      name: 'Further System',
      seed: 888,
    }).returning();

    const [secondTargetPlanet] = await db.insert(planets).values({
      systemId: secondTargetSystem.id,
      biome: 'rocky',
      size: 10,
      slotCount: 8,
      name: 'Further Planet',
    }).returning();

    await db.insert(discoveredPlanets).values({
      userId,
      planetId: secondTargetPlanet.id,
    });

    const [secondShip] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'colonizer',
      locationPlanetId: secondTargetPlanet.id,
      status: 'idle',
    }).returning();

    const cooldownRes = await app.inject({
      method: 'POST',
      url: '/colonies/found',
      headers: { authorization: `Bearer ${token}` },
      body: { shipId: secondShip.id, planetId: secondTargetPlanet.id },
    });
    expect(cooldownRes.statusCode).toBe(400);
    expect(cooldownRes.json().message).toContain('cooldown');

    // 8. Test Blocked Attempt (Capacity)
    // Manually expire cooldown
    const [latestColony] = await db.select().from(colonies).where(eq(colonies.ownerId, userId)).orderBy(desc(colonies.foundedAt)).limit(1);
    await db.update(colonies)
      .set({ foundedAt: new Date(Date.now() - 3601 * 1000) })
      .where(eq(colonies.id, latestColony.id));

    // Try to found 2nd colony (Logistics L1 allows total 2, including home system?)
    // Wait, home system doesn't count as a colony in the 'colonies' table.
    // Base: 1, Logistics L1: +1. Total allowed: 2.
    // We already have 1. 2nd should pass.
    // 3rd should fail.
    
    // Found 2nd
    const secondFoundRes = await app.inject({
      method: 'POST',
      url: '/colonies/found',
      headers: { authorization: `Bearer ${token}` },
      body: { shipId: secondShip.id, planetId: secondTargetPlanet.id },
    });
    expect(secondFoundRes.statusCode).toBe(200);

    // Try 3rd (fail due to capacity)
    const [thirdTargetSystem] = await db.insert(systems).values({
      sectorX: 3,
      sectorY: 3,
      sectorZ: 3,
      x: '500.00',
      y: '500.00',
      z: '500.00',
      name: 'Third System',
      seed: 777,
    }).returning();

    const [thirdTargetPlanet] = await db.insert(planets).values({
      systemId: thirdTargetSystem.id,
      biome: 'ice',
      size: 12,
      slotCount: 10,
      name: 'Third Planet',
    }).returning();

    await db.insert(discoveredPlanets).values({
      userId,
      planetId: thirdTargetPlanet.id,
    });

    const [thirdShip] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'colonizer',
      locationPlanetId: thirdTargetPlanet.id,
      status: 'idle',
    }).returning();

    const capacityRes = await app.inject({
      method: 'POST',
      url: '/colonies/found',
      headers: { authorization: `Bearer ${token}` },
      body: { shipId: thirdShip.id, planetId: thirdTargetPlanet.id },
    });
    expect(capacityRes.statusCode).toBe(400);
    expect(capacityRes.json().message).toContain('limit');

    // 9. Test First Cargo Transfer
    // Home already has iron from step 5, but let's reset it to be sure
    await db.insert(planetResourcesTable).values({
      planetId: homePlanet.id,
      resourceId: 'iron',
      amount: '1000.0000',
      regenRate: '0.0000'
    }).onConflictDoUpdate({
      target: [planetResourcesTable.planetId, planetResourcesTable.resourceId],
      set: { amount: '1000.0000' }
    });

    const [cargoShip] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'cargo_light',
      locationPlanetId: homePlanet.id,
      status: 'idle',
    }).returning();

    const transferRes = await app.inject({
      method: 'POST',
      url: '/cargo/transfer',
      headers: { authorization: `Bearer ${token}` },
      body: {
        shipId: cargoShip.id,
        targetPlanetId: targetPlanet.id,
        resources: [{ resourceId: 'iron', amount: 100 }]
      }
    });
    expect(transferRes.statusCode).toBe(200);

    // Verify iron removed from home
    const [homeIron] = await db.select().from(planetResourcesTable).where(and(eq(planetResourcesTable.planetId, homePlanet.id), eq(planetResourcesTable.resourceId, 'iron'))).limit(1);
    expect(Number(homeIron.amount)).toBe(900);

    // Verify ship has iron
    const [shipWithCargo] = await db.select().from(ships).where(eq(ships.id, cargoShip.id)).limit(1);
    expect(shipWithCargo.cargoJson).toEqual({ iron: 100 });
  });
});
