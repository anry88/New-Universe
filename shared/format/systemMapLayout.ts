export const SYSTEM_MAP_ORBIT_BASE = 90;
export const SYSTEM_MAP_ORBIT_STEP = 70;
export const SYSTEM_MAP_WORLD_UNITS_PER_LY = 40;

export interface SystemMapPlanetInput {
  id: string;
  biome?: string | null;
  size?: number | null;
}

export interface SystemMapPlanetLayout {
  id: string;
  index: number;
  orbitRadius: number;
  angle: number;
  x: number;
  y: number;
  spriteSize: number;
}

export interface SystemMapPoint {
  x: number;
  y: number;
}

export function compareSystemMapPlanets(
  a: SystemMapPlanetInput,
  b: SystemMapPlanetInput,
): number {
  return a.id.localeCompare(b.id);
}

export function planetAngle(
  planet: SystemMapPlanetInput,
  index: number,
  systemSeed: number,
): number {
  const seed =
    (systemSeed | 0) + index * 1009 + (planet.id?.charCodeAt(0) ?? 0);
  let s = seed || 1;
  s = (s * 9301 + 49297) % 233280;
  return (s / 233280) * Math.PI * 2 + (index % 2 === 0 ? 0 : Math.PI / 6);
}

export function buildSystemMapLayouts(
  planets: SystemMapPlanetInput[],
  systemSeed: number,
): SystemMapPlanetLayout[] {
  return [...planets].sort(compareSystemMapPlanets).map((planet, index) => {
    const orbitRadius = SYSTEM_MAP_ORBIT_BASE + index * SYSTEM_MAP_ORBIT_STEP;
    const angle = planetAngle(planet, index, systemSeed);
    const x = Math.cos(angle) * orbitRadius;
    const y = Math.sin(angle) * orbitRadius;
    const biome = planet.biome ?? "unknown";
    const size = planet.size ?? 10;
    const sizeFromBiome =
      biome === "unknown" ? 60 : biome === "gas_giant" ? 70 : 52;
    const spriteSize = Math.round(
      sizeFromBiome * (0.85 + Math.min(0.6, size / 20)),
    );

    return { id: planet.id, index, orbitRadius, angle, x, y, spriteSize };
  });
}

export function sectorDeltaToSystemMapPoint(
  origin: SystemMapPoint,
  sectorDx: number,
  sectorDy: number,
  worldUnitsPerLy = SYSTEM_MAP_WORLD_UNITS_PER_LY,
): SystemMapPoint {
  return {
    x: origin.x + sectorDx * worldUnitsPerLy,
    y: origin.y + sectorDy * worldUnitsPerLy,
  };
}

export function interpolateSystemMapPoint(
  from: SystemMapPoint,
  to: SystemMapPoint,
  progress: number,
): SystemMapPoint {
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

export function distancePointToSegment(
  point: SystemMapPoint,
  segmentStart: SystemMapPoint,
  segmentEnd: SystemMapPoint,
): number {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
        lengthSq,
    ),
  );
  const projection = {
    x: segmentStart.x + t * dx,
    y: segmentStart.y + t * dy,
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}
