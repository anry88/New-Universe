import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import {
  buildings,
  colonies,
  discoveredPlanets,
  discoveredSystems,
  expeditions,
  jumpGates,
  notifications,
  planetResources,
  planets,
  productionOrders,
  researchProgress,
  richness,
  ships,
  shipTypes,
  systems,
  users,
} from "../../db/schema.js";
import { seedResources } from "../../db/seed/resources.js";
import { getSystemTacticalState } from "./tactical-state.js";

async function createUser(suffix: string) {
  const [user] = await db
    .insert(users)
    .values({
      tgId: BigInt(Math.floor(Math.random() * 1e12)),
      tgUsername: `systems_${suffix}_${Date.now()}`,
    })
    .returning();

  return user;
}

async function createPublicSystem(name: string, sectorX: number) {
  const [system] = await db
    .insert(systems)
    .values({
      ownerId: null,
      isHome: false,
      sectorX,
      sectorY: 300,
      sectorZ: 0,
      x: `${sectorX}.00`,
      y: "300.00",
      z: "0.00",
      name,
      seed: sectorX,
    })
    .returning();

  const [planet] = await db
    .insert(planets)
    .values({
      systemId: system.id,
      biome: "rocky",
      size: 12,
      slotCount: 8,
      name: `${name} I`,
    })
    .returning();

  return { system, planet };
}

async function createShipType(id: string) {
  const [row] = await db
    .insert(shipTypes)
    .values({
      id,
      name: { en: id, ru: id },
      role: "combat",
      hp: 280,
      speed: "10.00",
      cargo: 0,
      dps: 24,
      armor: 0,
      fuelConsumption: "1.00",
      buildTimeSec: 60,
      buildCost: {},
      requiredBuildings: [],
      sensorRange: 30,
      combatStats: {
        targetClass: "military_light",
        damageProfile: {
          damageType: "energy",
          dps: 24,
          armorPenetration: 0.4,
          shieldMultiplier: 1.2,
        },
        engagementRange: "long",
      },
    })
    .returning();

  return row;
}

async function stationForeignShip(args: {
  ownerId: string;
  typeId: string;
  originPlanetId: string;
  systemId: string;
  point: { x: number; y: number };
  hp?: number;
  fuel?: string;
  jumpFuel?: string;
  refuelFuel?: string;
  refuelJumpFuel?: string;
}) {
  const [ship] = await db
    .insert(ships)
    .values({
      ownerId: args.ownerId,
      typeId: args.typeId,
      locationPlanetId: null,
      status: "moving",
      ...(args.fuel !== undefined ? { fuel: args.fuel } : {}),
      ...(args.jumpFuel !== undefined ? { jumpFuel: args.jumpFuel } : {}),
      ...(args.refuelFuel !== undefined
        ? { refuelFuel: args.refuelFuel }
        : {}),
      ...(args.refuelJumpFuel !== undefined
        ? { refuelJumpFuel: args.refuelJumpFuel }
        : {}),
      hp: args.hp ?? 180,
      maxHp: 280,
      lastCombatTickAt: new Date("2026-05-13T00:59:00.000Z"),
      combatStats: {
        targetClass: "military_light",
        damageProfile: {
          damageType: "energy",
          dps: 24,
          armorPenetration: 0.4,
          shieldMultiplier: 1.2,
        },
        engagementRange: "long",
      },
    })
    .returning();

  await db.insert(expeditions).values({
    shipId: ship.id,
    type: args.typeId,
    originPlanetId: args.originPlanetId,
    targetX: "0",
    targetY: "0",
    targetZ: "0",
    status: "stationed",
    eta: new Date("2026-05-13T01:00:00.000Z"),
    result: {
      routeMode: "jump_gate",
      destinationSystemId: args.systemId,
      targetSystemPoint: args.point,
    },
  });

  return ship;
}

async function launchForeignShipInsideSystem(args: {
  ownerId: string;
  typeId: string;
  originPlanetId: string;
  systemId: string;
  originPoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
  eta: Date;
}) {
  const [ship] = await db
    .insert(ships)
    .values({
      ownerId: args.ownerId,
      typeId: args.typeId,
      locationPlanetId: null,
      status: "moving",
      hp: 260,
      maxHp: 280,
      combatStats: {
        targetClass: "military_light",
        damageProfile: {
          damageType: "energy",
          dps: 24,
          armorPenetration: 0.4,
          shieldMultiplier: 1.2,
        },
        engagementRange: "long",
      },
    })
    .returning();

  await db.insert(expeditions).values({
    shipId: ship.id,
    type: args.typeId,
    originPlanetId: args.originPlanetId,
    targetX: "0",
    targetY: "0",
    targetZ: "0",
    status: "in_flight",
    eta: args.eta,
    result: {
      routeMode: "jump_gate",
      originSystemId: args.systemId,
      destinationSystemId: args.systemId,
      originSystemPoint: args.originPoint,
      targetSystemPoint: args.targetPoint,
      originGateDistance: 0,
      targetGateDistance: 1,
      distance: 1,
      speed: 1,
      engineFactor: 1,
    },
  });

  return ship;
}

