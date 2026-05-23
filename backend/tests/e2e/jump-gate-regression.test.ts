/**
 * Jump Gate regression gate (task P2.3-508): one synthetic player unlocks the
 * gate, performs random and known-destination jumps, discovers and colonizes a
 * Common Pool planet, then delivers cargo through the gate.
 */
import Fastify from "fastify";
import crypto from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import {
  buildings,
  colonies,
  discoveredPlanets,
  discoveredSystems,
  expeditions,
  planetResources,
  planets,
  researchProgress,
  richness,
  ships,
  systems,
  users,
} from "../../src/db/schema.js";
import { seedResources } from "../../src/db/seed/resources.js";
import { seedResearchCatalog } from "../../src/db/seed/research.js";
import { seedBuildingTypes } from "../../src/db/seed/building-types.js";
import { seedShipTypes } from "../../src/db/seed/ship-types.js";
import { authRoutes } from "../../src/features/auth/routes.js";
import { meRoutes } from "../../src/features/me/routes.js";
import { expeditionsRoutes } from "../../src/features/expeditions/routes.js";
import { jumpGateRoutes } from "../../src/features/jump-gate/routes.js";
import { multiplayerRoutes } from "../../src/routes/multiplayer.js";
import { cargoRoutes } from "../../src/routes/cargo.js";
import { processExpeditions } from "../../src/workers/tick-expeditions.js";
import { processArriveCargo } from "../../src/workers/cargo-routes.js";
import { env } from "../../src/lib/env.js";
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from "@shared/config/expeditionRouting.js";
import { SHIP_STATUS_DESTROYED } from "@shared/types/combat.js";
import {
  buildSystemMapLayouts,
  systemMapJumpGatePoint,
  systemMapPointDistanceLy,
} from "@shared/format/systemMapLayout.js";

const AREA = {
  cargo: "[JumpGate:Cargo]",
  colonization: "[JumpGate:Colonization]",
  discovery: "[JumpGate:Discovery]",
  jump: "[JumpGate:Jump]",
  visibility: "[JumpGate:Visibility]",
} as const;

function createValidInitData(user: {
  id: number;
  first_name: string;
  username: string;
}): string {
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
    .update(env.TELEGRAM_BOT_TOKEN)
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataToCheck)
    .digest("hex");
  params.append("hash", hash);
  return params.toString();
}

async function setPlanetResource(
  planetId: string,
  resourceId: string,
  amount: number,
): Promise<void> {
  await db
    .insert(planetResources)
    .values({
      planetId,
      resourceId,
      amount: amount.toString(),
      regenRate: "0",
    })
    .onConflictDoUpdate({
      target: [planetResources.planetId, planetResources.resourceId],
      set: {
        amount: amount.toString(),
        regenRate: "0",
      },
    });
}

async function planetAmount(
  planetId: string,
  resourceId: string,
): Promise<number> {
  const row = await db.query.planetResources.findFirst({
    where: and(
      eq(planetResources.planetId, planetId),
      eq(planetResources.resourceId, resourceId),
    ),
  });
  return Number(row?.amount ?? 0);
}

async function setResearchLevel(
  userId: string,
  branch: string,
  level: number,
): Promise<void> {
  await db
    .insert(researchProgress)
    .values({ userId, branch, level })
    .onConflictDoUpdate({
      target: [researchProgress.userId, researchProgress.branch],
      set: { level, completesAt: null },
    });
}

async function rowsForUserPlanet(
  table: "colonies" | "discoveredPlanets",
  userId: string,
  planetId: string,
): Promise<unknown[]> {
  if (table === "colonies") {
    return db.query.colonies.findMany({
      where: and(eq(colonies.ownerId, userId), eq(colonies.planetId, planetId)),
    });
  }

  return db.query.discoveredPlanets.findMany({
    where: and(
      eq(discoveredPlanets.userId, userId),
      eq(discoveredPlanets.planetId, planetId),
    ),
  });
}

