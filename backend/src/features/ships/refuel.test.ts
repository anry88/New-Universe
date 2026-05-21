import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  colonies,
  discoveredSystems,
  expeditions,
  planetResources,
  planets,
  researchProgress,
  ships,
  systems,
  users,
} from "../../db/schema.js";
import { seedResources } from "../../db/seed/resources.js";
import { seedShipTypes } from "../../db/seed/ship-types.js";
import { processExpeditions } from "../../workers/tick-expeditions.js";
import { refuelShip, replenishRefueler } from "./refuel.js";

describe("refuelShip", () => {
  beforeAll(async () => {
    await seedResources();
    await seedShipTypes();
  });

  async function createPlanet() {
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
        tgUsername: `refuel_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        tgFirstName: "Refuel",
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
        x: "0",
        y: "0",
        z: "0",
        name: `Refuel Test ${user.id}`,
        seed: Math.floor(Math.random() * 1_000_000),
      })
      .returning();

    const [planet] = await db
      .insert(planets)
      .values({
        systemId: system.id,
        name: `Refuel-${user.id.slice(0, 8)}`,
        biome: "rocky",
        size: 6,
        slotCount: 6,
      })
      .returning();

    await db.insert(colonies).values({
      ownerId: user.id,
      planetId: planet.id,
      status: "active",
    });

    return { userId: user.id, planetId: planet.id };
  }

  async function createHomePlanet() {
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
        tgUsername: `refuel_gate_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        tgFirstName: "Refuel Gate",
      })
      .returning();

    const [system] = await db
      .insert(systems)
      .values({
        ownerId: user.id,
        isHome: true,
        sectorX: 10,
        sectorY: 20,
        sectorZ: 0,
        x: "1000",
        y: "2000",
        z: "0",
        name: `Refuel Gate Home ${user.id}`,
        seed: Math.floor(Math.random() * 1_000_000),
      })
      .returning();

    const [planet] = await db
      .insert(planets)
      .values({
        systemId: system.id,
        name: `Gate-Home-${user.id.slice(0, 8)}`,
        biome: "terran",
        size: 10,
        slotCount: 10,
      })
      .returning();

    await db.insert(colonies).values({
      ownerId: user.id,
      planetId: planet.id,
      status: "active",
    });

    return { userId: user.id, system, planetId: planet.id };
  }

  async function unlockJumpGate(userId: string) {
    await db
      .insert(researchProgress)
      .values({ userId, branch: "jump_drive", level: 1 })
      .onConflictDoUpdate({
        target: [researchProgress.userId, researchProgress.branch],
        set: { level: 1 },
      });
  }

  async function createKnownPublicDestination(
    userId: string,
    homeSystem: typeof systems.$inferSelect,
    options: { withColony?: boolean } = {},
  ) {
    const [system] = await db
      .insert(systems)
      .values({
        name: `Refuel Public ${Date.now()}`,
        sectorX: homeSystem.sectorX + 6,
        sectorY: homeSystem.sectorY + 8,
        sectorZ: homeSystem.sectorZ,
        x: (Number(homeSystem.x) + 600).toFixed(2),
        y: (Number(homeSystem.y) + 800).toFixed(2),
        z: Number(homeSystem.z).toFixed(2),
        seed: Math.floor(Math.random() * 1_000_000),
        ownerId: null,
        isHome: false,
      })
      .returning();

    const [planet] = await db
      .insert(planets)
      .values({
        systemId: system.id,
        name: `Gate-Target-${userId.slice(0, 8)}`,
        biome: "green",
        size: 12,
        slotCount: 10,
      })
      .returning();

    await db.insert(discoveredSystems).values({
      userId,
      systemId: system.id,
      source: "random_jump",
    });

    if (options.withColony) {
      await db.insert(colonies).values({
        ownerId: userId,
        planetId: planet.id,
        status: "active",
      });
    }

    return { system, planet };
  }

  async function spawnShip(args: {
    ownerId: string;
    planetId: string;
    typeId: string;
    fuel?: string;
    jumpFuel?: string;
    refuelFuel?: string;
    refuelJumpFuel?: string;
    status?: string;
  }) {
    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: args.ownerId,
        typeId: args.typeId,
        locationPlanetId: args.planetId,
        status: args.status ?? "idle",
        fuel: args.fuel ?? "0",
        jumpFuel: args.jumpFuel ?? "0",
        refuelFuel: args.refuelFuel ?? "0",
        refuelJumpFuel: args.refuelJumpFuel ?? "0",
      })
      .returning();
    return ship;
  }

  async function setPlanetResource(
    planetId: string,
    resourceId: string,
    amount: string,
  ) {
    await db
      .insert(planetResources)
      .values({
        planetId,
        resourceId,
        amount,
        regenRate: "0",
      })
      .onConflictDoUpdate({
        target: [planetResources.planetId, planetResources.resourceId],
        set: { amount },
      });
  }

  async function completeExpedition(userId: string, expeditionId: string) {
    const now = new Date();
    await db
      .update(expeditions)
      .set({ eta: new Date(now.getTime() - 1000) })
      .where(eq(expeditions.id, expeditionId));
    await processExpeditions({
      userId,
      now,
      onlyDue: true,
      skipNotifications: true,
      skipVisibilityChecks: true,
    });
  }

  it("launches a routed transfer and delivers ordinary fuel and jump fuel on arrival", async () => {
    const fixture = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "200",
      jumpFuel: "100",
      refuelFuel: "200",
      refuelJumpFuel: "100",
    });
    const target = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "light_fighter",
      fuel: "20",
      jumpFuel: "0",
    });

    const result = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: target.id,
      fuel: 50,
      jumpFuel: 50,
    });

    expect(result.success).toBe(true);
    expect(result.data!.expedition?.targetPlanetId).toBe(fixture.planetId);
    expect(Number(result.data!.targetShip.fuel)).toBe(20);
    expect(Number(result.data!.targetShip.jumpFuel)).toBe(0);
    expect(Number(result.data!.sourceShip.fuel)).toBe(199);
    expect(Number(result.data!.sourceShip.jumpFuel)).toBe(100);
    expect(Number(result.data!.sourceShip.refuelFuel)).toBe(150);
    expect(Number(result.data!.sourceShip.refuelJumpFuel)).toBe(50);

    const launchedSource = await db.query.ships.findFirst({
      where: eq(ships.id, source.id),
    });
    expect(launchedSource!.status).toBe("moving");
    expect(launchedSource!.locationPlanetId).toBeNull();

    await completeExpedition(fixture.userId, result.data!.expedition!.id);

    const deliveredRows = await db
      .select({
        id: ships.id,
        status: ships.status,
        locationPlanetId: ships.locationPlanetId,
        fuel: ships.fuel,
        jumpFuel: ships.jumpFuel,
        refuelFuel: ships.refuelFuel,
        refuelJumpFuel: ships.refuelJumpFuel,
      })
      .from(ships)
      .where(inArray(ships.id, [source.id, target.id]));
    const deliveredById = new Map(deliveredRows.map((ship) => [ship.id, ship]));

    expect(Number(deliveredById.get(target.id)!.fuel)).toBe(70);
    expect(Number(deliveredById.get(target.id)!.jumpFuel)).toBe(50);
    expect(deliveredById.get(source.id)!.status).toBe("idle");
    expect(deliveredById.get(source.id)!.locationPlanetId).toBe(
      fixture.planetId,
    );
  });

  it("loads missing transfer reserve from the launch planet before flight", async () => {
    const fixture = await createPlanet();
    await setPlanetResource(fixture.planetId, "fuel", "100");
    await setPlanetResource(fixture.planetId, "jump_fuel", "100");
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "200",
      jumpFuel: "100",
      refuelFuel: "20",
      refuelJumpFuel: "10",
    });
    const target = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "scout",
      fuel: "0",
      jumpFuel: "0",
    });

    const result = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: target.id,
      fuel: 80,
      jumpFuel: 50,
    });

    expect(result.success).toBe(true);
    expect(Number(result.data!.targetShip.fuel)).toBe(0);
    expect(Number(result.data!.targetShip.jumpFuel)).toBe(0);
    expect(Number(result.data!.sourceShip.fuel)).toBe(199);
    expect(Number(result.data!.sourceShip.jumpFuel)).toBe(100);
    expect(Number(result.data!.sourceShip.refuelFuel)).toBe(0);
    expect(Number(result.data!.sourceShip.refuelJumpFuel)).toBe(0);

    const rows = await db
      .select({
        resourceId: planetResources.resourceId,
        amount: planetResources.amount,
      })
      .from(planetResources)
      .where(
        and(
          eq(planetResources.planetId, fixture.planetId),
          inArray(planetResources.resourceId, ["fuel", "jump_fuel"]),
        ),
      );
    const amountByResource = Object.fromEntries(
      rows.map((resource) => [resource.resourceId, Number(resource.amount)]),
    );
    expect(amountByResource.fuel).toBe(40);
    expect(amountByResource.jump_fuel).toBe(60);

    await completeExpedition(fixture.userId, result.data!.expedition!.id);

    const deliveredTarget = await db.query.ships.findFirst({
      where: eq(ships.id, target.id),
    });
    expect(Number(deliveredTarget!.fuel)).toBe(80);
    expect(Number(deliveredTarget!.jumpFuel)).toBe(50);
  });

  it("rejects transfers that would overfill the target tank without changing balances", async () => {
    const fixture = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "200",
      refuelFuel: "200",
    });
    const target = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "light_fighter",
      fuel: "90",
    });

    const result = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: target.id,
      fuel: 20,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("refuel_exceeds_tank");

    const unchanged = await db
      .select({ id: ships.id, fuel: ships.fuel })
      .from(ships)
      .where(inArray(ships.id, [source.id, target.id]));
    expect(
      Object.fromEntries(unchanged.map((ship) => [ship.id, Number(ship.fuel)])),
    ).toEqual({
      [source.id]: 200,
      [target.id]: 90,
    });
    const unchangedSource = await db.query.ships.findFirst({
      where: eq(ships.id, source.id),
    });
    expect(Number(unchangedSource!.refuelFuel)).toBe(200);
  });

  it("limits arrival delivery to the target's remaining tank capacity", async () => {
    const fixture = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "200",
      refuelFuel: "200",
    });
    const target = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "light_fighter",
      fuel: "20",
    });

    const result = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: target.id,
      fuel: 70,
    });

    expect(result.success).toBe(true);

    await db.update(ships).set({ fuel: "80" }).where(eq(ships.id, target.id));
    await completeExpedition(fixture.userId, result.data!.expedition!.id);

    const rows = await db
      .select({ id: ships.id, fuel: ships.fuel, refuelFuel: ships.refuelFuel })
      .from(ships)
      .where(inArray(ships.id, [source.id, target.id]));
    const byId = new Map(rows.map((ship) => [ship.id, ship]));

    expect(Number(byId.get(target.id)!.fuel)).toBe(100);
    expect(Number(byId.get(source.id)!.refuelFuel)).toBe(180);
  });

  it("serializes concurrent refuel requests so the source cannot be overdrawn", async () => {
    const fixture = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "200",
      refuelFuel: "100",
    });
    const targetA = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "scout",
      fuel: "0",
    });
    const targetB = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "scout",
      fuel: "0",
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
    expect(
      results.filter((result) => result.code === "refuel_ship_not_idle"),
    ).toHaveLength(1);

    const rows = await db
      .select({ id: ships.id, fuel: ships.fuel, refuelFuel: ships.refuelFuel })
      .from(ships)
      .where(inArray(ships.id, [source.id, targetA.id, targetB.id]));
    const fuelByShip = Object.fromEntries(
      rows.map((ship) => [ship.id, Number(ship.fuel)]),
    );
    const reserveByShip = Object.fromEntries(
      rows.map((ship) => [ship.id, Number(ship.refuelFuel)]),
    );

    expect(reserveByShip[source.id]).toBe(20);
    expect(fuelByShip[targetA.id]).toBe(0);
    expect(fuelByShip[targetB.id]).toBe(0);

    const successful = results.find((result) => result.success)!;
    await completeExpedition(fixture.userId, successful.data!.expedition!.id);

    const deliveredTargets = await db
      .select({ id: ships.id, fuel: ships.fuel })
      .from(ships)
      .where(inArray(ships.id, [targetA.id, targetB.id]));
    const deliveredFuelByShip = Object.fromEntries(
      deliveredTargets.map((ship) => [ship.id, Number(ship.fuel)]),
    );

    expect(
      [deliveredFuelByShip[targetA.id], deliveredFuelByShip[targetB.id]].sort(
        (a, b) => a - b,
      ),
    ).toEqual([0, 80]);
  });

  it("requires target ships to be idle and docked, but supports remote docked targets", async () => {
    const fixture = await createPlanet();
    const other = await createPlanet();
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "100",
      refuelFuel: "100",
    });
    const movingTarget = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "scout",
      status: "moving",
    });
    const remoteTarget = await spawnShip({
      ownerId: fixture.userId,
      planetId: other.planetId,
      typeId: "scout",
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

    expect(movingResult.code).toBe("refuel_ship_not_idle");
    expect(remoteResult.success).toBe(true);
    expect(remoteResult.data!.expedition?.targetPlanetId).toBe(other.planetId);
  });

  it("launches a transfer through a known Jump Gate destination", async () => {
    const fixture = await createHomePlanet();
    await unlockJumpGate(fixture.userId);
    const destination = await createKnownPublicDestination(
      fixture.userId,
      fixture.system,
    );
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "500",
      jumpFuel: "100",
      refuelFuel: "100",
      refuelJumpFuel: "100",
    });
    const target = await spawnShip({
      ownerId: fixture.userId,
      planetId: destination.planet.id,
      typeId: "scout",
      fuel: "0",
      jumpFuel: "0",
    });

    const result = await refuelShip(fixture.userId, {
      sourceShipId: source.id,
      targetShipId: target.id,
      routeMode: "jump_gate",
      destinationSystemId: destination.system.id,
      fuel: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data!.expedition?.targetPlanetId).toBe(destination.planet.id);
    expect(Number(result.data!.sourceShip.jumpFuel)).toBe(50);

    const stored = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, result.data!.expedition!.id),
    });
    expect(stored?.result).toMatchObject({
      routeMode: "jump_gate",
      destinationSystemId: destination.system.id,
      jumpFuelRequired: 50,
    });

    await completeExpedition(fixture.userId, result.data!.expedition!.id);

    const deliveredRows = await db
      .select({
        id: ships.id,
        locationPlanetId: ships.locationPlanetId,
        fuel: ships.fuel,
        status: ships.status,
      })
      .from(ships)
      .where(inArray(ships.id, [source.id, target.id]));
    const byId = new Map(deliveredRows.map((ship) => [ship.id, ship]));
    expect(Number(byId.get(target.id)!.fuel)).toBe(10);
    expect(byId.get(source.id)!.locationPlanetId).toBe(destination.planet.id);
    expect(byId.get(source.id)!.status).toBe("idle");
  });

  it("launches refueler replenishment through a known Jump Gate destination", async () => {
    const fixture = await createHomePlanet();
    await unlockJumpGate(fixture.userId);
    const destination = await createKnownPublicDestination(
      fixture.userId,
      fixture.system,
      { withColony: true },
    );
    await setPlanetResource(destination.planet.id, "fuel", "1000");
    await setPlanetResource(destination.planet.id, "jump_fuel", "500");
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "500",
      jumpFuel: "100",
      refuelFuel: "0",
      refuelJumpFuel: "0",
    });

    const result = await replenishRefueler(fixture.userId, {
      sourceShipId: source.id,
      targetPlanetId: destination.planet.id,
      routeMode: "jump_gate",
      destinationSystemId: destination.system.id,
    });

    expect(result.success).toBe(true);
    expect(Number(result.data!.sourceShip.jumpFuel)).toBe(50);

    const stored = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, result.data!.expedition!.id),
    });
    expect(stored?.result).toMatchObject({
      routeMode: "jump_gate",
      destinationSystemId: destination.system.id,
      jumpFuelRequired: 50,
      deliveryMode: "refuel_replenish",
    });

    await completeExpedition(fixture.userId, result.data!.expedition!.id);

    const replenished = await db.query.ships.findFirst({
      where: eq(ships.id, source.id),
    });
    expect(replenished!.locationPlanetId).toBe(destination.planet.id);
    expect(Number(replenished!.fuel)).toBe(500);
    expect(Number(replenished!.jumpFuel)).toBe(200);
    expect(Number(replenished!.refuelFuel)).toBeGreaterThan(0);
    expect(Number(replenished!.refuelJumpFuel)).toBe(200);
  });

  it("launches refueler replenishment as a routed order and fills tanks on arrival", async () => {
    const fixture = await createPlanet();
    await setPlanetResource(fixture.planetId, "fuel", "1000");
    await setPlanetResource(fixture.planetId, "jump_fuel", "500");
    const source = await spawnShip({
      ownerId: fixture.userId,
      planetId: fixture.planetId,
      typeId: "refueler",
      fuel: "100",
      jumpFuel: "50",
      refuelFuel: "100",
      refuelJumpFuel: "10",
    });

    const result = await replenishRefueler(fixture.userId, {
      sourceShipId: source.id,
      targetPlanetId: fixture.planetId,
    });

    expect(result.success).toBe(true);
    expect(result.data!.expedition?.targetPlanetId).toBe(fixture.planetId);
    expect(Number(result.data!.sourceShip.fuel)).toBe(99);
    expect(Number(result.data!.sourceShip.refuelFuel)).toBe(100);

    const launchedSource = await db.query.ships.findFirst({
      where: eq(ships.id, source.id),
    });
    expect(launchedSource!.status).toBe("moving");
    expect(launchedSource!.locationPlanetId).toBeNull();

    await completeExpedition(fixture.userId, result.data!.expedition!.id);

    const replenished = await db.query.ships.findFirst({
      where: eq(ships.id, source.id),
    });
    expect(replenished!.status).toBe("idle");
    expect(replenished!.locationPlanetId).toBe(fixture.planetId);
    expect(Number(replenished!.fuel)).toBe(500);
    expect(Number(replenished!.jumpFuel)).toBe(200);
    expect(Number(replenished!.refuelFuel)).toBe(699);
    expect(Number(replenished!.refuelJumpFuel)).toBe(200);
  });
});
