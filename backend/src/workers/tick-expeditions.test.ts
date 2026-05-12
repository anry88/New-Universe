import { describe, expect, it, beforeEach } from "vitest";
import { db } from "../db/index.js";
import {
  users,
  expeditions,
  ships,
  planets,
  systems,
  shipTypes,
  discoveredPlanets,
  discoveredSystems,
  planetResources,
  richness,
  buildings,
  notifications,
  colonies,
  researchProgress,
  productionOrders,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import {
  processExpeditions,
  calculateExpeditionPosition,
} from "./tick-expeditions.js";
import {
  buildSystemMapLayouts,
  SYSTEM_MAP_WORLD_UNITS_PER_LY,
} from "@shared/format/systemMapLayout.js";
import { seedResources } from "../db/seed/resources.js";
import { seedBuildingTypes } from "../db/seed/building-types.js";

describe("Tick Expeditions Worker", () => {
  async function createTestUser() {
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 100000000)),
        tgUsername: `exptest_${Date.now()}`,
      })
      .returning();
    return user;
  }

  async function createTestShipType() {
    await db
      .insert(shipTypes)
      .values({
        id: "scout",
        name: { ru: "Разведчик", en: "Scout" },
        role: "recon",
        hp: 10,
        speed: "10.00",
        cargo: 10,
        dps: 0,
        armor: 0,
        fuelConsumption: "1.00",
        buildTimeSec: 10,
        buildCost: { iron: 100 },
        sensorRange: 30,
      })
      .onConflictDoUpdate({
        target: shipTypes.id,
        set: { sensorRange: 30 },
      });

    await db
      .insert(shipTypes)
      .values({
        id: "colonizer",
        name: { ru: "Колонизатор", en: "Colonizer" },
        role: "colonization",
        hp: 120,
        speed: "10.00",
        cargo: 1,
        dps: 0,
        armor: 0,
        fuelConsumption: "1.50",
        buildTimeSec: 10,
        buildCost: { iron: 100 },
        requiredBuildings: [],
        sensorRange: 10,
      })
      .onConflictDoUpdate({
        target: shipTypes.id,
        set: { role: "colonization", sensorRange: 10 },
      });
  }

  async function createSetup() {
    const user = await createTestUser();

    const [originSystem] = await db
      .insert(systems)
      .values({
        name: "Origin System",
        sectorX: 0,
        sectorY: 0,
        sectorZ: 0,
        x: "0.00",
        y: "0.00",
        z: "0.00",
        seed: 123,
        ownerId: user.id,
        isHome: true,
      })
      .returning();

    const [originPlanet] = await db
      .insert(planets)
      .values({
        systemId: originSystem.id,
        name: "Origin Planet",
        biome: "green",
        size: 15,
        slotCount: 12,
      })
      .returning();

    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: user.id,
        typeId: "scout",
        locationPlanetId: originPlanet.id,
        status: "moving",
      })
      .returning();

    return { user, originSystem, originPlanet, ship };
  }

  beforeEach(async () => {
    await db.delete(expeditions);
    await db.delete(colonies);
    await db.delete(discoveredPlanets);
    await db.delete(discoveredSystems);
    await db.delete(ships);
    await db.delete(buildings);
    await db.delete(notifications);
    await db.delete(researchProgress);
    await db.delete(productionOrders);
    await db.delete(planetResources);
    await db.delete(richness);
    await db.delete(planets);
    await db.delete(systems);
    await db.delete(users);
    await seedResources();
    await seedBuildingTypes();
    await createTestShipType();
  });

  it("should interpolate position correctly in_flight", () => {
    const expedition = {
      targetX: 100,
      targetY: 0,
      targetZ: 0,
      eta: new Date(1000000), // T=1000s
      status: "in_flight",
      result: {
        distance: 100,
        speed: 10,
        engineFactor: 1, // duration = (100 * 60 / 10) * 1 = 600s
      },
    } as any;

    const originSystem = { sectorX: 0, sectorY: 0, sectorZ: 0 };

    // startTime = 1000s - 600s = 400s (400,000ms)
    // now = 700s (700,000ms) -> progress = (700-400)/600 = 0.5

    const posStart = calculateExpeditionPosition(
      expedition,
      originSystem,
      new Date(400000),
    );
    expect(posStart.x).toBe(0);

    const posMid = calculateExpeditionPosition(
      expedition,
      originSystem,
      new Date(700000),
    );
    expect(posMid.x).toBe(50);

    const posEnd = calculateExpeditionPosition(
      expedition,
      originSystem,
      new Date(1000000),
    );
    expect(posEnd.x).toBe(100);
  });

  it("should transition from in_flight to returning upon arrival at target", async () => {
    const { ship, originPlanet } = await createSetup();

    const pastEta = new Date(Date.now() - 1000);
    const [expedition] = await db
      .insert(expeditions)
      .values({
        shipId: ship.id,
        type: "scout",
        originPlanetId: originPlanet.id,
        targetX: "100",
        targetY: "0",
        targetZ: "0",
        status: "in_flight",
        eta: pastEta,
        result: {
          distance: 100,
          speed: 10,
          engineFactor: 1,
        },
      })
      .returning();

    await processExpeditions();

    const updated = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, expedition.id),
    });
    expect(updated!.status).toBe("returning");
    expect(updated!.eta.getTime()).toBeGreaterThan(Date.now());
  });

  it("completes cargo transfers one-way instead of starting a return phase", async () => {
    const { ship, originPlanet, originSystem } = await createSetup();

    const [targetPlanet] = await db
      .insert(planets)
      .values({
        systemId: originSystem.id,
        name: "Cargo Target",
        biome: "green",
        size: 10,
        slotCount: 8,
      })
      .returning();

    await db.insert(planetResources).values({
      planetId: targetPlanet.id,
      resourceId: "iron",
      amount: "100.0000",
      regenRate: "0",
    });

    await db
      .update(ships)
      .set({ cargoJson: { iron: 50 } })
      .where(eq(ships.id, ship.id));

    const [expedition] = await db
      .insert(expeditions)
      .values({
        shipId: ship.id,
        type: "cargo_transfer",
        originPlanetId: originPlanet.id,
        targetPlanetId: targetPlanet.id,
        targetX: "1",
        targetY: "0",
        targetZ: "0",
        status: "in_flight",
        eta: new Date(Date.now() - 1000),
        result: {
          deliveryMode: "one_way",
          resources: [{ resourceId: "iron", amount: 50 }],
          loads: [{ resourceId: "iron", amount: 50 }],
          totalCargo: 50,
          maxCargo: 5000,
          distance: 1,
          speed: 10,
          engineFactor: 1,
        },
      })
      .returning();

    await processExpeditions();

    const updatedExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, expedition.id),
    });
    expect(updatedExpedition!.status).toBe("completed");

    const updatedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(updatedShip!.status).toBe("idle");
    expect(updatedShip!.locationPlanetId).toBe(targetPlanet.id);
    expect(updatedShip!.cargoJson).toEqual({});

    const targetIron = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, targetPlanet.id),
        eq(planetResources.resourceId, "iron"),
      ),
    });
    expect(Number(targetIron!.amount)).toBe(150);
  });

  it("should transition from returning to completed upon arrival at home", async () => {
    const { ship, originPlanet } = await createSetup();

    const pastEta = new Date(Date.now() - 1000);
    const [expedition] = await db
      .insert(expeditions)
      .values({
        shipId: ship.id,
        type: "scout",
        originPlanetId: originPlanet.id,
        targetX: "100",
        targetY: "0",
        targetZ: "0",
        status: "returning",
        eta: pastEta,
        result: {
          distance: 100,
          speed: 10,
          engineFactor: 1,
        },
      })
      .returning();

    await processExpeditions();

    const updatedExp = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, expedition.id),
    });
    expect(updatedExp).toBeUndefined();

    const updatedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(updatedShip!.status).toBe("idle");
    expect(updatedShip!.locationPlanetId).toBe(originPlanet.id);
  });

  it("suppresses return notifications during online expedition sync", async () => {
    const { ship, originPlanet, user } = await createSetup();

    await db.insert(expeditions).values({
      shipId: ship.id,
      type: "scout",
      originPlanetId: originPlanet.id,
      targetX: "100",
      targetY: "0",
      targetZ: "0",
      status: "returning",
      eta: new Date(Date.now() - 1000),
      result: {
        distance: 100,
        speed: 10,
        engineFactor: 1,
      },
    });

    await processExpeditions({ userId: user.id, skipNotifications: true });

    const notes = await db.query.notifications.findMany({
      where: eq(notifications.userId, user.id),
    });
    expect(notes.filter((note) => note.type === "expedition_returned")).toHaveLength(0);
  });

  it("should discover new systems/planets during travel", async () => {
    const { ship, originPlanet, user } = await createSetup();

    // System along the way at X=50
    const [midSystem] = await db
      .insert(systems)
      .values({
        name: "Mid System",
        sectorX: 50,
        sectorY: 0,
        sectorZ: 0,
        x: "50.00",
        y: "0.00",
        z: "0.00",
        seed: 789,
      })
      .returning();

    const [midPlanet] = await db
      .insert(planets)
      .values({
        systemId: midSystem.id,
        name: "Mid Planet",
        biome: "rocky",
        size: 10,
        slotCount: 8,
      })
      .returning();

    // Expedition moving from 0 to 200
    // distance = 200, speed = 10, duration = 200 * 60 / 10 = 1200s
    const now = Date.now();
    const startTime = now - 300000; // Started 5m ago (1/4 way, X=50)
    const eta = startTime + 1200000; // Will arrive in 15m

    await db.insert(expeditions).values({
      shipId: ship.id,
      type: "scout",
      originPlanetId: originPlanet.id,
      targetX: "200",
      targetY: "0",
      targetZ: "0",
      status: "in_flight",
      eta: new Date(eta),
      result: {
        distance: 200,
        speed: 10,
        engineFactor: 1,
      },
    });

    await processExpeditions();

    const discovery = await db.query.discoveredPlanets.findFirst({
      where: and(
        eq(discoveredPlanets.userId, user.id),
        eq(discoveredPlanets.planetId, midPlanet.id),
      ),
    });

    expect(discovery).toBeDefined();
  });

  it("discovers a targeted home planet when scout reaches destination", async () => {
    const user = await createTestUser();

    const [homeSystem] = await db
      .insert(systems)
      .values({
        name: "Home Scout Test",
        sectorX: 3,
        sectorY: 4,
        sectorZ: 5,
        x: "0.00",
        y: "0.00",
        z: "0.00",
        seed: 222,
        ownerId: user.id,
        isHome: true,
      })
      .returning();

    const [capital] = await db
      .insert(planets)
      .values({
        systemId: homeSystem.id,
        name: "Capital",
        biome: "green",
        size: 22,
        slotCount: 18,
      })
      .returning();

    const [lockedTarget] = await db
      .insert(planets)
      .values({
        systemId: homeSystem.id,
        name: "Survey Target",
        biome: "rocky",
        size: 12,
        slotCount: 9,
      })
      .returning();

    await db
      .insert(discoveredPlanets)
      .values({ userId: user.id, planetId: capital.id });

    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: user.id,
        typeId: "scout",
        locationPlanetId: capital.id,
        status: "moving",
      })
      .returning();

    const pastEta = new Date(Date.now() - 1000);
    await db.insert(expeditions).values({
      shipId: ship.id,
      type: "scout",
      originPlanetId: capital.id,
      targetX: "3",
      targetY: "4",
      targetZ: "5",
      targetPlanetId: lockedTarget.id,
      status: "in_flight",
      eta: pastEta,
      result: {
        distance: 10,
        speed: 10,
        engineFactor: 1,
      },
    });

    await processExpeditions();

    const discovery = await db.query.discoveredPlanets.findFirst({
      where: and(
        eq(discoveredPlanets.userId, user.id),
        eq(discoveredPlanets.planetId, lockedTarget.id),
      ),
    });
    expect(discovery).toBeDefined();
  });

  it("discovers locked home planets when a recon route passes through their visibility corridor", async () => {
    const user = await createTestUser();

    const [homeSystem] = await db
      .insert(systems)
      .values({
        name: "Home Passive Scout Test",
        sectorX: 11,
        sectorY: 12,
        sectorZ: 13,
        x: "0.00",
        y: "0.00",
        z: "0.00",
        seed: 333,
        ownerId: user.id,
        isHome: true,
      })
      .returning();

    const [capital] = await db
      .insert(planets)
      .values({
        systemId: homeSystem.id,
        name: "Capital",
        biome: "green",
        size: 22,
        slotCount: 18,
      })
      .returning();

    const [lockedTarget] = await db
      .insert(planets)
      .values({
        systemId: homeSystem.id,
        name: "Hidden Route Body",
        biome: "rocky",
        size: 12,
        slotCount: 9,
      })
      .returning();

    await db
      .insert(discoveredPlanets)
      .values({ userId: user.id, planetId: capital.id });

    const layouts = buildSystemMapLayouts(
      [
        { id: capital.id, biome: capital.biome, size: capital.size },
        {
          id: lockedTarget.id,
          biome: lockedTarget.biome,
          size: lockedTarget.size,
        },
      ],
      homeSystem.seed,
    );
    const originLayout = layouts.find((layout) => layout.id === capital.id)!;
    const targetLayout = layouts.find(
      (layout) => layout.id === lockedTarget.id,
    )!;
    const sectorDx =
      (targetLayout.x - originLayout.x) / SYSTEM_MAP_WORLD_UNITS_PER_LY;
    const sectorDy =
      (targetLayout.y - originLayout.y) / SYSTEM_MAP_WORLD_UNITS_PER_LY;

    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: user.id,
        typeId: "scout",
        locationPlanetId: capital.id,
        status: "moving",
      })
      .returning();

    await db.insert(expeditions).values({
      shipId: ship.id,
      type: "scout",
      originPlanetId: capital.id,
      targetX: (homeSystem.sectorX + sectorDx).toString(),
      targetY: (homeSystem.sectorY + sectorDy).toString(),
      targetZ: homeSystem.sectorZ.toString(),
      status: "in_flight",
      eta: new Date(Date.now() - 1000),
      result: {
        distance: Math.max(1, Math.hypot(sectorDx, sectorDy)),
        speed: 10,
        engineFactor: 1,
      },
    });

    await processExpeditions();

    const discovery = await db.query.discoveredPlanets.findFirst({
      where: and(
        eq(discoveredPlanets.userId, user.id),
        eq(discoveredPlanets.planetId, lockedTarget.id),
      ),
    });
    expect(discovery).toBeDefined();
  });

  it("discovers locked home planets when a recon route passes near their rendered footprint", async () => {
    const user = await createTestUser();

    const [homeSystem] = await db
      .insert(systems)
      .values({
        name: "Home Near Scout Test",
        sectorX: 31,
        sectorY: 32,
        sectorZ: 33,
        x: "0.00",
        y: "0.00",
        z: "0.00",
        seed: 555,
        ownerId: user.id,
        isHome: true,
      })
      .returning();

    const [capital] = await db
      .insert(planets)
      .values({
        systemId: homeSystem.id,
        name: "Capital",
        biome: "green",
        size: 22,
        slotCount: 18,
      })
      .returning();

    const [lockedTarget] = await db
      .insert(planets)
      .values({
        systemId: homeSystem.id,
        name: "Hidden Near Body",
        biome: "rocky",
        size: 12,
        slotCount: 9,
      })
      .returning();

    await db
      .insert(discoveredPlanets)
      .values({ userId: user.id, planetId: capital.id });

    const layouts = buildSystemMapLayouts(
      [
        { id: capital.id, biome: capital.biome, size: capital.size },
        {
          id: lockedTarget.id,
          biome: lockedTarget.biome,
          size: lockedTarget.size,
        },
      ],
      homeSystem.seed,
    );
    const originLayout = layouts.find((layout) => layout.id === capital.id)!;
    const targetLayout = layouts.find(
      (layout) => layout.id === lockedTarget.id,
    )!;

    const dx = targetLayout.x - originLayout.x;
    const dy = targetLayout.y - originLayout.y;
    const length = Math.hypot(dx, dy);
    const offset = 60;
    const routeEnd = {
      x: targetLayout.x + (-dy / length) * offset,
      y: targetLayout.y + (dx / length) * offset,
    };
    const sectorDx =
      (routeEnd.x - originLayout.x) / SYSTEM_MAP_WORLD_UNITS_PER_LY;
    const sectorDy =
      (routeEnd.y - originLayout.y) / SYSTEM_MAP_WORLD_UNITS_PER_LY;

    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: user.id,
        typeId: "scout",
        locationPlanetId: capital.id,
        status: "moving",
      })
      .returning();

    await db.insert(expeditions).values({
      shipId: ship.id,
      type: "scout",
      originPlanetId: capital.id,
      targetX: (homeSystem.sectorX + sectorDx).toString(),
      targetY: (homeSystem.sectorY + sectorDy).toString(),
      targetZ: homeSystem.sectorZ.toString(),
      status: "in_flight",
      eta: new Date(Date.now() - 1000),
      result: {
        distance: Math.max(1, Math.hypot(sectorDx, sectorDy)),
        speed: 10,
        engineFactor: 1,
      },
    });

    await processExpeditions();

    const discovery = await db.query.discoveredPlanets.findFirst({
      where: and(
        eq(discoveredPlanets.userId, user.id),
        eq(discoveredPlanets.planetId, lockedTarget.id),
      ),
    });
    expect(discovery).toBeDefined();
  });

  it("settles a selected home planet when a colonizer arrives", async () => {
    const user = await createTestUser();

    await db.insert(researchProgress).values([
      { userId: user.id, branch: "engineering", level: 2 },
      { userId: user.id, branch: "logistics", level: 1 },
    ]);

    const [homeSystem] = await db
      .insert(systems)
      .values({
        name: "Home Colonizer Test",
        sectorX: 21,
        sectorY: 22,
        sectorZ: 23,
        x: "0.00",
        y: "0.00",
        z: "0.00",
        seed: 444,
        ownerId: user.id,
        isHome: true,
      })
      .returning();

    const [capital] = await db
      .insert(planets)
      .values({
        systemId: homeSystem.id,
        name: "Capital",
        biome: "green",
        size: 22,
        slotCount: 18,
      })
      .returning();

    const [target] = await db
      .insert(planets)
      .values({
        systemId: homeSystem.id,
        name: "Target Colony",
        biome: "rocky",
        size: 12,
        slotCount: 9,
      })
      .returning();

    await db.insert(richness).values({
      planetId: target.id,
      resourceId: "iron",
      value: 2,
    });

    await db.insert(discoveredPlanets).values([
      { userId: user.id, planetId: capital.id },
      { userId: user.id, planetId: target.id },
    ]);

    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: user.id,
        typeId: "colonizer",
        locationPlanetId: capital.id,
        status: "moving",
      })
      .returning();

    const [expedition] = await db
      .insert(expeditions)
      .values({
        shipId: ship.id,
        type: "colonizer",
        originPlanetId: capital.id,
        targetX: homeSystem.sectorX.toString(),
        targetY: homeSystem.sectorY.toString(),
        targetZ: homeSystem.sectorZ.toString(),
        targetPlanetId: target.id,
        status: "in_flight",
        eta: new Date(Date.now() - 1000),
        result: {
          distance: 1,
          speed: 10,
          engineFactor: 1,
          returnTrip: false,
        },
      })
      .returning();

    await processExpeditions();

    const storedExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, expedition.id),
    });
    expect(storedExpedition).toBeUndefined();

    const storedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(storedShip).toBeUndefined();

    const colony = await db.query.colonies.findFirst({
      where: and(eq(colonies.ownerId, user.id), eq(colonies.planetId, target.id)),
    });
    expect(colony).toBeDefined();

    const commandCenter = await db.query.buildings.findFirst({
      where: and(
        eq(buildings.planetId, target.id),
        eq(buildings.typeId, "command_center"),
      ),
    });
    expect(commandCenter).toBeDefined();
    expect(commandCenter!.level).toBe(1);
    expect(commandCenter!.slotIndex).toBe(0);
  });
});
