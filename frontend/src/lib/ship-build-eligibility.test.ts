import { describe, expect, it } from "vitest";

import type { ResearchProgress } from "@shared/types/research";
import {
  formatShipBuildErrorMessage,
  type Ship,
  type ShipType,
} from "@shared/types/ships";
import type { Expedition } from "@shared/types/expeditions";
import type { Planet } from "@shared/types/world";
import {
  estimateLandingSlotUsage,
  resolveShipBuildBlockedReason,
} from "./ship-build-eligibility";

const cargoLight: ShipType = {
  id: "cargo_light",
  name: { en: "Lightweight Transporter", ru: "Лёгкий транспорт" },
  role: "logistics",
  hp: 60,
  speed: "1.20",
  cargo: 5000,
  dps: 0,
  armor: 0,
  fuelConsumption: "0.80",
  buildTimeSec: 1200,
  buildCost: { iron: 500, silicon: 300, carbon: 200, methane: 100 },
  requiredBuildings: [{ typeId: "shipyard", level: 2 }],
  sensorRange: 8,
  fuelCapacity: 5000,
  jumpFuelCapacity: 100,
  combatStats: { targetClass: "military_light" },
};

const basePlanet: Planet = {
  id: "planet-1",
  systemId: "system-1",
  biome: "green",
  size: 20,
  slotCount: 20,
  name: "home-1",
  buildings: [{ id: "yard-1", planetId: "planet-1", typeId: "shipyard", level: 1, slotIndex: 2 }],
  resources: [
    { planetId: "planet-1", resourceId: "iron", amount: "500", regenRate: "0", storageCap: "5000", lastUpdateAt: new Date().toISOString() },
    { planetId: "planet-1", resourceId: "silicon", amount: "300", regenRate: "0", storageCap: "5000", lastUpdateAt: new Date().toISOString() },
    { planetId: "planet-1", resourceId: "carbon", amount: "200", regenRate: "0", storageCap: "5000", lastUpdateAt: new Date().toISOString() },
    { planetId: "planet-1", resourceId: "methane", amount: "100", regenRate: "0", storageCap: "5000", lastUpdateAt: new Date().toISOString() },
  ],
};

const logisticsResearch: ResearchProgress[] = [
  { userId: "user-1", branch: "logistics", level: 1, completesAt: null },
];

describe("resolveShipBuildBlockedReason", () => {
  it("blocks cargo_light until shipyard level 2", () => {
    expect(resolveShipBuildBlockedReason(basePlanet, cargoLight)).toEqual({
      type: "missingBuilding",
      typeId: "shipyard",
      requiredLevel: 2,
      currentLevel: 1,
    });
  });

  it("blocks when the selected planet lacks a build-cost resource", () => {
    const planet = {
      ...basePlanet,
      buildings: [{ id: "yard-1", planetId: "planet-1", typeId: "shipyard", level: 2, slotIndex: 2 }],
      resources: basePlanet.resources?.map((resource) =>
        resource.resourceId === "methane" ? { ...resource, amount: "90" } : resource,
      ),
    };

    expect(resolveShipBuildBlockedReason(planet, cargoLight, logisticsResearch)).toEqual({
      type: "insufficientResource",
      resourceId: "methane",
      required: 100,
      available: 90,
    });
  });

  it("allows cargo_light at shipyard level 2 with enough capital resources", () => {
    const planet = {
      ...basePlanet,
      buildings: [{ id: "yard-1", planetId: "planet-1", typeId: "shipyard", level: 2, slotIndex: 2 }],
    };

    expect(resolveShipBuildBlockedReason(planet, cargoLight, logisticsResearch)).toBeNull();
  });

  it("blocks cargo_light at shipyard level 2 until Logistics research level 1", () => {
    const planet = {
      ...basePlanet,
      buildings: [{ id: "yard-1", planetId: "planet-1", typeId: "shipyard", level: 2, slotIndex: 2 }],
    };

    expect(resolveShipBuildBlockedReason(planet, cargoLight)).toEqual({
      type: "missingResearch",
      branch: "logistics",
      requiredLevel: 1,
      currentLevel: 0,
    });
  });

  it("formats shipyard API blockers with localized entity names", () => {
    const missingBuilding = formatShipBuildErrorMessage({
      code: "ship_build_missing_building",
      typeId: "shipyard",
      requiredLevel: 2,
    }, "en");
    const insufficientResource = formatShipBuildErrorMessage({
      code: "insufficient_resource",
      resourceId: "methane",
      required: 100,
      available: 90,
    }, "ru");

    expect(missingBuilding).toBe("Requires Shipyard level 2.");
    expect(missingBuilding).not.toContain("shipyard");
    expect(insufficientResource).toBe("Не хватает ресурса: Метан.");
    expect(insufficientResource).not.toContain("methane");
  });

  it("blocks combat ships requiring military_shipyard", () => {
    const fighter: ShipType = {
      ...cargoLight,
      id: "medium_fighter",
      requiredBuildings: [{ typeId: "military_shipyard", level: 1 }],
    };
    expect(resolveShipBuildBlockedReason(basePlanet, fighter)).toEqual({
      type: "missingBuilding",
      typeId: "military_shipyard",
      requiredLevel: 1,
      currentLevel: 0,
    });
  });

  it("blocks when another ship is already building on the planet", () => {
    const planet = {
      ...basePlanet,
      buildings: [
        { id: "yard-1", planetId: "planet-1", typeId: "shipyard", level: 2, slotIndex: 2 },
        { id: "port-1", planetId: "planet-1", typeId: "spaceport", level: 4, slotIndex: 3 },
      ],
    };
    const buildingShip: Ship = {
      id: "ship-1",
      ownerId: "user-1",
      typeId: "cargo_light",
      locationPlanetId: "planet-1",
      status: "building",
      queueCompletesAt: new Date(Date.now() + 60_000).toISOString(),
      cargoJson: {},
      fuel: "0",
      jumpFuel: "0",
      hp: 60,
      maxHp: 60,
      combatStats: { targetClass: "military_light" },
    };
    expect(
      resolveShipBuildBlockedReason(planet, cargoLight, logisticsResearch, {
        ships: [buildingShip],
      }),
    ).toEqual({ type: "queueFull", maxQueuedShips: 1 });
  });

  it("blocks when spaceport landing slots are fully occupied", () => {
    const planet = {
      ...basePlanet,
      buildings: [
        { id: "yard-1", planetId: "planet-1", typeId: "shipyard", level: 2, slotIndex: 2 },
        { id: "port-1", planetId: "planet-1", typeId: "spaceport", level: 2, slotIndex: 3 },
      ],
    };
    const ship: Ship = {
      id: "ship-x",
      ownerId: "user-1",
      typeId: "cargo_light",
      locationPlanetId: "planet-1",
      status: "idle",
      queueCompletesAt: null,
      cargoJson: {},
      fuel: "0",
      jumpFuel: "0",
      hp: 60,
      maxHp: 60,
      combatStats: { targetClass: "military_light" },
    };
    const ship2: Ship = { ...ship, id: "ship-y" };
    expect(
      resolveShipBuildBlockedReason(planet, cargoLight, logisticsResearch, {
        ships: [ship, ship2],
      }),
    ).toEqual({
      type: "spaceportCapacityFull",
      capacity: 2,
      occupied: 2,
      reserved: 0,
    });
  });
});

