import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../db/index.js';
import { launchCargoTransfer } from './cargo-transfer.js';
import { users, planets, systems, ships, planetResources, colonies, researchProgress, buildings } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { seedShipTypes } from '../../db/seed/ship-types.js';
import { seedBuildingTypes } from '../../db/seed/building-types.js';
import { seedResources } from '../../db/seed/resources.js';
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting.js';

describe('cargoTransfer', () => {
  let userId: string;
  let originPlanetId: string;
  let targetPlanetId: string;
  let capitalPlanetId: string;
  let cargoShipId: string;

  beforeAll(async () => {
    await seedResources();
    await seedBuildingTypes();
    await seedShipTypes();

    // Setup test user
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1000000000)),
      tgUsername: 'CargoTest' + Math.random(),
    }).returning();
    userId = user.id;

    await db
      .insert(researchProgress)
      .values([
        { userId, branch: 'logistics', level: 1 },
        { userId, branch: 'jump_drive', level: 1 },
      ])
      .onConflictDoUpdate({
        target: [researchProgress.userId, researchProgress.branch],
        set: { level: 1 },
      });

    // Setup origin system and planet
    const [originSystem] = await db.insert(systems).values({
      ownerId: userId,
      isHome: true,
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      x: '0.00',
      y: '0.00',
      z: '0.00',
      name: 'Origin System',
      seed: 111,
    }).returning();

    const [originPlanet] = await db.insert(planets).values({
      systemId: originSystem.id,
      biome: 'rocky',
      size: 10,
      slotCount: 8,
      name: 'Origin Planet',
    }).returning();
    originPlanetId = originPlanet.id;

    await db.insert(colonies).values({
      ownerId: userId,
      planetId: originPlanetId,
    });

    const [capitalPlanet] = await db.insert(planets).values({
      systemId: originSystem.id,
      biome: 'green',
      size: 10,
      slotCount: 8,
      name: 'Capital Planet',
    }).returning();
    capitalPlanetId = capitalPlanet.id;

    await db.insert(buildings).values({
      planetId: capitalPlanetId,
      typeId: 'command_center',
      level: 1,
      slotIndex: 0,
    });

    await db.insert(planetResources).values([
      { planetId: capitalPlanetId, resourceId: 'iron', amount: '1000', regenRate: '0' },
      { planetId: capitalPlanetId, resourceId: 'silicon', amount: '500', regenRate: '0' },
      { planetId: capitalPlanetId, resourceId: JUMP_FUEL_RESOURCE_ID, amount: '1000', regenRate: '0' },
    ]);

    // Setup target system and planet
    const [targetSystem] = await db.insert(systems).values({
      ownerId: userId,
      isHome: false,
      sectorX: 1,
      sectorY: 1,
      sectorZ: 1,
      x: '100.00',
      y: '100.00',
      z: '100.00',
      name: 'Target System',
      seed: 222,
    }).returning();

    const [targetPlanet] = await db.insert(planets).values({
      systemId: targetSystem.id,
      biome: 'green',
      size: 10,
      slotCount: 8,
      name: 'Target Planet',
    }).returning();
    targetPlanetId = targetPlanet.id;

    await db.insert(colonies).values({
      ownerId: userId,
      planetId: targetPlanetId,
    });

    // Setup resources on origin
    await db.insert(planetResources).values([
      { planetId: originPlanetId, resourceId: 'iron', amount: '1000', regenRate: '0' },
      { planetId: originPlanetId, resourceId: 'silicon', amount: '500', regenRate: '0' },
      { planetId: originPlanetId, resourceId: JUMP_FUEL_RESOURCE_ID, amount: '1000', regenRate: '0' },
    ]);

    // Setup cargo ship
    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'cargo_light',
      locationPlanetId: originPlanetId,
      status: 'idle',
    }).returning();
    cargoShipId = ship.id;
  });

  async function resourceAmount(planetId: string, resourceId: string): Promise<number> {
    const row = await db.query.planetResources.findFirst({
      where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
    });
    return Number(row?.amount ?? 0);
  }

  it('rejects transfer to non-owned planet', async () => {
    // Create another user's planet
    const [foreignPlanet] = await db.insert(planets).values({
      systemId: (await db.query.planets.findFirst({ where: eq(planets.id, originPlanetId),
      orderBy: (p, { asc }) => asc(p.name),
    }))!.systemId,
      biome: 'rocky',
      size: 5,
      slotCount: 5,
      name: 'Foreign Planet'
    }).returning();

    await expect(launchCargoTransfer(userId, {
      shipId: cargoShipId,
      targetPlanetId: foreignPlanet.id,
      resources: [{ resourceId: 'iron', amount: 100 }]
    })).rejects.toThrow('Target planet is not owned by you');
  });

  it('successfully launches a Jump Gate cargo route and reserves resources', async () => {
    const resources = [
      { resourceId: 'iron', amount: 20 },
      { resourceId: 'silicon', amount: 10 },
    ];
    const jumpFuelBefore = await resourceAmount(originPlanetId, JUMP_FUEL_RESOURCE_ID);

    const result = await launchCargoTransfer(userId, {
      shipId: cargoShipId,
      targetPlanetId,
      routeMode: 'jump_gate',
      resources
    });

    expect(result.success).toBe(true);
    expect(result.expedition).toBeDefined();
    expect(result.expedition.type).toBe('cargo_transfer');
    const payload = result.expedition.result as any;
    expect(payload.routeMode).toBe('jump_gate');
    expect(payload.jumpFuelRequired).toBe(JUMP_GATE_JUMP_FUEL_COST);
    expect(await resourceAmount(originPlanetId, JUMP_FUEL_RESOURCE_ID)).toBe(
      jumpFuelBefore - JUMP_GATE_JUMP_FUEL_COST,
    );

    // Verify resources spent on origin
    const ironRes = await db.query.planetResources.findFirst({
      where: and(eq(planetResources.planetId, originPlanetId), eq(planetResources.resourceId, 'iron'))
    });
    expect(Number(ironRes!.amount)).toBe(980);

    const siliconRes = await db.query.planetResources.findFirst({
      where: and(eq(planetResources.planetId, originPlanetId), eq(planetResources.resourceId, 'silicon'))
    });
    expect(Number(siliconRes!.amount)).toBe(490);

    // Verify ship state
    const ship = await db.query.ships.findFirst({
      where: eq(ships.id, cargoShipId)
    });
    expect(ship!.status).toBe('moving');
    expect(ship!.cargoJson).toEqual({ iron: 20, silicon: 10 });
  });

  it('supports multiple load lines in one cargo_light transfer up to 5000 units', async () => {
    await db
      .update(planetResources)
      .set({ amount: '5000.0000' })
      .where(and(eq(planetResources.planetId, originPlanetId), eq(planetResources.resourceId, 'iron')));
    await db
      .update(planetResources)
      .set({ amount: '500.0000' })
      .where(and(eq(planetResources.planetId, originPlanetId), eq(planetResources.resourceId, 'silicon')));

    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'cargo_light',
      locationPlanetId: originPlanetId,
      status: 'idle',
    }).returning();

    const result = await launchCargoTransfer(userId, {
      shipId: ship.id,
      targetPlanetId,
      resources: [
        { resourceId: 'iron', amount: 3000 },
        { resourceId: 'iron', amount: 1500 },
        { resourceId: 'silicon', amount: 500 },
      ],
    });

    expect(result.success).toBe(true);
    const payload = result.expedition.result as any;
    expect(payload.routeMode).toBe('standard');
    expect(payload.deliveryMode).toBe('one_way');
    expect(payload.totalCargo).toBe(5000);
    expect(payload.maxCargo).toBe(5000);
    expect(payload.loads).toHaveLength(3);
    expect(payload.resources).toEqual([
      { resourceId: 'iron', amount: 4500 },
      { resourceId: 'silicon', amount: 500 },
    ]);

    const updatedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(updatedShip!.cargoJson).toEqual({ iron: 4500, silicon: 500 });
  });

  it('supports cargo transfer from the home capital without a colonies row', async () => {
    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'cargo_light',
      locationPlanetId: capitalPlanetId,
      status: 'idle',
    }).returning();

    const result = await launchCargoTransfer(userId, {
      shipId: ship.id,
      targetPlanetId,
      resources: [{ resourceId: 'iron', amount: 100 }],
    });

    expect(result.success).toBe(true);
    expect(result.expedition.originPlanetId).toBe(capitalPlanetId);
    expect(result.expedition.targetPlanetId).toBe(targetPlanetId);
  });

  it('supports cargo transfer to the home capital without a colonies row', async () => {
    await db
      .update(planetResources)
      .set({ amount: '1000.0000' })
      .where(and(eq(planetResources.planetId, originPlanetId), eq(planetResources.resourceId, 'iron')));

    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'cargo_light',
      locationPlanetId: originPlanetId,
      status: 'idle',
    }).returning();

    const result = await launchCargoTransfer(userId, {
      shipId: ship.id,
      targetPlanetId: capitalPlanetId,
      resources: [{ resourceId: 'iron', amount: 100 }],
    });

    expect(result.success).toBe(true);
    expect(result.expedition.originPlanetId).toBe(originPlanetId);
    expect(result.expedition.targetPlanetId).toBe(capitalPlanetId);
  });

  it('rejects Jump Gate cargo transfer without stored Jump Fuel', async () => {
    const homeSystem = await db.query.systems.findFirst({
      where: and(eq(systems.ownerId, userId), eq(systems.isHome, true)),
    });
    const [originWithoutJumpFuel] = await db.insert(planets).values({
      systemId: homeSystem!.id,
      biome: 'rocky',
      size: 8,
      slotCount: 6,
      name: 'Dry Origin Planet',
    }).returning();
    await db.insert(colonies).values({
      ownerId: userId,
      planetId: originWithoutJumpFuel.id,
    });
    await db.insert(planetResources).values({
      planetId: originWithoutJumpFuel.id,
      resourceId: 'iron',
      amount: '100',
      regenRate: '0',
    });
    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'cargo_light',
      locationPlanetId: originWithoutJumpFuel.id,
      status: 'idle',
    }).returning();

    await expect(launchCargoTransfer(userId, {
      shipId: ship.id,
      targetPlanetId,
      routeMode: 'jump_gate',
      resources: [{ resourceId: 'iron', amount: 10 }],
    })).rejects.toThrow('not enough jump_fuel');
  });

  it('rejects transfer if ship is already moving', async () => {
    await expect(launchCargoTransfer(userId, {
      shipId: cargoShipId,
      targetPlanetId,
      resources: [{ resourceId: 'iron', amount: 10 }]
    })).rejects.toThrow('Ship is not idle');
  });

  it('rejects transfer if cargo exceeds capacity', async () => {
    // Reset ship to idle
    await db.update(ships).set({ status: 'idle' }).where(eq(ships.id, cargoShipId));
    
    await expect(launchCargoTransfer(userId, {
      shipId: cargoShipId,
      targetPlanetId,
      resources: [{ resourceId: 'iron', amount: 6000 }]
    })).rejects.toThrow(/exceeds ship capacity/);
  });

  it('rejects scout ships even if they have small cargo capacity', async () => {
    const [ship] = await db.insert(ships).values({
      ownerId: userId,
      typeId: 'scout',
      locationPlanetId: originPlanetId,
      status: 'idle',
    }).returning();

    await expect(launchCargoTransfer(userId, {
      shipId: ship.id,
      targetPlanetId,
      resources: [{ resourceId: 'iron', amount: 10 }],
    })).rejects.toThrow('Ship cannot transfer cargo');
  });

  it('rejects transfer to the same planet', async () => {
    // Reset ship to idle
    await db.update(ships).set({ status: 'idle' }).where(eq(ships.id, cargoShipId));
    
    await expect(launchCargoTransfer(userId, {
      shipId: cargoShipId,
      targetPlanetId: originPlanetId,
      resources: [{ resourceId: 'iron', amount: 10 }]
    })).rejects.toThrow('Target planet must be different from origin');
  });
});
