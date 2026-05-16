import { describe, expect, it } from "vitest";
import type { Ship } from "@shared/types/ships";
import {
  isShipReadyForOrders,
  mergeShipBuildQueue,
  queueItemFromBuildingShip,
} from "./ship-queue";

function ship(overrides: Partial<Ship>): Ship {
  return {
    id: "ship-1",
    ownerId: "user-1",
    typeId: "scout",
    locationPlanetId: "planet-1",
    fuel: "100",
    jumpFuel: "100",
    refuelFuel: "0",
    refuelJumpFuel: "0",
    status: "idle",
    cargoJson: {},
    hp: 1,
    maxHp: 1,
    combatStats: { targetClass: "military_light" },
    ...overrides,
  };
}

describe("ship queue helpers", () => {
  it("does not allow orders for a building ship without a queue row", () => {
    const buildingShip = ship({ status: "building" });

    expect(queueItemFromBuildingShip(buildingShip)).toBeNull();
    expect(isShipReadyForOrders(buildingShip)).toBe(false);
  });

  it("keeps a building ship queued even before /ships/queue returns it", () => {
    const buildingShip = ship({
      status: "building",
      queueCompletesAt: "2026-01-01T00:10:00.000Z",
      queueStartedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(queueItemFromBuildingShip(buildingShip)).toMatchObject({
      id: "ship-1",
      planetId: "planet-1",
      typeId: "scout",
      status: "building",
      queueCompletesAt: "2026-01-01T00:10:00.000Z",
      queueStartedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(mergeShipBuildQueue([], [buildingShip])).toHaveLength(1);
  });

  it("prefers authoritative queue rows when both sources contain a ship", () => {
    const buildingShip = ship({
      status: "building",
      queueCompletesAt: "2026-01-01T00:10:00.000Z",
      queueStartedAt: "2026-01-01T00:00:00.000Z",
    });

    const merged = mergeShipBuildQueue(
      [
        {
          id: "ship-1",
          planetId: "planet-2",
          typeId: "scout",
          status: "building",
          queueCompletesAt: "2026-01-01T00:08:00.000Z",
          queueStartedAt: "2026-01-01T00:01:00.000Z",
          rushCost: 3,
        },
      ],
      [buildingShip],
    );

    expect(merged).toEqual([
      {
        id: "ship-1",
        planetId: "planet-2",
        typeId: "scout",
        status: "building",
        queueCompletesAt: "2026-01-01T00:08:00.000Z",
        queueStartedAt: "2026-01-01T00:01:00.000Z",
        rushCost: 3,
      },
    ]);
  });
});