describe("Jump Gate end-to-end regression suite", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    await seedResources();
    await seedResearchCatalog();
    await seedBuildingTypes();
    await seedShipTypes();

    app = Fastify();
    await app.register(authRoutes, { prefix: "/auth" });
    await app.register(meRoutes, { prefix: "/me" });
    await app.register(expeditionsRoutes, { prefix: "/expeditions" });
    await app.register(jumpGateRoutes, { prefix: "/jump-gate" });
    await app.register(multiplayerRoutes, { prefix: "/multiplayer" });
    await app.register(cargoRoutes, { prefix: "/cargo" });
  });

  it("full path: unlock -> random jump -> known destination -> discovery/colonization -> cargo delivery", async () => {
    const tgId = Math.floor(Math.random() * 1_000_000_000);
    const initData = createValidInitData({
      id: tgId,
      first_name: "JumpGateRegress",
      username: `jump_gate_reg_${tgId}`,
    });

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/telegram",
      headers: { "x-telegram-init-data": initData },
    });
    expect(loginRes.statusCode, `${AREA.jump} login`).toBe(200);
    const { token, user } = loginRes.json() as {
      token: string;
      user: { id: string };
    };
    const userId = user.id;

    const homeSystem = await db.query.systems.findFirst({
      where: and(eq(systems.ownerId, userId), eq(systems.isHome, true)),
    });
    expect(homeSystem, `${AREA.jump} home system`).toBeDefined();
    if (!homeSystem) {
      throw new Error(`${AREA.jump} home system missing`);
    }
    await db
      .update(systems)
      .set({ x: "0.00", y: "0.00", z: "0.00" })
      .where(eq(systems.id, homeSystem.id));
    const homePlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, homeSystem.id),
    });
    const [homePlanet] = homePlanets.sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    expect(homePlanet, `${AREA.jump} home capital`).toBeDefined();
    if (!homePlanet) {
      throw new Error(`${AREA.jump} home capital missing`);
    }

    await setResearchLevel(userId, "jump_drive", 1);
    await setResearchLevel(userId, "engineering", 2);
    await setResearchLevel(userId, "logistics", 1);
    await setPlanetResource(homePlanet.id, "iron", 2_000);
    await setPlanetResource(homePlanet.id, "fuel", 1_000);
    await setPlanetResource(homePlanet.id, JUMP_FUEL_RESOURCE_ID, 500);

    const [reconProbe] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "recon_probe",
        locationPlanetId: homePlanet.id,
        status: "idle",
        fuel: "100",
      })
      .returning();

    const randomJumpRes = await app.inject({
      method: "POST",
      url: "/jump-gate/random-jump",
      headers: { authorization: `Bearer ${token}` },
      payload: { shipId: reconProbe.id },
    });
    expect(
      randomJumpRes.statusCode,
      `${AREA.jump} POST /jump-gate/random-jump`,
    ).toBe(200);
    const randomJump = randomJumpRes.json() as {
      ship: { id: string; status: string; locationPlanetId: string | null };
      queueItem: { id: string; completesAt: string };
      jumpFuelRequired: number;
    };
    expect(
      randomJump.ship.status,
      `${AREA.jump} random probe is in flight before gate arrival`,
    ).toBe("moving");
    const pendingRandomExpedition = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, randomJump.queueItem.id),
    });
    const pendingRandomResult = pendingRandomExpedition?.result as
      | Record<string, unknown>
      | undefined;
    const openedSystemId =
      typeof pendingRandomResult?.pendingRandomDiscoverySystemId === "string"
        ? pendingRandomResult.pendingRandomDiscoverySystemId
        : null;
    expect(openedSystemId, `${AREA.jump} pending random destination id`).toBeTruthy();
    const beforeGateArrival = await db.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, userId),
        eq(discoveredSystems.systemId, openedSystemId!),
      ),
    });
    expect(
      beforeGateArrival,
      `${AREA.jump} destination is not opened before gate arrival`,
    ).toBeUndefined();
    expect(
      randomJump.jumpFuelRequired,
      `${AREA.jump} random jump fuel cost`,
    ).toBe(JUMP_GATE_JUMP_FUEL_COST);
    expect(
      await planetAmount(homePlanet.id, JUMP_FUEL_RESOURCE_ID),
      `${AREA.jump} home Jump Fuel debited`,
    ).toBe(500 - JUMP_GATE_JUMP_FUEL_COST);
    expect(
      await db.query.ships.findFirst({ where: eq(ships.id, reconProbe.id) }),
      `${AREA.jump} recon probe remains in flight before gate arrival`,
    ).toMatchObject({ status: "moving", locationPlanetId: null });

    await processExpeditions({
      userId,
      now: new Date(randomJump.queueItem.completesAt),
      onlyDue: true,
      skipNotifications: true,
    });
    const openedDestination = await db.query.discoveredSystems.findFirst({
      where: and(
        eq(discoveredSystems.userId, userId),
        eq(discoveredSystems.systemId, openedSystemId!),
      ),
    });
    expect(
      openedDestination?.source,
      `${AREA.jump} destination source after gate arrival`,
    ).toBe("random_jump");
    expect(
      openedDestination?.lastVisitedAt?.toISOString(),
      `${AREA.jump} destination visit timestamp after gate arrival`,
    ).toBe(randomJump.queueItem.completesAt);
    const consumedProbe = await db.query.ships.findFirst({
      where: eq(ships.id, reconProbe.id),
    });
    expect(
      consumedProbe?.status,
      `${AREA.jump} recon probe consumed after opening a system`,
    ).toBe(SHIP_STATUS_DESTROYED);
    expect(consumedProbe?.destroyedAt).not.toBeNull();
    const completedRandomJump = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, randomJump.queueItem.id),
    });
    expect(completedRandomJump?.status).toBe("completed");
    expect(completedRandomJump?.returnedAt).not.toBeNull();

    const openedSystem = await db.query.systems.findFirst({
      where: eq(systems.id, openedSystemId!),
    });
    if (!openedSystem) {
      throw new Error(`${AREA.jump} opened public system missing`);
    }

    const [knownJumpShip] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "scout",
        locationPlanetId: homePlanet.id,
        status: "idle",
        fuel: "100",
      })
      .returning();
    const knownJumpRes = await app.inject({
      method: "POST",
      url: `/jump-gate/destinations/${openedSystemId}/jump`,
      headers: { authorization: `Bearer ${token}` },
      payload: { shipId: knownJumpShip.id },
    });
    expect(
      knownJumpRes.statusCode,
      `${AREA.jump} POST /jump-gate/destinations/:systemId/jump`,
    ).toBe(200);
    const knownJump = knownJumpRes.json() as {
      destination: {
        systemId: string;
        source: string;
        lastVisitedAt: string | null;
      };
      targetSystem: { id: string };
    };
    expect(
      knownJump.targetSystem.id,
      `${AREA.jump} repeat destination system`,
    ).toBe(openedSystemId);
    expect(
      knownJump.destination.lastVisitedAt,
      `${AREA.jump} repeat visit timestamp`,
    ).not.toBeNull();

    const targetSystem = await db.query.systems.findFirst({
      where: eq(systems.id, openedSystemId!),
    });
    expect(targetSystem?.isHome, `${AREA.visibility} target is not home`).toBe(
      false,
    );
    expect(
      targetSystem?.ownerId,
      `${AREA.visibility} target is public`,
    ).toBeNull();
    if (!targetSystem) {
      throw new Error(`${AREA.visibility} target system missing`);
    }
    await db
      .update(systems)
      .set({ x: "100.00", y: "100.00", z: "0.00" })
      .where(eq(systems.id, openedSystemId!));
    const targetPlanets = await db.query.planets.findMany({
      where: eq(planets.systemId, openedSystemId!),
    });
    const targetPlanetLayouts = buildSystemMapLayouts(
      targetPlanets,
      Number(targetSystem.seed),
    );
    const targetPlanetById = new Map(
      targetPlanets.map((planet) => [planet.id, planet]),
    );
    const targetPlanet = [...targetPlanetLayouts]
      .sort(
        (a, b) =>
          systemMapPointDistanceLy(systemMapJumpGatePoint(), a) -
          systemMapPointDistanceLy(systemMapJumpGatePoint(), b),
      )
      .map((layout) => targetPlanetById.get(layout.id))
      .find(Boolean);
    expect(
      targetPlanet,
      `${AREA.discovery} target common planet`,
    ).toBeDefined();
    if (!targetPlanet) {
      throw new Error(`${AREA.discovery} target common planet missing`);
    }

    const [foreignUser] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
        tgUsername: `foreign_home_${tgId}`,
      })
      .returning();
    const [foreignHomeSystem] = await db
      .insert(systems)
      .values({
        ownerId: foreignUser.id,
        isHome: true,
        sectorX: openedSystem.sectorX,
        sectorY: openedSystem.sectorY,
        sectorZ: openedSystem.sectorZ,
        x: "12.00",
        y: "24.00",
        z: "0.00",
        name: "Filtered Foreign Home",
        seed: 880055,
      })
      .returning();
    await db.insert(planets).values({
      systemId: foreignHomeSystem.id,
      biome: "green",
      size: 11,
      slotCount: 8,
      name: "Filtered Foreign Capital",
    });
    await db
      .insert(discoveredSystems)
      .values({
        userId,
        systemId: foreignHomeSystem.id,
        source: "sensor",
      })
      .onConflictDoNothing();

    const stateRes = await app.inject({
      method: "GET",
      url: "/jump-gate/state",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(stateRes.statusCode, `${AREA.visibility} GET /jump-gate/state`).toBe(
      200,
    );
    const gateState = stateRes.json() as {
      knownDestinations: { systemId: string }[];
    };
    expect(
      gateState.knownDestinations.some(
        (destination) =>
          destination.systemId === openedSystemId,
      ),
      `${AREA.visibility} random public destination remains known`,
    ).toBe(true);
    expect(
      gateState.knownDestinations.some(
        (destination) => destination.systemId === foreignHomeSystem.id,
      ),
      `${AREA.visibility} stale foreign Home System excluded from common destination payload`,
    ).toBe(false);

    const sectorAnchorsRes = await app.inject({
      method: "GET",
      url: "/multiplayer/systems",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      sectorAnchorsRes.statusCode,
      `${AREA.visibility} GET /multiplayer/systems`,
    ).toBe(200);
    const sectorAnchors = sectorAnchorsRes.json() as {
      systems: { systemId: string }[];
    };
    expect(
      sectorAnchors.systems.some(
        (anchor) => anchor.systemId === foreignHomeSystem.id,
      ),
      `${AREA.visibility} stale foreign Home System excluded from sector anchors`,
    ).toBe(false);

    const sectorPresenceRes = await app.inject({
      method: "GET",
      url: `/multiplayer/sectors/${openedSystem.sectorX}/${openedSystem.sectorY}/${openedSystem.sectorZ}/presence`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      sectorPresenceRes.statusCode,
      `${AREA.visibility} GET /multiplayer/sectors/:sx/:sy/:sz/presence`,
    ).toBe(200);
    const sectorPresence = sectorPresenceRes.json() as {
      entities: { systemId: string }[];
    };
    expect(
      sectorPresence.entities.some(
        (entity) => entity.systemId === foreignHomeSystem.id,
      ),
      `${AREA.visibility} foreign Home System excluded from sector presence`,
    ).toBe(false);

    const [scout] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "scout",
        locationPlanetId: homePlanet.id,
        status: "idle",
        fuel: "100",
      })
      .returning();
    const scoutRes = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: scout.id,
        routeMode: "jump_gate",
        destinationSystemId: openedSystemId,
        targetPlanetId: targetPlanet.id,
        cargoLoaded: 0,
      },
    });
    expect(
      scoutRes.statusCode,
      `${AREA.discovery} scout through Jump Gate`,
    ).toBe(200);
    const scoutExpedition = (
      scoutRes.json() as {
        expedition: { id: string; result: { routeMode: string } };
      }
    ).expedition;
    expect(
      scoutExpedition.result.routeMode,
      `${AREA.discovery} scout route mode`,
    ).toBe("jump_gate");
    await db
      .update(expeditions)
      .set({ eta: new Date(Date.now() - 1_000) })
      .where(eq(expeditions.id, scoutExpedition.id));
    await processExpeditions({ userId, skipNotifications: true });
    await processExpeditions({ userId, skipNotifications: true });
    const meAfterScout = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      meAfterScout.statusCode,
      `${AREA.discovery} online sync after scout`,
    ).toBe(200);
    expect(
      await rowsForUserPlanet("discoveredPlanets", userId, targetPlanet.id),
      `${AREA.discovery} target discovery is idempotent`,
    ).toHaveLength(1);

    await setResearchLevel(userId, "jump_drive", 1);
    await setResearchLevel(userId, "engineering", 2);
    await setResearchLevel(userId, "logistics", 1);
    await db
      .insert(discoveredSystems)
      .values({
        userId,
        systemId: openedSystemId,
        source: "random_jump",
        lastVisitedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [discoveredSystems.userId, discoveredSystems.systemId],
        set: { source: "random_jump", lastVisitedAt: new Date() },
      });
    await db
      .insert(discoveredPlanets)
      .values({ userId, planetId: targetPlanet.id })
      .onConflictDoNothing();
    await db.delete(buildings).where(eq(buildings.planetId, targetPlanet.id));
    await db.delete(colonies).where(eq(colonies.planetId, targetPlanet.id));
    await db
      .insert(richness)
      .values({
        planetId: targetPlanet.id,
        resourceId: "iron",
        value: 3,
      })
      .onConflictDoUpdate({
        target: [richness.planetId, richness.resourceId],
        set: { value: 3 },
      });
    const [colonizer] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "colonizer",
        locationPlanetId: homePlanet.id,
        status: "idle",
        fuel: "80",
        jumpFuel: JUMP_GATE_JUMP_FUEL_COST.toString(),
      })
      .returning();
    const colonizerRes = await app.inject({
      method: "POST",
      url: "/expeditions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: colonizer.id,
        routeMode: "jump_gate",
        destinationSystemId: openedSystemId,
        targetPlanetId: targetPlanet.id,
        cargoLoaded: 0,
      },
    });
    expect(
      colonizerRes.statusCode,
      `${AREA.colonization} colonizer through Jump Gate: ${colonizerRes.body}`,
    ).toBe(200);
    const colonizerExpedition = (
      colonizerRes.json() as {
        expedition: { id: string; result: { routeMode: string } };
      }
    ).expedition;
    expect(
      colonizerExpedition.result.routeMode,
      `${AREA.colonization} colonizer route mode`,
    ).toBe("jump_gate");
    await db
      .update(expeditions)
      .set({ eta: new Date(Date.now() - 1_000) })
      .where(eq(expeditions.id, colonizerExpedition.id));
    await processExpeditions({ userId, skipNotifications: true });
    await processExpeditions({ userId, skipNotifications: true });
    const meAfterColonizer = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      meAfterColonizer.statusCode,
      `${AREA.colonization} online sync after colonizer`,
    ).toBe(200);
    expect(
      await rowsForUserPlanet("colonies", userId, targetPlanet.id),
      `${AREA.colonization} colony row is idempotent`,
    ).toHaveLength(1);
    const commandCenters = await db.query.buildings.findMany({
      where: and(
        eq(buildings.planetId, targetPlanet.id),
        eq(buildings.typeId, "command_center"),
      ),
    });
    expect(
      commandCenters,
      `${AREA.colonization} command center bootstrap is single`,
    ).toHaveLength(1);

    const [cargoShip] = await db
      .insert(ships)
      .values({
        ownerId: userId,
        typeId: "cargo_light",
        locationPlanetId: homePlanet.id,
        status: "idle",
        fuel: "100",
      })
      .returning();
    const targetIronBefore = await planetAmount(targetPlanet.id, "iron");
    const cargoAmount = 25;
    const cargoRes = await app.inject({
      method: "POST",
      url: "/cargo/transfer",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        shipId: cargoShip.id,
        targetPlanetId: targetPlanet.id,
        routeMode: "jump_gate",
        resources: [{ resourceId: "iron", amount: cargoAmount }],
      },
    });
    expect(
      cargoRes.statusCode,
      `${AREA.cargo} cargo transfer through Jump Gate: ${cargoRes.body}`,
    ).toBe(200);
    const cargoExpedition = (
      cargoRes.json() as {
        expedition: { id: string; result: { routeMode: string } };
      }
    ).expedition;
    expect(
      cargoExpedition.result.routeMode,
      `${AREA.cargo} cargo route mode`,
    ).toBe("jump_gate");
    await db
      .update(expeditions)
      .set({ eta: new Date(Date.now() - 1_000) })
      .where(eq(expeditions.id, cargoExpedition.id));
    await processArriveCargo({
      id: `p2-3-508-cargo-${cargoExpedition.id}-1`,
      data: { expeditionId: cargoExpedition.id, shipId: cargoShip.id },
    });
    await processArriveCargo({
      id: `p2-3-508-cargo-${cargoExpedition.id}-2`,
      data: { expeditionId: cargoExpedition.id, shipId: cargoShip.id },
    });
    const meAfterCargo = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      meAfterCargo.statusCode,
      `${AREA.cargo} online sync after cargo`,
    ).toBe(200);
    expect(
      await planetAmount(targetPlanet.id, "iron"),
      `${AREA.cargo} repeated cargo worker delivers exactly once`,
    ).toBeCloseTo(targetIronBefore + cargoAmount, 4);
    const storedCargo = await db.query.expeditions.findFirst({
      where: eq(expeditions.id, cargoExpedition.id),
    });
    expect(
      storedCargo?.status,
      `${AREA.cargo} cargo expedition completed`,
    ).toBe("completed");
  });
});
