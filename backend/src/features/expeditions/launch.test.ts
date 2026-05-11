import Fastify from "fastify";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import {
  expeditions,
  planetResources,
  planets,
  resources,
  ships,
  systems,
  users,
} from "../../db/schema.js";
import jwt from "jsonwebtoken";
import { env } from "../../lib/env.js";
import { generateHomeSystem } from "../world/home-system-generator.js";
import { expeditionsRoutes } from "./routes.js";

describe("Expeditions - POST /expeditions", () => {
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
});
