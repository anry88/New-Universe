import { describe, expect, it } from "vitest";
import type { Planet } from "@shared/types/world";
import { readyLabLevel, selectResearchPlanet } from "./research-planet";

function planet(overrides: Partial<Planet>): Planet {
  return {
    id: overrides.id ?? "planet",
    systemId: "system",
    biome: "green",
    size: 20,
    slotCount: 20,
    name: overrides.name ?? "Planet",
    orbitIndex: overrides.orbitIndex,
    isDiscovered: overrides.isDiscovered ?? true,
    isColonized: overrides.isColonized ?? true,
    buildings: overrides.buildings ?? [],
    resources: overrides.resources ?? [],
  };
}

describe("research planet selection", () => {
  it("uses the settled planet with a ready lab instead of the first planet", () => {
    const capital = planet({
      id: "capital",
      name: "Capital",
      orbitIndex: 6,
      buildings: [{ id: "cc", planetId: "capital", typeId: "command_center", level: 1, slotIndex: 0 }],
    });
    const labWorld = planet({
      id: "lab-world",
      name: "Lab World",
      orbitIndex: 2,
      buildings: [{ id: "lab", planetId: "lab-world", typeId: "lab", level: 1, slotIndex: 1 }],
    });

    expect(selectResearchPlanet([capital, labWorld])?.id).toBe("lab-world");
  });

  it("ignores labs that are still being built", () => {
    const queuedLabWorld = planet({
      id: "queued-lab",
      buildings: [
        {
          id: "lab",
          planetId: "queued-lab",
          typeId: "lab",
          level: 1,
          slotIndex: 1,
          queueAction: "build",
        },
      ],
    });
    const readyLabWorld = planet({
      id: "ready-lab",
      buildings: [{ id: "lab-ready", planetId: "ready-lab", typeId: "lab", level: 1, slotIndex: 1 }],
    });

    expect(readyLabLevel(queuedLabWorld)).toBe(0);
    expect(selectResearchPlanet([queuedLabWorld, readyLabWorld])?.id).toBe(
      "ready-lab",
    );
  });

  it("prefers the highest-level ready lab when multiple planets have labs", () => {
    const lowLab = planet({
      id: "low",
      buildings: [{ id: "lab-low", planetId: "low", typeId: "lab", level: 1, slotIndex: 1 }],
    });
    const highLab = planet({
      id: "high",
      buildings: [{ id: "lab-high", planetId: "high", typeId: "lab", level: 3, slotIndex: 1 }],
    });

    expect(selectResearchPlanet([lowLab, highLab])?.id).toBe("high");
  });
});
