/**
 * Combat regression gate (task P3-COM-012):
 * Covers Military Shipyard construction, combat ship production, fueling,
 * ship combat, bombing, and colonization rules (hostile building block).
 */
import Fastify from 'fastify';
import crypto from 'crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import {
  buildings,
  colonies,
  discoveredPlanets,
  planetResources,
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
import { seedResources } from '../../src/db/seed/resources.js';
import { seedBuildingTypes } from '../../src/db/seed/building-types.js';
import { seedShipTypes } from '../../src/db/seed/ship-types.js';
import { seedResearchCatalog } from '../../src/db/seed/research.js';
import { env } from '../../src/lib/env.js';
import { syncReadyShips } from '../../src/features/ships/build.js';
import { processDueCombat } from '../../src/features/combat/tick-combat.js';
import { checkColonizationGates } from '../../src/features/colonies/colonization-rules.js';

const AREA = {
  setup: '[Setup]',
  military: '[Military]',
  combat: '[Combat]',
  bombing: '[Bombing]',
  colonization: '[Colonization]',
} as const;

describe('Combat regression suite', () => {
  let app: ReturnType<typeof Fastify>;
  const botToken = env.TELEGRAM_BOT_TOKEN;

  beforeAll(async () => {
    await seedResources();
    await seedResearchCatalog();
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

  async function loginUser(label: string) {
    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: label, username: `${label.toLowerCase()}_${tgId}` };
    const initData = createValidInitData(tgUser);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      headers: { 'x-telegram-init-data': initData },
    });
    const { token, user } = loginRes.json();
    
    const homeSystem = await db.query.systems.findFirst({
      where: and(eq(systems.ownerId, user.id), eq(systems.isHome, true)),
      with: { planets: { orderBy: (p, { asc }) => asc(p.name) } },
    });
    
    return { token, userId: user.id as string, homePlanetId: homeSystem!.planets[0].id, systemId: homeSystem!.id };
  }

  async function giveResources(planetId: string, amounts: Record<string, number>) {
    console.log(`Giving resources to planet ${planetId}...`);
    for (const [rid, amount] of Object.entries(amounts)) {
      console.log(`- ${rid}: ${amount}`);
      await db
        .insert(planetResources)
        .values({
          planetId,
          resourceId: rid,
          amount: amount.toString(),
          regenRate: '0',
        })
        .onConflictDoUpdate({
          target: [planetResources.planetId, planetResources.resourceId],
          set: { amount: amount.toString() },
        });
    }
  }

  it('End-to-end combat loop: build → produce → fuel → fight → bomb → colonize', async () => {
    // 1. Setup Attacker and Victim
    console.log('Logging in users...');
    const attacker = await loginUser('Attacker');
    const victim = await loginUser('Victim');
    
    // Set fixed close coordinates for fuel validation
    await db.update(systems).set({ sectorX: 0, sectorY: 0, sectorZ: 0 }).where(eq(systems.id, attacker.systemId));
    await db.update(systems).set({ sectorX: 1, sectorY: 0, sectorZ: 0 }).where(eq(systems.id, victim.systemId));

    console.log('Users logged in:', { 
      attacker: { id: attacker.userId, planet: attacker.homePlanetId }, 
      victim: { id: victim.userId, planet: victim.homePlanetId } 
    });

    // 2. Prepare Attacker: Research and Resources for Military Shipyard
    console.log('Setting up research...');
    await db.insert(researchProgress).values([
      { userId: attacker.userId, branch: 'weapons', level: 2 },
      { userId: attacker.userId, branch: 'engineering', level: 2 },
    ]).onConflictDoUpdate({
      target: [researchProgress.userId, researchProgress.branch],
      set: { level: 2 },
    });
    console.log('Research setup done.');

    console.log('Giving resources...');
    await giveResources(attacker.homePlanetId, {
      iron: 5000, silicon: 5000, carbon: 5000, steel: 5000, 
      military_alloy: 2000, military_composite: 1000, electronics: 1000,
      fuel: 2000
    });

    // Build prerequisites for Military Shipyard (Shipyard level 2)
    console.log('Building spaceport...');
    const [spaceport] = await db.insert(buildings).values({
      planetId: attacker.homePlanetId,
      typeId: 'spaceport',
      level: 2, // Need capacity for 2 ships
      slotIndex: 1,
    }).returning();
    console.log('Spaceport built:', spaceport.id);
    
    console.log('Building shipyard...');
    const [shipyard] = await db.insert(buildings).values({
      planetId: attacker.homePlanetId,
      typeId: 'shipyard',
      level: 2,
      slotIndex: 2,
    }).returning();
    console.log('Shipyard built:', shipyard.id);

    // 3. Build Military Shipyard
    console.log('Starting Military Shipyard build via route...');
    const buildRes = await app.inject({
      method: 'POST',
      url: '/buildings/build',
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: { planetId: attacker.homePlanetId, typeId: 'military_shipyard', slotIndex: 3 },
    });
    
    if (buildRes.statusCode !== 200) {
      console.error('Military Shipyard build FAILED:', buildRes.json());
    }
    expect(buildRes.statusCode, `${AREA.military} build Military Shipyard`).toBe(200);
    
    const milShipyardId = buildRes.json().queueItem.id;
    await db.update(buildings).set({ 
      queueAction: null,
      queueCompletesAt: null,
      level: 2 
    }).where(eq(buildings.id, milShipyardId));
    // No need to sync if we manually finalized

    // 4. Produce Combat Ships (Fighter and Bomber)
    console.log('Producing Light Fighter...');
    const fighterRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: { planetId: attacker.homePlanetId, typeSlug: 'light_fighter' },
    });
    if (fighterRes.statusCode !== 200) {
      console.error('Fighter build FAILED:', fighterRes.json());
    }
    expect(fighterRes.statusCode, `${AREA.military} produce Light Fighter`).toBe(200);
    
    // Fast-forward fighter production to free the queue
    await db.update(ships).set({ queueCompletesAt: new Date(0) }).where(and(eq(ships.ownerId, attacker.userId), eq(ships.status, 'building')));
    await syncReadyShips(attacker.userId, { skipNotifications: true });

    console.log('Producing Light Bomber...');
    const bomberRes = await app.inject({
      method: 'POST',
      url: '/ships/build',
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: { planetId: attacker.homePlanetId, typeSlug: 'light_bomber' },
    });
    if (bomberRes.statusCode !== 200) {
      console.error('Bomber build FAILED:', bomberRes.json());
    }
    expect(bomberRes.statusCode, `${AREA.military} produce Light Bomber`).toBe(200);

    const fighterId = fighterRes.json().ship.id;
    const bomberId = bomberRes.json().ship.id;

    // Fast-forward bomber production
    await db.update(ships).set({ queueCompletesAt: new Date(0) }).where(and(eq(ships.ownerId, attacker.userId), eq(ships.status, 'building')));
    await syncReadyShips(attacker.userId, { skipNotifications: true });

    // 5. Fueling / Refueling (via Launch Expedition)
    // We'll move ships to Victim's system.
    
    const launchRes = await app.inject({
      method: 'POST',
      url: '/expeditions/',
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: {
        shipId: fighterId,
        routeMode: 'local',
        targetX: 1,
        targetY: 0,
        targetZ: 0,
        fuelLoaded: 100, // Load extra fuel from planet
        cargoLoaded: 0,
      },
    });
    if (launchRes.statusCode !== 200) {
      console.error('Fighter launch FAILED:', launchRes.json());
    }
    expect(launchRes.statusCode, `${AREA.military} launch Fighter with fuel`).toBe(200);
    expect(Number(launchRes.json().ship.fuel), `${AREA.military} ship fuel after loading`).toBeGreaterThan(0);

    const launchBomberRes = await app.inject({
      method: 'POST',
      url: '/expeditions/',
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: {
        planetId: attacker.homePlanetId,
        shipId: bomberId,
        targetX: 1,
        targetY: 0,
        targetZ: 0,
        fuelLoaded: 100,
        cargoLoaded: 0,
      },
    });
    if (launchBomberRes.statusCode !== 200) {
      console.error('Bomber launch FAILED:', launchBomberRes.json());
    }
    expect(launchBomberRes.statusCode, `${AREA.military} launch Bomber with fuel`).toBe(200);

    // Teleport ships to Victim's planet for combat/bombing tests (bypass flight time)
    await db.update(ships).set({ locationPlanetId: victim.homePlanetId, status: 'idle' }).where(and(eq(ships.ownerId, attacker.userId)));

    // 6. Ship Combat
    // 6. Ship Combat
    // Victim spawns a scout
    const [victimShip] = await db.insert(ships).values({
      ownerId: victim.userId,
      typeId: 'scout',
      locationPlanetId: victim.homePlanetId,
      status: 'idle',
      hp: 40,
    }).returning();

    // 7. Bombing Hostile Buildings - ADD MINE BEFORE COMBAT
    const [victimMine] = await db.insert(buildings).values({
      planetId: victim.homePlanetId,
      typeId: 'mine',
      level: 1,
      slotIndex: 5,
      hp: 1000,
    }).returning();

    const t0 = new Date('2026-08-01T00:00:00Z');
    await processDueCombat({ now: t0, skipNotifications: true }); // Stamp initial contacts

    // Combat damage is capped per tick and long gaps are treated as
    // re-engagements, so this regression advances at the worker cadence.
    let victimDestroyed = false;
    for (const seconds of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
      const combatRes = await processDueCombat({
        now: new Date(t0.getTime() + seconds * 1000),
        skipNotifications: true,
      });
      victimDestroyed ||= combatRes.destroyed.includes(victimShip.id);
    }
    expect(victimDestroyed, `${AREA.combat} Victim ship destroyed`).toBe(true);
    
    const mineAfter = await db.query.buildings.findFirst({ where: eq(buildings.id, victimMine.id) });
    const ccAfter = await db.query.buildings.findFirst({ 
      where: and(eq(buildings.planetId, victim.homePlanetId), eq(buildings.typeId, 'command_center')) 
    });
    
    expect(mineAfter, `${AREA.bombing} Mine should be destroyed/deleted`).toBeUndefined();
    expect(ccAfter, `${AREA.bombing} CC should be destroyed (deleted/wiped)`).toBeUndefined();

    // 8. Blocked Colonization
    await db.insert(discoveredPlanets).values({ userId: attacker.userId, planetId: victim.homePlanetId }).onConflictDoNothing();
    
    const colBlocked = await checkColonizationGates(attacker.userId, victim.homePlanetId, { enforceDistance: false });
    expect(colBlocked.allowed, `${AREA.colonization} Colonization blocked`).toBe(false);
    // On a home planet, it might be blocked by 'colony_protected_home' or 'colony_blocked_hostile_buildings'
    expect(['colony_blocked_hostile_buildings', 'colony_protected_home'], `${AREA.colonization} Block code check`).toContain(colBlocked.code);

    // 9. Unblocked Colonization (after wiping buildings)
    // Destroy all buildings on victim planet
    await db.delete(buildings).where(eq(buildings.planetId, victim.homePlanetId));
    await db.delete(colonies).where(eq(colonies.planetId, victim.homePlanetId));

    const colUnblocked = await checkColonizationGates(attacker.userId, victim.homePlanetId, { enforceDistance: false });
    // It might still be blocked by research, but not by hostile buildings anymore
    expect(colUnblocked.code, `${AREA.colonization} Blocked by research, not buildings`).not.toBe('colony_blocked_hostile_buildings');
  });
});
