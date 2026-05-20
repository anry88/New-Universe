import { describe, expect, it } from "vitest";
import type { JumpGateStateResponse } from "@shared/types/jump-gate";
import {
  jumpGateRefetchInterval,
  shouldPollJumpGateState,
} from "./useJumpGateState";

function jumpGateState(
  lastCombatTickAt: string | null,
): JumpGateStateResponse {
  return {
    unlocked: true,
    lockedReason: null,
    homeGateAnchor: null,
    calibration: {
      status: "idle",
      mode: null,
      targetSystemId: null,
      startedAt: null,
      completesAt: null,
    },
    randomJumpAvailability: {
      available: true,
      blockedCode: null,
      readyAt: null,
    },
    knownDestinations: [
      {
        systemId: "system-1",
        systemName: "Frontier",
        shortTag: "FRN",
        sector: { x: 1, y: 2, z: 0 },
        seed: 123,
        planetCount: 1,
        discoveredAt: "2026-06-01T00:00:00.000Z",
        source: "random_jump",
        lastVisitedAt: null,
        planets: [
          {
            id: "planet-1",
            systemId: "system-1",
            orbitIndex: 0,
            name: "Frontier I",
            biome: "rocky",
            size: 12,
            slotCount: 8,
            isDiscovered: true,
            isColonized: true,
            isOwnedColony: false,
            buildingCount: 2,
            lastCombatTickAt,
          },
        ],
      },
    ],
  };
}

describe("shouldPollJumpGateState", () => {
  it("continues polling while destination planet buildings were recently hit", () => {
    expect(
      shouldPollJumpGateState(
        jumpGateState("2026-06-01T00:00:20.000Z"),
        new Date("2026-06-01T00:00:40.000Z").getTime(),
      ),
    ).toBe(true);
  });

  it("uses the idle interval when no destination planet has recent surface combat", () => {
    const now = new Date("2026-06-01T00:00:40.000Z").getTime();

    expect(
      shouldPollJumpGateState(
        jumpGateState("2026-06-01T00:00:00.000Z"),
        now,
      ),
    ).toBe(false);
    expect(jumpGateRefetchInterval(jumpGateState(null), now)).toBe(15_000);
  });

  it("uses the active interval for recent surface combat", () => {
    const now = new Date("2026-06-01T00:00:40.000Z").getTime();
    const data = jumpGateState("2026-06-01T00:00:20.000Z");

    expect(shouldPollJumpGateState(data, now)).toBe(true);
    expect(jumpGateRefetchInterval(data, now)).toBe(5_000);
  });
});
