import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../db/index.js';
import { processArriveCargo } from '../../workers/cargo-routes.js';
import {
  users,
  planets,
  systems,
  ships,
  planetResources,
  expeditions,
  colonies,
  notifications,
} from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

describe('Cargo Route Worker', () => {
  let userId: string;
  let originPlanetId: string;
  let targetPlanetId: string;
  let cargoShipId: string;

  beforeAll(async () => {
    // 1. Setup user
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'WorkerTest' + Math.random(),
    }).returning();
    userId = user.id;

    // 2. Setup systems and planets
    const [system] = await db.insert(systems).values({
      ownerId: userId,
      isHome: true,
      sectorX: Math.floor(Math.random() * 100),
      sectorY: Math.floor(Math.random() * 100),
      sectorZ: Math.floor(Math.random() * 100),
      name: 'Origin System',
      seed: 123,
    }).returning();

    const [originPlanet] = await db.insert(planets).values({
      systemId: system.id,
      biome: 'rocky',
      size: 10,
      slotCount: 8,
      name: 'Origin Planet',
    }).returning();
    originPlanetId = originPlanet.id;

    const [targetPlanet] = await db.insert(planets).values({
      systemId: system.id,
      biome: 'green',
      size: 10,
      slotCount: 8,
      name: 'Target Planet',
    }).returning();
    targetPlanetId = targetPlanet.id;

    await db.insert(colonies).values([
        { ownerId: userId, planetId: originPlanetId },
        { ownerId: userId, planetId: targetPlanetId },
    ]);

    // 3. Setup resources
    await db.insert(planetResources).values([
      { planetId: originPlanetId, resourceId: 'iron', amount: '1000', regenRate: '0' },
      { planetId: targetPlanetId, resourceId: 'iron', amount: '100', regenRate: '0' },
    ]);

    // 4. Setup ship
    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'scout',
      locationPlanetId: originPlanetId,
      status: 'moving',
      cargoJson: { iron: 50 },
    }).returning();
    cargoShipId = ship.id;
  });

  it('successfully processes arrive_cargo job', async () => {
    // 1. Create expedition
    const [expedition] = await db.insert(expeditions).values({
      shipId: cargoShipId,
      type: 'cargo_transfer',
      originPlanetId: originPlanetId,
      targetPlanetId: targetPlanetId,
      targetX: 1,
      targetY: 1,
      targetZ: 1,
      status: 'in_flight',
      eta: new Date(),
      result: {
        resources: [{ resourceId: 'iron', amount: 50 }],
      },
    }).returning();

    // 2. Run worker process function
    await processArriveCargo({
      id: 'test-job',
      data: {
        expeditionId: expedition.id,
        shipId: cargoShipId,
      },
    });

    // 3. Verify target planet resources
    const [targetIron] = await db
      .select()
      .from(planetResources)
      .where(and(eq(planetResources.planetId, targetPlanetId), eq(planetResources.resourceId, 'iron')))
      .limit(1);
    
    // 100 initial + 50 delivered = 150
    expect(Number(targetIron.amount)).toBe(150);

    // 4. Verify expedition status
    const [updatedExpedition] = await db
      .select()
      .from(expeditions)
      .where(eq(expeditions.id, expedition.id))
      .limit(1);
    expect(updatedExpedition.status).toBe('completed');
    expect(updatedExpedition.returnedAt).not.toBeNull();

    // 5. Verify ship status and location
    const [updatedShip] = await db
      .select()
      .from(ships)
      .where(eq(ships.id, cargoShipId))
      .limit(1);
    expect(updatedShip.status).toBe('idle');
    expect(updatedShip.locationPlanetId).toBe(targetPlanetId);
    expect(updatedShip.cargoJson).toEqual({});

    // 6. Verify notification
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(1);
    expect(notification.type).toBe('cargo_transfer_delivered');
    expect(notification.payload).toMatchObject({
      expeditionId: expedition.id,
      shipId: cargoShipId,
      targetPlanetId: targetPlanetId,
    });
  });

  it('is idempotent when run repeatedly', async () => {
    // We reuse the completed expedition from previous test
    const [expedition] = await db
      .select()
      .from(expeditions)
      .where(and(eq(expeditions.shipId, cargoShipId), eq(expeditions.status, 'completed')))
      .limit(1);

    // Run again
    await processArriveCargo({
      id: 'test-job-retry',
      data: {
        expeditionId: expedition.id,
        shipId: cargoShipId,
      },
    });

    // Verify resources haven't increased again
    const [targetIron] = await db
      .select()
      .from(planetResources)
      .where(and(eq(planetResources.planetId, targetPlanetId), eq(planetResources.resourceId, 'iron')))
      .limit(1);
    
    // Should still be 150
    expect(Number(targetIron.amount)).toBe(150);
  });
});
