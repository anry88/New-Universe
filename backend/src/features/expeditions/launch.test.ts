import Fastify from "fastify";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import {
  expeditions,
  discoveredPlanets,
  planetResources,
  planets,
  researchProgress,
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
import { systemMapPlanetDistanceLy } from "@shared/format/systemMapLayout.js";

describe("Expeditions - POST /expeditions", () => {
  beforeAll(async () => {
    await seedResources();
    await seedShipTypes();
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

    const existing = await db.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, planetId),
        eq(planetResources.resourceId, "fuel"),
      ),
    });

    if (!existing) {
      await db.insert(planetResources).values({
        planetId,
        resourceId: "fuel",
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
          eq(planetResources.resourceId, "fuel"),
        ),
      );
  }

  async function createIdleScout(userId: string, planetId: string) {
    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "scout",
        locationPlanetId: planetId,
        status: "idle",
        cargoJson: {},
        fuel: "0",
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

  async function createIdleColonizer(userId: string, planetId: string) {
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
        fuel: "0",
      })
      .returning();

    return ship;
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
    expect(response.json().error).toContain("idle");
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
    expect(response.json().error).toContain("targetPlanetId");
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
});
