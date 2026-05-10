import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import { buildings, expeditions, planetResources, planets, ships, systems, users } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { syncTutorialProgress } from './service.js';
import { seedResources } from '../../db/seed/resources.js';
import { seedBuildingTypes } from '../../db/seed/building-types.js';
import { seedShipTypes } from '../../db/seed/ship-types.js';

describe('tutorial sync', () => {
  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE TABLE
        expeditions,
        colonies,
        ships,
        buildings,
        discovered_planets,
        discovered_systems,
        richness,
        notifications,
        planet_resources,
        planets,
        systems,
        users
      RESTART IDENTITY
      CASCADE
    `);
    await seedResources();
    await seedBuildingTypes();
    await seedShipTypes();
  });

  it('completes tutorial and applies reward once', async () => {
    const tgId = BigInt(Math.floor(Math.random() * 10_000_000) + 50_000_000);
    const [user] = await db
      .insert(users)
      .values({
        tgId,
        tgFirstName: 'Tutorial',
      })
      .returning();

    const [system] = await db
      .insert(systems)
      .values({
        ownerId: user.id,
        isHome: true,
        sectorX: 1,
        sectorY: 1,
        sectorZ: 1,
        x: '0.00',
        y: '0.00',
        z: '0.00',
        name: 'Home',
        seed: 123,
      })
      .returning();

    const [planet] = await db
      .insert(planets)
      .values({
        systemId: system.id,
        biome: 'rocky',
        size: 12,
        slotCount: 8,
        name: 'Prime',
      })
      .returning();

    await db.insert(planetResources).values([
      {
        planetId: planet.id,
        resourceId: 'iron',
        amount: '1000.0000',
        regenRate: '0.0000',
      },
      {
        planetId: planet.id,
        resourceId: 'water',
        amount: '1000.0000',
        regenRate: '0.0000',
      },
    ]);

    await db.insert(buildings).values([
      { planetId: planet.id, typeId: 'mine', level: 1, slotIndex: 0 },
      { planetId: planet.id, typeId: 'storage', level: 1, slotIndex: 1 },
    ]);

    const [scout] = await db
      .insert(ships)
      .values({
        ownerId: user.id,
        typeId: 'scout',
        locationPlanetId: planet.id,
      })
      .returning();

    await db.insert(expeditions).values({
      shipId: scout.id,
      type: 'scout',
      originPlanetId: planet.id,
      targetX: 1,
      targetY: 1,
      targetZ: 1,
      eta: new Date(Date.now() + 60_000),
    });

    const firstSync = await syncTutorialProgress(user.id);
    expect(firstSync.tutorialStepCompleted).toBe(4);
    expect(firstSync.tutorialCompletedAt).not.toBeNull();

    const [ironAfterFirst] = await db
      .select({ amount: planetResources.amount })
      .from(planetResources)
      .where(and(eq(planetResources.planetId, planet.id), eq(planetResources.resourceId, 'iron')));
    const [waterAfterFirst] = await db
      .select({ amount: planetResources.amount })
      .from(planetResources)
      .where(and(eq(planetResources.planetId, planet.id), eq(planetResources.resourceId, 'water')));

    expect(Number(ironAfterFirst.amount)).toBe(1200);
    expect(Number(waterAfterFirst.amount)).toBe(1100);

    await syncTutorialProgress(user.id);

    const [ironAfterSecond] = await db
      .select({ amount: planetResources.amount })
      .from(planetResources)
      .where(and(eq(planetResources.planetId, planet.id), eq(planetResources.resourceId, 'iron')));
    const [waterAfterSecond] = await db
      .select({ amount: planetResources.amount })
      .from(planetResources)
      .where(and(eq(planetResources.planetId, planet.id), eq(planetResources.resourceId, 'water')));

    expect(Number(ironAfterSecond.amount)).toBe(1200);
    expect(Number(waterAfterSecond.amount)).toBe(1100);
  });

  it('grants only step 1 rewards when only the mine milestone exists', async () => {
    const tgId = BigInt(Math.floor(Math.random() * 10_000_000) + 60_000_000);
    const [user] = await db
      .insert(users)
      .values({
        tgId,
        tgFirstName: 'Tutorial',
      })
      .returning();

    const [system] = await db
      .insert(systems)
      .values({
        ownerId: user.id,
        isHome: true,
        sectorX: 1,
        sectorY: 1,
        sectorZ: 1,
        x: '0.00',
        y: '0.00',
        z: '0.00',
        name: 'Home',
        seed: 456,
      })
      .returning();

    const [planet] = await db
      .insert(planets)
      .values({
        systemId: system.id,
        biome: 'rocky',
        size: 12,
        slotCount: 8,
        name: 'Prime',
      })
      .returning();

    await db.insert(planetResources).values([
      {
        planetId: planet.id,
        resourceId: 'iron',
        amount: '1000.0000',
        regenRate: '0.0000',
      },
      {
        planetId: planet.id,
        resourceId: 'water',
        amount: '1000.0000',
        regenRate: '0.0000',
      },
    ]);

    await db.insert(buildings).values({
      planetId: planet.id,
      typeId: 'mine',
      level: 1,
      slotIndex: 0,
    });

    const progress = await syncTutorialProgress(user.id);
    expect(progress.tutorialStepCompleted).toBe(1);
    expect(progress.tutorialCompletedAt).toBeNull();

    const [ironRow] = await db
      .select({ amount: planetResources.amount })
      .from(planetResources)
      .where(and(eq(planetResources.planetId, planet.id), eq(planetResources.resourceId, 'iron')));
    const [waterRow] = await db
      .select({ amount: planetResources.amount })
      .from(planetResources)
      .where(and(eq(planetResources.planetId, planet.id), eq(planetResources.resourceId, 'water')));

    expect(Number(ironRow.amount)).toBe(1010);
    expect(Number(waterRow.amount)).toBe(1015);
  });
});
