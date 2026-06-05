import { describe, expect, it } from "vitest";
import type { Expedition } from "@shared/types/expeditions";
import { fleetLocationAnchorLabel } from "./fleet-location";

const expedition: Expedition = {
  id: "expedition-1",
  shipId: "ship-1",
  type: "light_fighter",
  originPlanetId: "origin",
  targetX: 12,
  targetY: 8,
  targetZ: 0,
  targetPlanetId: null,
  status: "stationed",
  eta: "2026-06-01T00:00:00.000Z",
  returnedAt: null,
  result: {},
};

describe("fleetLocationAnchorLabel", () => {
  it("uses the docked planet name instead of a generic orbit label", () => {
    const label = fleetLocationAnchorLabel({
      ship: { locationPlanetId: "public-colony" },
      planetsById: new Map([
        [
          "public-colony",
          { id: "public-colony", name: "Atlas-7", systemId: "public-system" },
        ],
      ]),
      systemsById: new Map(),
      homeSystem: { id: "home", name: "Home", sectorX: 0, sectorY: 0, sectorZ: 0 },
      systemLabel: "System",
    });

    expect(label).toBe("Atlas-7");
  });

  it("uses the stationed destination system name when the ship is not on a planet", () => {
    const label = fleetLocationAnchorLabel({
      ship: { locationPlanetId: null },
      activeExpedition: {
        ...expedition,
        result: { destinationSystemId: "public-system" },
      },
      planetsById: new Map(),
      systemsById: new Map([
        [
          "public-system",
          {
            id: "public-system",
            name: "Common 7Q2A",
            sectorX: 12,
            sectorY: 8,
            sectorZ: 0,
          },
        ],
      ]),
      homeSystem: null,
      systemLabel: "System",
    });

    expect(label).toBe("Common 7Q2A");
  });

  it("falls back to visible sector coordinates instead of internal ids", () => {
    const label = fleetLocationAnchorLabel({
      ship: { locationPlanetId: null },
      activeExpedition: expedition,
      planetsById: new Map(),
      systemsById: new Map(),
      homeSystem: null,
      systemLabel: "System",
    });

    expect(label).toBe("System · 12:8:0");
  });
});
