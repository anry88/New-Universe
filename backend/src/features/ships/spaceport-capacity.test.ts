import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { buildings, planets, ships, systems, users } from "../../db/schema.js";
import { seedShipTypes } from "../../db/seed/ship-types.js";
import { loadLandingSlotUsage } from "./spaceport-capacity.js";
import { SHIP_STATUS_DESTROYED } from "@shared/types/combat.js";

describe("loadLandingSlotUsage", () => {
  beforeAll(async () => {
    await seedShipTypes();
  });

  it("adds landing capacity from multiple completed spaceports", async () => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
        tgUsername: `spaceport_${suffix}`,
        tgFirstName: "Spaceport",
      })
      .returning();
    const [system] = await db
      .insert(systems)
      .values({
        ownerId: user.id,
        isHome: true,
        sectorX: 1,
        sectorY: 1,
        sectorZ: 0,
        x: "0",
        y: "0",
        z: "0",
        name: `Capacity ${suffix}`,
        seed: 42,
      })
      .returning();
    const [planet] = await db
      .insert(planets)
      .values({
        systemId: system.id,
        biome: "green",
        size: 20,
        slotCount: 12,
        name: `Capacity I ${suffix}`,
      })
      .returning();

    await db.insert(buildings).values([
      { planetId: planet.id, typeId: "spaceport", slotIndex: 1, level: 1 },
      { planetId: planet.id, typeId: "spaceport", slotIndex: 2, level: 2 },
      {
        planetId: planet.id,
        typeId: "spaceport",
        slotIndex: 3,
        level: 5,
        queueAction: "build",
      },
    ]);
    await db.insert(ships).values([
      {
        ownerId: user.id,
        typeId: "scout",
        locationPlanetId: planet.id,
        status: "idle",
        cargoJson: {},
      },
      {
        ownerId: user.id,
        typeId: "scout",
        locationPlanetId: planet.id,
        status: SHIP_STATUS_DESTROYED,
        hp: 0,
        destroyedAt: new Date(),
        cargoJson: {},
      },
    ]);

    const usage = await db.transaction((tx) =>
      loadLandingSlotUsage(tx, planet.id),
    );

    expect(usage).toMatchObject({
      capacity: 3,
      occupied: 1,
      reserved: 0,
      used: 1,
      available: 2,
    });
  });
});
