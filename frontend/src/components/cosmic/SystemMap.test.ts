import { describe, expect, it } from "vitest";
import type { Expedition } from "@shared/types/expeditions";
import type { Ship } from "@shared/types/ships";
import type { SystemTacticalFleetContact } from "@shared/types/system-tactical";
import type { HomeSystem } from "@shared/types/world";
import {
  sectorDeltaToSystemMapPoint,
  systemMapJumpGatePoint,
} from "@shared/format/systemMapLayout";
import {
  buildFleetContactRenderPoints,
  buildCombatProjectileSegments,
  buildExpeditionTrailSegments,
  buildShipMarkerSnapshots,
  fleetContactMotionAngle,
  fleetContactsForSystem,
  tacticalExpeditionShipIdsForRenderedContacts,
  tacticalExpeditionTouchesSystem,
  weaponVisualForCombatStats,
  type PlanetLayout,
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

function contact(
  id: string,
  overrides: Partial<SystemTacticalFleetContact> = {},
): SystemTacticalFleetContact {
  return {
    id,
    systemId: system.id,
    relation: "foreign",
    visibility: "summary",
    status: "stationed",
    ownerAlias: "@rival",
    shipTypeId: "light_fighter",
    hp: 120,
    maxHp: 200,
    combatStats: {
      targetClass: "military_light",
      damageProfile: {
        damageType: "kinetic",
        dps: 30,
        armorPenetration: 0.2,
        shieldMultiplier: 1,
      },
      engagementRange: "close",
    },
    lastCombatTickAt: "2026-06-01T00:00:20.000Z",
    point: { x: 10, y: 20 },
    stationedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    id: "ship-1",
    ownerId: "user-1",
    typeId: "light_fighter",
    locationPlanetId: null,
    status: "moving",
    cargoJson: {},
    fuel: "10",
    jumpFuel: "0",
    refuelFuel: "0",
    refuelJumpFuel: "0",
    hp: 100,
    maxHp: 100,
    combatStats: {
      targetClass: "military_light",
      damageProfile: {
        damageType: "kinetic",
        dps: 10,
        armorPenetration: 0.2,
        shieldMultiplier: 1,
      },
      engagementRange: "close",
    },
    ...overrides,
  };
}

function planetLayout(overrides: Partial<PlanetLayout> = {}): PlanetLayout {
  return {
    planet: {
      id: "origin-planet",
      name: "Origin",
      biome: "terrestrial",
      size: 1,
      slotCount: 8,
      systemId: system.id,
      resources: [],
      buildings: [],
      isDiscovered: true,
      isColonized: true,
    },
    index: 0,
    orbitRadius: 100,
    angle: 0,
    x: 40,
    y: 0,
    spriteSize: 48,
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

describe("buildShipMarkerSnapshots", () => {
  it("parks local one-way combat deployments at their stationed point", () => {
    const originLayout = planetLayout();
    const target = sectorDeltaToSystemMapPoint(
      { x: originLayout.x, y: originLayout.y },
      4,
      0,
    );
    const markers = buildShipMarkerSnapshots({
      ships: [ship()],
      activeExpeditions: [
        expedition({
          status: "stationed",
          targetX: system.sectorX + 4,
          targetY: system.sectorY,
          result: {
            routeMode: "local",
            distance: 4,
            speed: 1,
            engineFactor: 1,
            returnTrip: false,
          },
        }),
      ],
      layoutByPlanetId: new Map([[originLayout.planet.id, originLayout]]),
      system,
      now: new Date("2026-06-01T00:00:40.000Z").getTime(),
    });

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      isMoving: false,
      isReturning: false,
    });
    expect(markers[0].x).toBeCloseTo(target.x, 5);
    expect(markers[0].y).toBeCloseTo(target.y, 5);
  });

  it("keeps Jump Gate origin-leg ship markers before tactical contact handoff", () => {
    const now = new Date("2026-06-01T00:00:00.000Z").getTime();
    const originSystem: HomeSystem = {
      ...system,
      id: "home-system",
      isHome: true,
      name: "Home System",
    };
    const originLayout = planetLayout({
      planet: {
        ...planetLayout().planet,
        systemId: originSystem.id,
      },
    });
    const gatePoint = systemMapJumpGatePoint();

    const markers = buildShipMarkerSnapshots({
      ships: [ship()],
      activeExpeditions: [
        expedition({
          eta: new Date(now + 240_000).toISOString(),
          result: {
            routeMode: "jump_gate",
            originSystemId: originSystem.id,
            destinationSystemId: system.id,
            originGateDistance: 6,
            targetGateDistance: 4,
            distance: 10,
            speed: 2,
            engineFactor: 1,
            returnTrip: false,
          },
        }),
      ],
      layoutByPlanetId: new Map([[originLayout.planet.id, originLayout]]),
      system: originSystem,
      now,
    });

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      isMoving: true,
      isReturning: false,
    });
    expect(markers[0].x).toBeGreaterThan(originLayout.x);
    expect(markers[0].x).toBeLessThan(gatePoint.x);
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

describe("tacticalExpeditionShipIdsForRenderedContacts", () => {
  it("keeps /me routes visible until tactical-state renders a matching contact", () => {
    const activeExpeditions = [expedition({ shipId: "ship-1" })];

    expect(
      tacticalExpeditionShipIdsForRenderedContacts({
        activeExpeditions,
        visibleFleetContacts: [],
        fleetContactsAuthoritative: true,
        systemId: system.id,
      }),
    ).toEqual(new Set());

    expect(
      tacticalExpeditionShipIdsForRenderedContacts({
        activeExpeditions,
        visibleFleetContacts: [
          contact("ship-1", { relation: "self", visibility: "full" }),
        ],
        fleetContactsAuthoritative: true,
        systemId: system.id,
      }),
    ).toEqual(new Set(["ship-1"]));
  });
});

describe("tacticalExpeditionTouchesSystem", () => {
  it("matches Jump Gate expeditions by origin or destination system", () => {
    expect(tacticalExpeditionTouchesSystem(expedition({}), system.id)).toBe(
      true,
    );
    expect(
      tacticalExpeditionTouchesSystem(
        expedition({
          result: {
            routeMode: "jump_gate",
            originSystemId: system.id,
            destinationSystemId: "other-system",
          },
        }),
        system.id,
      ),
    ).toBe(true);
    expect(
      tacticalExpeditionTouchesSystem(
        expedition({
          result: {
            routeMode: "local",
            destinationSystemId: system.id,
          },
        }),
        system.id,
      ),
    ).toBe(false);
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

describe("buildCombatProjectileSegments", () => {
  it("uses rendered spread points for co-located tactical contacts", () => {
    const contacts = [
      contact("own-fighter", {
        relation: "self",
        visibility: "full",
        ownerAlias: null,
        point: { x: 0, y: 0 },
      }),
      contact("foreign-fighter", {
        ownerAlias: "@rival",
        point: { x: 0, y: 0 },
      }),
    ];
    const renderPoints = buildFleetContactRenderPoints(contacts);

    expect(renderPoints.get("own-fighter")?.y).not.toBe(0);
    expect(renderPoints.get("foreign-fighter")?.y).not.toBe(0);

    const [segment] = buildCombatProjectileSegments({
      markers: [],
      contacts,
      now: new Date("2026-06-01T00:00:40.000Z").getTime(),
    });

    expect(segment.y1).not.toBe(segment.y2);
    expect(
      Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1),
    ).toBeCloseTo(24, 5);
  });

  it("draws tactical self-vs-foreign crossfire without a /me ship marker", () => {
    const segments = buildCombatProjectileSegments({
      markers: [],
      contacts: [
        contact("own-fighter", {
          relation: "self",
          visibility: "full",
          ownerAlias: null,
          point: { x: 0, y: 0 },
        }),
        contact("foreign-fighter", {
          ownerAlias: "@rival",
          point: { x: 12, y: 0 },
        }),
      ],
      now: new Date("2026-06-01T00:00:40.000Z").getTime(),
    });

    expect(segments.map((segment) => segment.id)).toEqual([
      "self-own-fighter-foreign-fighter",
      "foreign-foreign-fighter-own-fighter",
    ]);
  });

  it("does not create crossfire between tactical self contacts", () => {
    const segments = buildCombatProjectileSegments({
      markers: [],
      contacts: [
        contact("own-fighter-a", {
          relation: "self",
          visibility: "full",
          ownerAlias: null,
        }),
        contact("own-fighter-b", {
          relation: "self",
          visibility: "full",
          ownerAlias: null,
          point: { x: 12, y: 0 },
        }),
      ],
      now: new Date("2026-06-01T00:00:40.000Z").getTime(),
    });

    expect(segments).toEqual([]);
  });

  it("draws close-range crossfire between recent foreign contacts", () => {
    const segments = buildCombatProjectileSegments({
      markers: [],
      contacts: [
        contact("medium-fighter", {
          ownerAlias: "@medium",
          shipTypeId: "medium_fighter",
        }),
        contact("light-fighter-a", { ownerAlias: "@light" }),
      ],
      now: new Date("2026-06-01T00:00:40.000Z").getTime(),
    });

    expect(segments).toHaveLength(2);
    expect(segments.map((segment) => segment.id)).toEqual([
      "foreign-medium-fighter-light-fighter-a",
      "foreign-light-fighter-a-medium-fighter",
    ]);
    for (const segment of segments) {
      expect(
        Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1),
      ).toBeGreaterThanOrEqual(24);
    }
  });

  it("does not create foreign crossfire between contacts from the same visible owner", () => {
    const segments = buildCombatProjectileSegments({
      markers: [],
      contacts: [
        contact("light-fighter-a", { ownerAlias: "@light" }),
        contact("light-fighter-b", { ownerAlias: "@light" }),
      ],
      now: new Date("2026-06-01T00:00:40.000Z").getTime(),
    });

    expect(segments).toEqual([]);
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
