import type { Planet } from "@shared/types/world";

export function readyLabLevel(planet: Planet | null | undefined): number {
  return Math.max(
    0,
    ...(planet?.buildings ?? [])
      .filter(
        (building) =>
          building.typeId === "lab" && building.queueAction !== "build",
      )
      .map((building) => building.level),
  );
}

export function selectResearchPlanet(
  planets: Planet[] | null | undefined,
): Planet | undefined {
  const settledPlanets = (planets ?? []).filter(
    (planet) => planet.isDiscovered !== false && planet.isColonized === true,
  );
  const planetsWithReadyLab = settledPlanets.filter(
    (planet) => readyLabLevel(planet) > 0,
  );

  if (planetsWithReadyLab.length > 0) {
    return [...planetsWithReadyLab].sort((a, b) => {
      const labDelta = readyLabLevel(b) - readyLabLevel(a);
      if (labDelta !== 0) return labDelta;

      return (
        (a.orbitIndex ?? Number.MAX_SAFE_INTEGER) -
          (b.orbitIndex ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
      );
    })[0];
  }

  return settledPlanets[0] ?? (planets ?? [])[0];
}
