import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { meRoutes } from "./routes.js";
import { authRoutes } from "../auth/routes.js";
import crypto from "crypto";
import { env } from "../../lib/env.js";
import jwt from "jsonwebtoken";
import { db } from "../../db/index.js";
import {
  expeditions,
  planets,
  ships,
  systems,
  users,
} from "../../db/schema.js";

describe("Me Routes", () => {
  const botToken = env.TELEGRAM_BOT_TOKEN;

  function createValidInitData(user: any): string {
    const authDate = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams();
    params.append("auth_date", authDate.toString());
    params.append("user", JSON.stringify(user));
    params.sort();

    const dataToCheck = Array.from(params.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const hash = crypto
      .createHmac("sha256", secretKey)
      .update(dataToCheck)
      .digest("hex");

    params.append("hash", hash);
    return params.toString();
  }

  it("should return user state when authorized", async () => {
    const app = Fastify();
    await app.register(authRoutes, { prefix: "/auth" });
    await app.register(meRoutes, { prefix: "/me" });

    const tgId = Math.floor(Math.random() * 100000000);
    const tgUser = { id: tgId, first_name: "MeTest", username: "metest" };
    const initData = createValidInitData(tgUser);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/telegram",
      headers: {
        "x-telegram-init-data": initData,
      },
    });

    const { token } = loginResponse.json();

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.tgId).toBe(tgId.toString());
    expect(body.user.ships).toBeDefined();
    expect(Array.isArray(body.user.ships)).toBe(true);
    expect(body.user.expeditions).toBeDefined();
    expect(Array.isArray(body.user.expeditions)).toBe(true);
  });

  it("should return 401 when unauthorized", async () => {
    const app = Fastify();
    await app.register(meRoutes, { prefix: "/me" });

    const response = await app.inject({
      method: "GET",
      url: "/me",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns only the current user active expeditions", async () => {
    const app = Fastify();
    await app.register(meRoutes, { prefix: "/me" });

    const [userA] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 100000000)),
        tgUsername: `me_exp_a_${Date.now()}`,
      })
      .returning();
    const [userB] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 100000000)),
        tgUsername: `me_exp_b_${Date.now()}`,
      })
      .returning();

    const [systemA] = await db
      .insert(systems)
      .values({
        name: "Me Expedition A",
        sectorX: 1,
        sectorY: 1,
        sectorZ: 1,
        x: "0.00",
        y: "0.00",
        z: "0.00",
        seed: 1,
        ownerId: userA.id,
        isHome: true,
      })
      .returning();
    const [systemB] = await db
      .insert(systems)
      .values({
        name: "Me Expedition B",
        sectorX: 2,
        sectorY: 2,
        sectorZ: 2,
        x: "0.00",
        y: "0.00",
        z: "0.00",
        seed: 2,
        ownerId: userB.id,
        isHome: true,
      })
      .returning();
    const [planetA] = await db
      .insert(planets)
      .values({
        systemId: systemA.id,
        name: "A",
        biome: "green",
        size: 10,
        slotCount: 8,
      })
      .returning();
    const [planetB] = await db
      .insert(planets)
      .values({
        systemId: systemB.id,
        name: "B",
        biome: "green",
        size: 10,
        slotCount: 8,
      })
      .returning();
    const [shipA] = await db
      .insert(ships)
      .values({
        ownerId: userA.id,
        typeId: "scout",
        locationPlanetId: planetA.id,
        status: "moving",
      })
      .returning();
    const [shipB] = await db
      .insert(ships)
      .values({
        ownerId: userB.id,
        typeId: "scout",
        locationPlanetId: planetB.id,
        status: "moving",
      })
      .returning();
    const [expeditionA] = await db
      .insert(expeditions)
      .values({
        shipId: shipA.id,
        type: "scout",
        originPlanetId: planetA.id,
        targetX: "5",
        targetY: "1",
        targetZ: "1",
        status: "in_flight",
        eta: new Date(Date.now() + 60_000),
        result: { distance: 4, speed: 1, engineFactor: 1 },
      })
      .returning();
    await db.insert(expeditions).values({
      shipId: shipB.id,
      type: "scout",
      originPlanetId: planetB.id,
      targetX: "6",
      targetY: "2",
      targetZ: "2",
      status: "in_flight",
      eta: new Date(Date.now() + 60_000),
      result: { distance: 4, speed: 1, engineFactor: 1 },
    });

    const token = jwt.sign({ userId: userA.id }, env.JWT_SECRET, {
      expiresIn: "30d",
    });
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.expeditions).toHaveLength(1);
    expect(body.user.expeditions[0].id).toBe(expeditionA.id);
  });
});
