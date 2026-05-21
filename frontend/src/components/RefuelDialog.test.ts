import { describe, expect, it } from "vitest";
import type { SystemTacticalFleetContact } from "@shared/types/system-tactical";
import type { Ship } from "@shared/types/ships";
import {
  buildStationedOwnContactMap,
  refuelTransferTargetCandidates,
} from "./RefuelDialog";

function ship(overrides: Partial<Ship>): Ship {
  return {
    id: "ship",
    ownerId: "user",
    typeId: "light_fighter",
    locationPlanetId: null,
    status: "idle",
    cargoJson: {},
    fuel: "10.00",
    jumpFuel: "1.00",
    refuelFuel: "0.00",
    refuelJumpFuel: "0.00",
    hp: 100,
    maxHp: 100,
    combatStats: {
      targetClass: "military_light",
      damageProfile: {
        damageType: "kinetic",
        dps: 10,
        armorPenetration: 0,
        shieldMultiplier: 1,
      },
      engagementRange: "close",
    },
    ...overrides,
  };
}

function contact(
  id: string,
  overrides: Partial<SystemTacticalFleetContact> = {},
): SystemTacticalFleetContact {
  return {
    id,
    systemId: "public-system",
    relation: "self",
    visibility: "full",
    status: "stationed",
    ownerAlias: null,
    shipTypeId: "light_fighter",
    fuel: "73.00",
    jumpFuel: "12.00",
    point: { x: 10, y: 20 },
    stationedAt: "2026-05-21T10:00:00.000Z",
    ...overrides,
  };
}

describe("refuelTransferTargetCandidates", () => {
  it("keeps owned stationed Jump Gate tactical contacts selectable", () => {
    const source = ship({
      id: "source-refueler",
      typeId: "refueler",
      locationPlanetId: "home-planet",
    });
    const dockedTarget = ship({
      id: "docked-target",
      locationPlanetId: "visible-planet",
    });
    const stationedTarget = ship({
      id: "stationed-target",
      locationPlanetId: null,
      status: "moving",
      fuel: "73.00",
      jumpFuel: "12.00",
    });
    const movingWithoutContact = ship({
      id: "moving-without-contact",
      locationPlanetId: null,
      status: "moving",
    });

    const candidates = refuelTransferTargetCandidates({
      allShips: [source, dockedTarget, stationedTarget, movingWithoutContact],
      planetIdsInSystem: new Set(["visible-planet"]),
      sourceShipId: source.id,
      stationedOwnContacts: buildStationedOwnContactMap([
        contact(stationedTarget.id),
        contact("foreign-full", { relation: "foreign", ownerAlias: "@rival" }),
        contact("own-moving", { status: "in_flight" }),
      ]),
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "docked-target",
      "stationed-target",
    ]);
  });
});
