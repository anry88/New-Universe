import { describe, expect, it } from "vitest";
import type { SystemTacticalStateResponse } from "@shared/types/system-tactical";
import {
  shouldPollSystemTacticalState,
  systemTacticalRefetchInterval,
} from "./useSystemTacticalState";

function tacticalState(
  lastCombatTickAt: string | null,
  status: "in_flight" | "returning" | "stationed" = "stationed",
): SystemTacticalStateResponse {
  return {
    systemId: "system-1",
    updatedAt: "2026-06-01T00:00:00.000Z",
    fleetContacts: [
      {
        id: "foreign-ship-1",
        systemId: "system-1",
        relation: "foreign",
        visibility: "summary",
        status,
        ownerAlias: "@rival",
        shipTypeId: "light_fighter",
        hp: 175,
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
        lastCombatTickAt,
        point: { x: 10, y: 20 },
        stationedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  };
}

describe("shouldPollSystemTacticalState", () => {
  it("continues polling while a visible tactical contact has recent combat", () => {
    expect(
      shouldPollSystemTacticalState(
        tacticalState("2026-06-01T00:00:20.000Z"),
        new Date("2026-06-01T00:00:40.000Z").getTime(),
      ),
    ).toBe(true);
  });

  it("stops polling when all visible contacts are outside the combat window", () => {
    expect(
      shouldPollSystemTacticalState(
        tacticalState("2026-06-01T00:00:00.000Z"),
        new Date("2026-06-01T00:00:40.000Z").getTime(),
      ),
    ).toBe(false);
  });

  it("continues polling while a visible tactical contact is moving", () => {
    expect(
      shouldPollSystemTacticalState(tacticalState(null, "in_flight")),
    ).toBe(true);
    expect(
      shouldPollSystemTacticalState(tacticalState(null, "returning")),
    ).toBe(true);
  });

  it("does not poll empty or non-combat tactical responses", () => {
    expect(shouldPollSystemTacticalState(undefined)).toBe(false);
    expect(
      shouldPollSystemTacticalState({
        systemId: "system-1",
        updatedAt: "2026-06-01T00:00:00.000Z",
        fleetContacts: [],
      }),
    ).toBe(false);
    expect(shouldPollSystemTacticalState(tacticalState(null))).toBe(false);
  });

  it("keeps a slow refresh even without active tactical contacts", () => {
    expect(
      systemTacticalRefetchInterval({
        systemId: "system-1",
        updatedAt: "2026-06-01T00:00:00.000Z",
        fleetContacts: [],
      }),
    ).toBe(15_000);
    expect(
      systemTacticalRefetchInterval(tacticalState(null, "in_flight")),
    ).toBe(5_000);
  });
});
