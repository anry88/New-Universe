import { describe, expect, it } from "vitest";

import type { ResearchProgress } from "@shared/types/research";
import { formatShipBuildErrorMessage, type ShipType } from "@shared/types/ships";
import type { Planet } from "@shared/types/world";
import { resolveShipBuildBlockedReason } from "./ship-build-eligibility";

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
  combatStats: { targetClass: 'military_light' },
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
});
