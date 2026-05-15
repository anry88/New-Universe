import { beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { planets, ships, systems, users } from '../../db/schema.js';
import { seedShipTypes } from '../../db/seed/ship-types.js';
import { refuelShip } from './refuel.js';

describe('refuelShip', () => {
  beforeAll(async () => {
    await seedShipTypes();
  });

  async function createPlanet() {
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
        tgUsername: `refuel_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        tgFirstName: 'Refuel',
      })
      .returning();

    const [system] = await db
      .insert(systems)
      .values({
        ownerId: user.id,
        isHome: false,
        sectorX: 0,
        sectorY: 0,
        sectorZ: 0,
        x: '0',
        y: '0',
        z: '0',
        name: `Refuel Test ${user.id}`,
        seed: Math.floor(Math.random() * 1_000_000),
      })
      .returning();

    const [planet] = await db
      .insert(planets)
      .values({
        systemId: system.id,
        name: `Refuel-${user.id.slice(0, 8)}`,
        biome: 'rocky',
        size: 6,
        slotCount: 6,
      })
      .returning();

    return { userId: user.id, planetId: planet.id };
  }

  async function spawnShip(args: {
    ownerId: string;
    planetId: string;
    typeId: string;
    fuel?: string;
    jumpFuel?: string;
    status?: string;
  }) {
    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: args.ownerId,
        typeId: args.typeId,
        locationPlanetId: args.planetId,
        status: args.status ?? 'idle',
        fuel: args.fuel ?? '0',
        jumpFuel: args.jumpFuel ?? '0',
      })
      .returning();
    return ship;
  }

  it('moves ordinary fuel and jump fuel from an idle refueler to an idle local ship', async () => {
    const fixture = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'refueler',
      fuel: '200',
      jumpFuel: '2',
    });
    const target = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'light_fighter',
      fuel: '20',
      jumpFuel: '0',
    });

    const result = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: target.id,
      fuel: 50,
      jumpFuel: 1,
    });

    expect(result.success).toBe(true);
    expect(Number(result.data!.targetShip.fuel)).toBe(70);
    expect(Number(result.data!.targetShip.jumpFuel)).toBe(1);
    expect(Number(result.data!.sourceShip.fuel)).toBe(150);
    expect(Number(result.data!.sourceShip.jumpFuel)).toBe(1);
  });

  it('rejects transfers that would overfill the target tank without changing balances', async () => {
    const fixture = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'refueler',
      fuel: '200',
    });
    const target = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'light_fighter',
      fuel: '90',
    });

    const result = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: target.id,
      fuel: 20,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('refuel_exceeds_tank');

    const unchanged = await db
      .select({ id: ships.id, fuel: ships.fuel })
      .from(ships)
      .where(inArray(ships.id, [source.id, target.id]));
    expect(Object.fromEntries(unchanged.map((ship) => [ship.id, Number(ship.fuel)]))).toEqual({
      [source.id]: 200,
      [target.id]: 90,
    });
  });

  it('serializes concurrent refuel requests so the source cannot be overdrawn', async () => {
    const fixture = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'refueler',
      fuel: '100',
    });
    const targetA = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'scout',
      fuel: '0',
    });
    const targetB = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'scout',
      fuel: '0',
    });

    const results = await Promise.all([
      refuelShip(fixture.userId, {
        sourceShipId: source.id,
        targetShipId: targetA.id,
        fuel: 80,
      }),
      refuelShip(fixture.userId, {
        sourceShipId: source.id,
        targetShipId: targetB.id,
        fuel: 80,
      }),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => result.code === 'refuel_source_insufficient')).toHaveLength(1);

    const rows = await db
      .select({ id: ships.id, fuel: ships.fuel })
      .from(ships)
      .where(inArray(ships.id, [source.id, targetA.id, targetB.id]));
    const fuelByShip = Object.fromEntries(rows.map((ship) => [ship.id, Number(ship.fuel)]));

    expect(fuelByShip[source.id]).toBe(20);
    expect([fuelByShip[targetA.id], fuelByShip[targetB.id]].sort((a, b) => a - b)).toEqual([
      0,
      80,
    ]);
  });

  it('requires both ships to be idle and docked on the same planet', async () => {
    const fixture = await createPlanet();
    const other = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'refueler',
      fuel: '100',
    });
    const movingTarget = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: 'scout',
      status: 'moving',
    });
    const remoteTarget = await spawnShip({
      ownerId: fixture.userId,
      planetId: other.planetId,
      typeId: 'scout',
    });

    const movingResult = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: movingTarget.id,
      fuel: 10,
    });
    const remoteResult = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: remoteTarget.id,
      fuel: 10,
    });

    expect(movingResult.code).toBe('refuel_ship_not_idle');
    expect(remoteResult.code).toBe('refuel_not_same_planet');
  });
});
