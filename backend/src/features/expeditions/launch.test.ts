import Fastify from "fastify";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import {
  buildings,
  colonies,
  expeditions,
  discoveredSystems,
  discoveredPlanets,
  planetResources,
  planets,
  researchProgress,
  richness,
  resources,
  ships,
  shipTypes,
  systems,
  users,
} from "../../db/schema.js";
import jwt from "jsonwebtoken";
import { env } from "../../lib/env.js";
import { generateHomeSystem } from "../world/home-system-generator.js";
import { expeditionsRoutes } from "./routes.js";
import { seedResources } from "../../db/seed/resources.js";
import { seedShipTypes } from "../../db/seed/ship-types.js";
import { seedBuildingTypes } from "../../db/seed/building-types.js";
import { seedResearchCatalog } from "../../db/seed/research.js";
import { systemMapPlanetDistanceLy } from "@shared/format/systemMapLayout.js";
import { processExpeditions } from "../../workers/tick-expeditions.js";
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from "@shared/config/expeditionRouting.js";

describe("Expeditions - POST /expeditions", () => {
  beforeAll(async () => {
    await seedResources();
    await seedShipTypes();
    await seedBuildingTypes();
    await seedResearchCatalog();
  });

  async function createTestUser() {
    const app = Fastify();
    await app.register(expeditionsRoutes, { prefix: "/expeditions" });

    const tgId = BigInt(Math.floor(Math.random() * 100000000));
    const [user] = await db
      .insert(users)
      .values({
        tgId,
        tgUsername: `expedition_${Date.now()}`,
        tgFirstName: "Expedition",
      })
      .returning();

    await generateHomeSystem(user.id);

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
      expiresIn: "30d",
    });

    return { app, token, userId: user.id };
  }

  async function getHomeContext(userId: string) {
    const system = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    const planet = await db.query.planets.findFirst({
      where: eq(planets.systemId, system!.id),
    
      orderBy: (p, { asc }) => asc(p.name),
    });
    return { system: system!, planet: planet! };
  }

  async function ensureResource(planetId: string, resourceId: string, amount: number) {
    const existing = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, resourceId),
      ),
    });

    if (!existing) {
      await db.insert(planetResources).values({
        planetId,
        resourceId,
        amount: amount.toFixed(4),
        lastUpdateAt: new Date(),
        regenRate: "0",
      });
      return;
    }

    await db
      .update(planetResources)
      .set({
        amount: amount.toFixed(4),
        lastUpdateAt: new Date(),
      })
      .where(
        and(
          eq(planetResources.planetId, planetId),
          eq(planetResources.resourceId, resourceId),
        ),
      );
  }

  async function ensureFuel(planetId: string, amount: number) {
    await db
      .insert(resources)
      .values({
        id: "fuel",
        name: { ru: "fuel", en: "fuel" },
        tier: 1,
        symbol: "F",
        baseRegenRate: 0,
        defaultStorageCap: 5000,
      })
      .onConflictDoNothing();

    await ensureResource(planetId, "fuel", amount);
  }

  async function ensureJumpFuel(planetId: string, amount: number) {
    await ensureResource(planetId, JUMP_FUEL_RESOURCE_ID, amount);
  }

  async function createIdleScout(userId: string, planetId: string, fuel = "0") {
    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "scout",
        locationPlanetId: planetId,
        status: "idle",
        cargoJson: {},
        fuel,
      })
      .returning();

    return ship;
  }

  async function createIdleCargo(userId: string, planetId: string) {
    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "cargo_light",
        locationPlanetId: planetId,
        status: "idle",
        cargoJson: {},
        fuel: "0",
      })
      .returning();

    return ship;
  }

  async function createIdleColonizer(userId: string, planetId: string, fuel = "0") {
    await db
      .insert(shipTypes)
      .values({
        id: "colonizer",
        name: { ru: "Колонизатор", en: "Colonizer" },
        role: "colonization",
        hp: 120,
        speed: "1.00",
        cargo: 1,
        dps: 0,
        armor: 0,
        fuelConsumption: "1.50",
        buildTimeSec: 10,
        buildCost: { iron: 100 },
        requiredBuildings: [],
        sensorRange: 10,
      })
      .onConflictDoNothing();

    await db
      .insert(researchProgress)
      .values([
        { userId, branch: "engineering", level: 2 },
        { userId, branch: "logistics", level: 1 },
      ])
      .onConflictDoUpdate({
        target: [researchProgress.userId, researchProgress.branch],
        set: { level: 2 },
      });

    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "colonizer",
        locationPlanetId: planetId,
        status: "idle",
        cargoJson: {},
        fuel,
      })
      .returning();

    return ship;
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

  async function createKnownPublicDestination(userId: string) {
    const homeSystem = await db.query.systems.findFirst({
      where: eq(systems.ownerId, userId),
    });
    expect(homeSystem).toBeDefined();
    const sectorX = homeSystem!.sectorX + 6;
    const sectorY = homeSystem!.sectorY + 8;
    const sectorZ = homeSystem!.sectorZ;

    const [system] = await db
      .insert(systems)
      .values({
        name: `Public ${Date.now()}`,
        sectorX,
        sectorY,
        sectorZ,
        x: (Number(homeSystem!.x) + 600).toFixed(2),
        y: (Number(homeSystem!.y) + 800).toFixed(2),
        z: Number(homeSystem!.z).toFixed(2),
        seed: 98765,
        ownerId: null,
        isHome: false,
      })
      .returning();

    const insertedPlanets = await db
      .insert(planets)
      .values([
        {
          systemId: system.id,
          name: "Public I",
          biome: "rocky",
          size: 10,
          slotCount: 8,
        },
        {
          systemId: system.id,
          name: "Public II",
          biome: "green",
          size: 14,
          slotCount: 10,
        },
      ])
      .returning();

    await db
      .insert(discoveredSystems)
      .values({
        userId,
        systemId: system.id,
        source: "random_jump",
      })
      .onConflictDoNothing();

    return { system, planets: insertedPlanets };
  }

  it("should create an expedition and schedule eta", async () => {
    const { app, token, userId } = await createTestUser();
    const { system, planet } = await getHomeContext(userId);

    await ensureFuel(planet.id, 100);
    const ship = await createIdleScout(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        targetX: system.sectorX + 10,
        targetY: system.sectorY,
        targetZ: system.sectorZ,
        cargoLoaded: 10,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.expedition).toBeDefined();
    expect(body.expedition.shipId).toBe(ship.id);
    expect(body.expedition.status).toBe("in_flight");
    expect(body.expedition.eta).toBeDefined();
    expect(body.ship.status).toBe("moving");

    const stored = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, body.expedition.id),
    });
    expect(stored).toBeDefined();
    expect(stored!.status).toBe("in_flight");
    expect(stored!.shipId).toBe(ship.id);
    expect(stored!.result.fuelRequired).toBe(6);

    const fuel = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planet.id),
        eq(planetResources.resourceId, "fuel"),
      ),
    });
    expect(Number(fuel!.amount)).toBe(94);
  });

  it("should return 400 when the ship is not idle", async () => {
    const { app, token, userId } = await createTestUser();
    const { system, planet } = await getHomeContext(userId);

    await ensureFuel(planet.id, 100);
    const ship = await createIdleScout(userId, planet.id);

    await db
      .update(ships)
      .set({ status: "moving" })
      .where(eq(ships.id, ship.id));

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        targetX: system.sectorX + 20,
        targetY: system.sectorY,
        targetZ: system.sectorZ,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("already assigned");
  });

  it("should return 400 when there is not enough fuel", async () => {
    const { app, token, userId } = await createTestUser();
    const { system, planet } = await getHomeContext(userId);

    await ensureFuel(planet.id, 5);
    const ship = await createIdleScout(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        targetX: system.sectorX + 20,
        targetY: system.sectorY,
        targetZ: system.sectorZ,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("not enough fuel");
  });

  it("rejects cargo ships from the generic expedition launch flow", async () => {
    const { app, token, userId } = await createTestUser();
    const { system, planet } = await getHomeContext(userId);

    await ensureFuel(planet.id, 100);
    const ship = await createIdleCargo(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        targetX: system.sectorX + 5,
        targetY: system.sectorY,
        targetZ: system.sectorZ,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("cargo transfer");
  });

  it("should return 401 without authorization", async () => {
    const app = Fastify();
    await app.register(expeditionsRoutes, { prefix: "/expeditions" });

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      payload: {
        shipId: "00000000-0000-0000-0000-000000000000",
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("requires colonizer launches to target a discovered planet", async () => {
    const { app, token, userId } = await createTestUser();
    const { system, planet } = await getHomeContext(userId);

    await ensureFuel(planet.id, 100);
    const ship = await createIdleColonizer(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        targetX: system.sectorX,
        targetY: system.sectorY,
        targetZ: system.sectorZ,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("colonization target planet");
  });

  it("launches a colonizer one-way to a selected discovered planet", async () => {
    const { app, token, userId } = await createTestUser();
    const { system, planet } = await getHomeContext(userId);

    const targetPlanet = await db.query.planets.findFirst({
      where: eq(planets.systemId, system.id),
      orderBy: (p, { desc }) => desc(p.name),
    });
    expect(targetPlanet).toBeDefined();

    await db
      .insert(discoveredPlanets)
      .values({ userId, planetId: targetPlanet!.id })
      .onConflictDoNothing();
    await ensureFuel(planet.id, 100);
    const ship = await createIdleColonizer(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        targetX: system.sectorX,
        targetY: system.sectorY,
        targetZ: system.sectorZ,
        targetPlanetId: targetPlanet!.id,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.expedition.targetPlanetId).toBe(targetPlanet!.id);
    expect(body.expedition.result.returnTrip).toBe(false);
    const systemPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, system.id),
    });
    const expectedDistance = systemMapPlanetDistanceLy(
      systemPlanets,
      system.seed,
      planet.id,
      targetPlanet!.id,
    );
    expect(expectedDistance).not.toBeNull();
    expect(body.expedition.result.distance).toBeCloseTo(expectedDistance!, 6);
    expect(body.expedition.result.distance).toBeGreaterThan(1);
    expect(body.expedition.result.fuelRequired).toBe(
      Math.ceil(expectedDistance! * 1.5),
    );
  });

  it("launches a scout through the Jump Gate to a known public destination without trusting client coordinates", async () => {
    const { app, token, userId } = await createTestUser();
    const { planet } = await getHomeContext(userId);
    const destination = await createKnownPublicDestination(userId);

    await unlockJumpGate(userId);
    await ensureFuel(planet.id, 100);
    await ensureJumpFuel(planet.id, JUMP_GATE_JUMP_FUEL_COST);
    const ship = await createIdleScout(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        routeMode: "jump_gate",
        destinationSystemId: destination.system.id,
        targetX: 999,
        targetY: 999,
        targetZ: 999,
        targetPlanetId: destination.planets[0].id,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Number(body.expedition.targetX)).toBe(destination.system.sectorX);
    expect(Number(body.expedition.targetY)).toBe(destination.system.sectorY);
    expect(Number(body.expedition.targetZ)).toBe(destination.system.sectorZ);
    expect(body.expedition.targetPlanetId).toBe(destination.planets[0].id);
    expect(body.expedition.result.routeMode).toBe("jump_gate");
    expect(body.expedition.result.destinationSystemId).toBe(destination.system.id);
    expect(body.expedition.result.jumpFuelRequired).toBe(50);
    expect(body.expedition.result.distance).toBe(10);
    expect(body.expedition.result.fuelRequired).toBe(6);
    const jumpFuel = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planet.id),
        eq(planetResources.resourceId, JUMP_FUEL_RESOURCE_ID),
      ),
    });
    expect(Number(jumpFuel!.amount)).toBe(0);
  });

  it("launches a colonizer through the Jump Gate and lets the worker found the target colony", async () => {
    const { app, token, userId } = await createTestUser();
    const { planet } = await getHomeContext(userId);
    const destination = await createKnownPublicDestination(userId);
    const targetPlanet = destination.planets[1];

    await unlockJumpGate(userId);
    await db
      .insert(discoveredPlanets)
      .values({ userId, planetId: targetPlanet.id })
      .onConflictDoNothing();
    await db.insert(richness).values({
      planetId: targetPlanet.id,
      resourceId: "iron",
      value: 2,
    });
    await ensureFuel(planet.id, 100);
    await ensureJumpFuel(planet.id, JUMP_GATE_JUMP_FUEL_COST);
    const ship = await createIdleColonizer(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        routeMode: "jump_gate",
        destinationSystemId: destination.system.id,
        targetPlanetId: targetPlanet.id,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.expedition.result.returnTrip).toBe(false);
    expect(body.expedition.result.fuelRequired).toBe(15);

    await db
      .update(expeditions)
      .set({ eta: new Date(Date.now() - 1000) })
      .where(eq(expeditions.id, body.expedition.id));

    await processExpeditions({ userId, skipNotifications: true });

    const storedExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, body.expedition.id),
    });
    expect(storedExpedition).toBeUndefined();

    const storedShip = await db.query.ships.findFirst({
      where: eq(ships.id, ship.id),
    });
    expect(storedShip).toBeUndefined();

    const colony = await db.query.colonies.findFirst({
      where: and(eq(colonies.ownerId, userId), eq(colonies.planetId, targetPlanet.id)),
    });
    expect(colony).toBeDefined();

    const commandCenter = await db.query.buildings.findFirst({
      where: and(
        eq(buildings.planetId, targetPlanet.id),
        eq(buildings.typeId, "command_center"),
      ),
    });
    expect(commandCenter).toBeDefined();
  });

  it("rejects Jump Gate routes without stored Jump Fuel on the launch planet", async () => {
    const { app, token, userId } = await createTestUser();
    const { planet } = await getHomeContext(userId);
    const destination = await createKnownPublicDestination(userId);

    await unlockJumpGate(userId);
    await ensureFuel(planet.id, 100);
    await ensureJumpFuel(planet.id, JUMP_GATE_JUMP_FUEL_COST - 1);
    const ship = await createIdleScout(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        routeMode: "jump_gate",
        destinationSystemId: destination.system.id,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("not enough jump fuel");
  });

  it("rejects Jump Gate colonization of an undiscovered target planet", async () => {
    const { app, token, userId } = await createTestUser();
    const { planet } = await getHomeContext(userId);
    const destination = await createKnownPublicDestination(userId);

    await unlockJumpGate(userId);
    await ensureFuel(planet.id, 100);
    const ship = await createIdleColonizer(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        routeMode: "jump_gate",
        destinationSystemId: destination.system.id,
        targetPlanetId: destination.planets[0].id,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Scout this planet");
  });

  it("rejects Jump Gate routes to stale foreign home-system destinations", async () => {
    const { app, token, userId } = await createTestUser();
    const { planet } = await getHomeContext(userId);
    const [otherUser] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 100000000)),
        tgUsername: `foreign_${Date.now()}`,
      })
      .returning();
    const [foreignHome] = await db
      .insert(systems)
      .values({
        name: "Foreign Home",
        sectorX: 3,
        sectorY: 4,
        sectorZ: 0,
        x: "300.00",
        y: "400.00",
        z: "0.00",
        seed: 12345,
        ownerId: otherUser.id,
        isHome: true,
      })
      .returning();

    await db
      .insert(discoveredSystems)
      .values({
        userId,
        systemId: foreignHome.id,
        source: "sensor",
      })
      .onConflictDoNothing();
    await unlockJumpGate(userId);
    await ensureFuel(planet.id, 100);
    const ship = await createIdleScout(userId, planet.id);

    const response = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: ship.id,
        routeMode: "jump_gate",
        destinationSystemId: foreignHome.id,
        cargoLoaded: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("public common system");
  });
});