describe("getSystemTacticalState", () => {
  beforeEach(async () => {
    await db.delete(jumpGates);
    await db.delete(discoveredPlanets);
    await db.delete(discoveredSystems);
    await db.delete(researchProgress);
    await db.delete(expeditions);
    await db.delete(ships);
    await db.delete(productionOrders);
    await db.delete(buildings);
    await db.delete(colonies);
    await db.delete(shipTypes);
    await db.delete(notifications);
    await db.delete(planetResources);
    await db.delete(richness);
    await db.delete(planets);
    await db.delete(systems);
    await db.delete(users);
    await seedResources();
  });

  it("returns only tactical contacts for the requested visible system", async () => {
    const viewer = await createUser("viewer");
    const foreignOwner = await createUser("foreign");
    const first = await createPublicSystem("Tactical Alpha", 700);
    const second = await createPublicSystem("Tactical Beta", 701);
    const shipType = await createShipType(`tactical_contact_${Date.now()}`);

    await db.insert(discoveredSystems).values([
      { userId: viewer.id, systemId: first.system.id },
      { userId: viewer.id, systemId: second.system.id },
    ]);

    const visibleShip = await stationForeignShip({
      ownerId: foreignOwner.id,
      typeId: shipType.id,
      originPlanetId: first.planet.id,
      systemId: first.system.id,
      point: { x: 72, y: -24 },
    });
    await stationForeignShip({
      ownerId: foreignOwner.id,
      typeId: shipType.id,
      originPlanetId: second.planet.id,
      systemId: second.system.id,
      point: { x: -120, y: 40 },
    });

    const state = await getSystemTacticalState(viewer.id, first.system.id, {
      now: new Date("2026-05-13T01:02:00.000Z"),
    });

    expect(state).toMatchObject({
      systemId: first.system.id,
      updatedAt: "2026-05-13T01:02:00.000Z",
    });
    expect(state?.fleetContacts).toHaveLength(1);
    expect(state?.fleetContacts[0]).toMatchObject({
      id: visibleShip.id,
      systemId: first.system.id,
      relation: "foreign",
      visibility: "summary",
      status: "stationed",
      ownerAlias: expect.stringContaining("@systems_fore"),
      shipTypeId: shipType.id,
      hp: 180,
      maxHp: 280,
      point: { x: 72, y: -24 },
      stationedAt: "2026-05-13T01:00:00.000Z",
      lastCombatTickAt: "2026-05-13T00:59:00.000Z",
    });
    expect(state?.fleetContacts[0]?.combatStats).toMatchObject({
      targetClass: "military_light",
      engagementRange: "long",
    });
  });

  it("does not expose undiscovered public systems", async () => {
    const viewer = await createUser("hidden_viewer");
    const hidden = await createPublicSystem("Hidden Tactical", 900);

    await expect(
      getSystemTacticalState(viewer.id, hidden.system.id),
    ).resolves.toBeNull();
  });

  it("keeps moving point-to-point contacts visible at their interpolated map point", async () => {
    const viewer = await createUser("moving_viewer");
    const foreignOwner = await createUser("moving_foreign");
    const target = await createPublicSystem("Moving Tactical", 920);
    const shipType = await createShipType(`moving_contact_${Date.now()}`);

    await db.insert(discoveredSystems).values({
      userId: viewer.id,
      systemId: target.system.id,
    });

    const ship = await launchForeignShipInsideSystem({
      ownerId: foreignOwner.id,
      typeId: shipType.id,
      originPlanetId: target.planet.id,
      systemId: target.system.id,
      originPoint: { x: 0, y: 0 },
      targetPoint: { x: 100, y: 0 },
      eta: new Date("2026-05-13T01:01:00.000Z"),
    });

    const state = await getSystemTacticalState(viewer.id, target.system.id, {
      now: new Date("2026-05-13T01:00:30.000Z"),
    });

    expect(state?.fleetContacts).toHaveLength(1);
    expect(state?.fleetContacts[0]).toMatchObject({
      id: ship.id,
      status: "in_flight",
      point: { x: 50, y: 0 },
      motion: {
        state: "moving",
        dx: 100,
        dy: 0,
        updatedAt: "2026-05-13T01:00:30.000Z",
      },
    });
  });

  it("returns own and foreign tactical contacts as one system snapshot", async () => {
    const viewer = await createUser("mixed_viewer");
    const foreignOwner = await createUser("mixed_foreign");
    const target = await createPublicSystem("Mixed Tactical", 930);
    const shipType = await createShipType(`mixed_contact_${Date.now()}`);

    await db.insert(discoveredSystems).values({
      userId: viewer.id,
      systemId: target.system.id,
    });

    const ownShip = await stationForeignShip({
      ownerId: viewer.id,
      typeId: shipType.id,
      originPlanetId: target.planet.id,
      systemId: target.system.id,
      point: { x: 20, y: 0 },
      hp: 140,
      fuel: "73.00",
      jumpFuel: "12.00",
      refuelFuel: "500.00",
      refuelJumpFuel: "40.00",
    });
    const foreignShip = await stationForeignShip({
      ownerId: foreignOwner.id,
      typeId: shipType.id,
      originPlanetId: target.planet.id,
      systemId: target.system.id,
      point: { x: 55, y: 0 },
      hp: 90,
    });

    const state = await getSystemTacticalState(viewer.id, target.system.id, {
      now: new Date("2026-05-13T01:02:00.000Z"),
    });

    expect(state?.fleetContacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ownShip.id,
          relation: "self",
          visibility: "full",
          ownerAlias: null,
          fuel: "73.00",
          jumpFuel: "12.00",
          refuelFuel: "500.00",
          refuelJumpFuel: "40.00",
          hp: 140,
          point: { x: 20, y: 0 },
        }),
        expect.objectContaining({
          id: foreignShip.id,
          relation: "foreign",
          visibility: "summary",
          ownerAlias: expect.stringContaining("@systems_mixe"),
          hp: 90,
          point: { x: 55, y: 0 },
        }),
      ]),
    );
  });
});