describe("estimateLandingSlotUsage", () => {
  const planet: Planet = {
    id: "planet-1",
    systemId: "system-1",
    biome: "green",
    size: 20,
    slotCount: 20,
    name: "home",
    buildings: [
      { id: "port-1", planetId: "planet-1", typeId: "spaceport", level: 3, slotIndex: 1 },
    ],
  };

  it("treats a queued spaceport build as zero capacity", () => {
    const usage = estimateLandingSlotUsage({
      planet: {
        ...planet,
        buildings: [
          {
            id: "port-1",
            planetId: "planet-1",
            typeId: "spaceport",
            level: 3,
            slotIndex: 1,
            queueAction: "build",
          },
        ],
      },
      ships: [],
      expeditions: [],
    });
    expect(usage.capacity).toBe(0);
    expect(usage.used).toBe(0);
  });

  it("counts idle/building ships at the planet as occupied", () => {
    const ship = (id: string, status: Ship["status"]): Ship => ({
      id,
      ownerId: "u",
      typeId: "cargo_light",
      locationPlanetId: "planet-1",
      status,
      queueCompletesAt: null,
      cargoJson: {},
      fuel: "0",
      jumpFuel: "0",
      hp: 1,
      maxHp: 1,
      combatStats: { targetClass: "civilian" },
    });
    const usage = estimateLandingSlotUsage({
      planet,
      ships: [
        ship("a", "idle"),
        ship("b", "building"),
        ship("c", "in_flight"),
        { ...ship("d", "idle"), locationPlanetId: "elsewhere" },
      ],
      expeditions: [],
    });
    expect(usage.occupied).toBe(2);
    expect(usage.reserved).toBe(0);
    expect(usage.used).toBe(2);
  });

  it("adds spaceport reservations from active expeditions", () => {
    const expedition: Expedition = {
      id: "e1",
      shipId: "s1",
      type: "survey",
      originPlanetId: "planet-1",
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      targetPlanetId: null,
      status: "in_flight",
      eta: new Date().toISOString(),
      returnedAt: null,
      result: {
        returnTrip: true,
        spaceportReservation: { originPlanetId: "planet-1" },
      },
    };
    const inboundExpedition: Expedition = {
      ...expedition,
      id: "e2",
      originPlanetId: "elsewhere",
      targetPlanetId: "planet-1",
      result: {
        spaceportReservation: { targetPlanetId: "planet-1" },
      },
    };
    const usage = estimateLandingSlotUsage({
      planet,
      ships: [],
      expeditions: [expedition, inboundExpedition],
    });
    expect(usage.reserved).toBe(2);
    expect(usage.used).toBe(2);
  });
});
