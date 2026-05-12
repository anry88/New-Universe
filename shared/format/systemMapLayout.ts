export const SYSTEM_MAP_ORBIT_BASE = 90;
export const SYSTEM_MAP_ORBIT_STEP = 70;
export const SYSTEM_MAP_WORLD_UNITS_PER_LY = 40;

export interface SystemMapPlanetInput {
  id: string;
  name?: string | null;
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

export const SYSTEM_MAP_BIOME_ORBIT_TIER: Record<string, number> = {
  volcanic: 1,
  rocky: 2,
  ocean: 3,
  green: 4,
  gas_giant: 5,
  ice: 6,
  anomaly: 7,
  unknown: 99,
};

export const SYSTEM_MAP_HOME_GUIDE_ORBIT_COUNT = 9;
const SYSTEM_MAP_HOME_CAPITAL_ORBIT_SLOT = 6;

const SYSTEM_MAP_BIOME_SPRITE_BASE: Record<string, number> = {
  volcanic: 46,
  rocky: 44,
  green: 54,
  ocean: 58,
  gas_giant: 82,
  ice: 64,
  anomaly: 60,
  unknown: 46,
};

function planetNameIndex(name?: string | null): number {
  const match = name?.match(/-(\d+)$/);
  return match ? Number.parseInt(match[1]!, 10) : Number.MAX_SAFE_INTEGER;
}

export function systemMapPlanetOrbitTier(planet: SystemMapPlanetInput): number {
  const biome = planet.biome ?? "unknown";
  return SYSTEM_MAP_BIOME_ORBIT_TIER[biome] ?? SYSTEM_MAP_BIOME_ORBIT_TIER.unknown;
}

export function systemMapPlanetOrbitRadius(planet: SystemMapPlanetInput): number {
  return systemMapOrbitRadiusForSlot(systemMapPlanetOrbitSlot(planet));
}

export function systemMapOrbitRadiusForSlot(slot: number): number {
  return SYSTEM_MAP_ORBIT_BASE + (Math.max(1, slot) - 1) * SYSTEM_MAP_ORBIT_STEP;
}

export function systemMapPlanetOrbitSlot(
  planet: SystemMapPlanetInput,
  sortedIndex = 0,
): number {
  const nameIndex = planetNameIndex(planet.name);
  if (planet.biome === "green" && nameIndex === 1) {
    return SYSTEM_MAP_HOME_CAPITAL_ORBIT_SLOT;
  }
  if (nameIndex >= 2 && nameIndex <= 6) {
    return nameIndex - 1;
  }
  if (nameIndex >= 7 && nameIndex <= SYSTEM_MAP_HOME_GUIDE_ORBIT_COUNT) {
    return nameIndex;
  }
  return sortedIndex + 1;
}

export function buildSystemMapOrbitGuideRadii(
  planets: SystemMapPlanetInput[],
  minimumOrbitCount =
    planets.length > 0 ? SYSTEM_MAP_HOME_GUIDE_ORBIT_COUNT : 1,
): number[] {
  const orbitSlots = planets
    .map((planet, index) =>
      planet.biome === "unknown" ? 0 : systemMapPlanetOrbitSlot(planet, index),
    )
    .filter((slot) => slot >= 1);
  const orbitCount = Math.max(1, minimumOrbitCount, planets.length, ...orbitSlots);
  return Array.from({ length: orbitCount }, (_, index) =>
    systemMapOrbitRadiusForSlot(index + 1),
  );
}

function planetAngleIndex(planet: SystemMapPlanetInput, sortedIndex: number): number {
  const nameIndex = planetNameIndex(planet.name);
  return nameIndex === Number.MAX_SAFE_INTEGER ? sortedIndex + 1 : nameIndex;
}

export function compareSystemMapPlanets(
  a: SystemMapPlanetInput,
  b: SystemMapPlanetInput,
): number {
  const tierDelta = systemMapPlanetOrbitTier(a) - systemMapPlanetOrbitTier(b);
  if (tierDelta !== 0) return tierDelta;

  const indexDelta = planetNameIndex(a.name) - planetNameIndex(b.name);
  if (indexDelta !== 0) return indexDelta;

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
    const orbitRadius = systemMapOrbitRadiusForSlot(
      systemMapPlanetOrbitSlot(planet, index),
    );
    const angle = planetAngle(planet, planetAngleIndex(planet, index), systemSeed);
    const x = Math.cos(angle) * orbitRadius;
    const y = Math.sin(angle) * orbitRadius;
    const biome = planet.biome ?? "unknown";
    const size = planet.size ?? 10;
    const sizeFromBiome =
      SYSTEM_MAP_BIOME_SPRITE_BASE[biome] ?? SYSTEM_MAP_BIOME_SPRITE_BASE.unknown;
    const sizeFactor = Math.max(0.7, Math.min(1.55, size / 22));
    const spriteSize = Math.round(
      sizeFromBiome * sizeFactor,
    );

    return { id: planet.id, index, orbitRadius, angle, x, y, spriteSize };
  });
}

export function systemMapPlanetDistanceLy(
  planets: SystemMapPlanetInput[],
  systemSeed: number,
  originPlanetId: string,
  targetPlanetId: string,
  worldUnitsPerLy = SYSTEM_MAP_WORLD_UNITS_PER_LY,
): number | null {
  const layouts = buildSystemMapLayouts(planets, systemSeed);
  const origin = layouts.find((layout) => layout.id === originPlanetId);
  const target = layouts.find((layout) => layout.id === targetPlanetId);

  if (!origin || !target || worldUnitsPerLy <= 0) {
    return null;
  }

  return Math.hypot(target.x - origin.x, target.y - origin.y) / worldUnitsPerLy;
}

export function systemMapPlanetDiscoveryRadius(
  planet: Pick<SystemMapPlanetLayout, "spriteSize">,
): number {
  return Math.max(80, Math.round(planet.spriteSize));
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
