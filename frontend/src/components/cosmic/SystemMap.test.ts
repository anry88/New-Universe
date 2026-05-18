import { describe, expect, it } from "vitest";
import type { Expedition } from "@shared/types/expeditions";
import type { SystemTacticalFleetContact } from "@shared/types/system-tactical";
import type { HomeSystem } from "@shared/types/world";
import {
  buildExpeditionTrailSegments,
  fleetContactMotionAngle,
  fleetContactsForSystem,
  weaponVisualForCombatStats,
} from "./SystemMap";

const system: HomeSystem = {
  id: "public-system",
  ownerId: "",
  isHome: false,
  sectorX: 10,
  sectorY: 20,
  sectorZ: 0,
  name: "Public System",
  seed: 1,
  planets: [],
};

function expedition(overrides: Partial<Expedition>): Expedition {
  return {
    id: "expedition-1",
    shipId: "ship-1",
    type: "light_fighter",
    originPlanetId: "origin-planet",
    targetX: 10,
    targetY: 20,
    targetZ: 0,
    targetPlanetId: null,
    status: "in_flight",
    eta: "2026-05-13T01:00:00.000Z",
    returnedAt: null,
    result: {
      routeMode: "jump_gate",
      destinationSystemId: system.id,
      targetSystemPoint: { x: 72, y: -24 },
    },
    ...overrides,
  };
}

describe("buildExpeditionTrailSegments", () => {
  it("does not keep a previous route trail for stationed point deployments", () => {
    const segments = buildExpeditionTrailSegments(
      [expedition({ status: "stationed" })],
      new Map(),
      system,
    );

    expect(segments).toEqual([]);
  });

  it("keeps active route trails for in-flight point deployments", () => {
    const segments = buildExpeditionTrailSegments(
      [expedition({ status: "in_flight" })],
      new Map(),
      system,
    );

    expect(segments).toEqual([
      expect.objectContaining({
        id: "expedition-1-destination",
        endpointX: 72,
        endpointY: -24,
      }),
    ]);
  });
});

describe("fleetContactsForSystem", () => {
  it("keeps only contacts for the currently rendered system", () => {
    const contacts: SystemTacticalFleetContact[] = [
      {
        id: "contact-visible",
        systemId: system.id,
        relation: "foreign",
        visibility: "summary",
        status: "stationed",
        ownerAlias: "@rival",
        shipTypeId: "light_laser",
        hp: 180,
        maxHp: 280,
        combatStats: {
          targetClass: "military_light",
          damageProfile: {
            damageType: "energy",
            dps: 24,
            armorPenetration: 0.4,
            shieldMultiplier: 1.2,
          },
          engagementRange: "long",
        },
        point: { x: 72, y: -24 },
        stationedAt: "2026-05-13T01:00:00.000Z",
      },
      {
        id: "contact-other-sector",
        systemId: "other-public-system",
        relation: "foreign",
        visibility: "summary",
        status: "stationed",
        ownerAlias: "@other",
        shipTypeId: "rocket_carrier",
        point: { x: -120, y: 40 },
        stationedAt: "2026-05-13T02:00:00.000Z",
      },
    ];

    expect(fleetContactsForSystem(contacts, system.id)).toEqual([
      expect.objectContaining({ id: "contact-visible" }),
    ]);
  });
});

describe("fleetContactMotionAngle", () => {
  it("returns the rendered heading for moving tactical contacts", () => {
    expect(
      fleetContactMotionAngle({
        motion: {
          state: "moving",
          dx: 100,
          dy: 0,
          updatedAt: "2026-05-13T01:00:30.000Z",
        },
      }),
    ).toBeCloseTo(0, 6);
    expect(
      fleetContactMotionAngle({
        motion: {
          state: "moving",
          dx: 0,
          dy: 100,
          updatedAt: "2026-05-13T01:00:30.000Z",
        },
      }),
    ).toBeCloseTo(Math.PI / 2, 6);
  });

  it("does not rotate stationed or zero-vector contacts", () => {
    expect(fleetContactMotionAngle({ motion: null })).toBeNull();
    expect(
      fleetContactMotionAngle({
        motion: {
          state: "moving",
          dx: 0,
          dy: 0,
          updatedAt: "2026-05-13T01:00:30.000Z",
        },
      }),
    ).toBeNull();
  });
});

describe("weaponVisualForCombatStats", () => {
  it("maps combat stats to projectile families", () => {
    expect(
      weaponVisualForCombatStats({
        targetClass: "military_light",
        damageProfile: {
          damageType: "kinetic",
          dps: 10,
          armorPenetration: 0.2,
          shieldMultiplier: 1,
        },
        engagementRange: "close",
      }),
    ).toBe("kinetic");
    expect(
      weaponVisualForCombatStats({
        targetClass: "military_light",
        damageProfile: {
          damageType: "energy",
          dps: 10,
          armorPenetration: 0.2,
          shieldMultiplier: 1,
        },
        engagementRange: "long",
      }),
    ).toBe("beam");
    expect(
      weaponVisualForCombatStats({
        targetClass: "military_heavy",
        missilePayload: {
          damageType: "explosive",
          alphaDamage: 120,
          reloadSec: 6,
          armorPenetration: 0.4,
          shieldMultiplier: 1.1,
          validTargetClasses: ["military_medium", "military_heavy"],
          evasionCounterThreshold: 10,
          maxRange: "long",
        },
      }),
    ).toBe("missile");
    expect(weaponVisualForCombatStats({ targetClass: "civilian" })).toBe(
      "neutral",
    );
  });
});
