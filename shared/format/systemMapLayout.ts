export const SYSTEM_MAP_ORBIT_BASE = 90;
export const SYSTEM_MAP_ORBIT_STEP = 70;
export const SYSTEM_MAP_WORLD_UNITS_PER_LY = 40;
export const SYSTEM_MAP_JUMP_GATE_ORBIT_SLOT = 10;
export const SYSTEM_MAP_JUMP_GATE_ANGLE_RAD = -0.68;

export interface SystemMapPlanetInput {
  id: string;
  name?: string | null;
  biome?: string | null;
  size?: number | null;
  orbitIndex?: number | null;
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
  toxic: 7,
  metallic: 7,
  energy: 7,
  unknown: 99,
};

export const SYSTEM_MAP_HOME_GUIDE_ORBIT_COUNT = 8;

const SYSTEM_MAP_BIOME_SPRITE_BASE: Record<string, number> = {
  volcanic: 46,
  rocky: 44,
  green: 54,
  ocean: 58,
  gas_giant: 82,
  ice: 64,
  anomaly: 60,
  toxic: 58,
  metallic: 68,
  energy: 62,
  unknown: 46,
};

function normalizedOrbitIndex(planet: SystemMapPlanetInput): number | null {
  if (typeof planet.orbitIndex !== "number") return null;
  const index = Math.floor(planet.orbitIndex);
  return index >= 1 ? index : null;
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

export function systemMapJumpGatePoint(): SystemMapPoint {
  const orbitRadius = systemMapOrbitRadiusForSlot(SYSTEM_MAP_JUMP_GATE_ORBIT_SLOT);
  return {
    x: Math.cos(SYSTEM_MAP_JUMP_GATE_ANGLE_RAD) * orbitRadius,
    y: Math.sin(SYSTEM_MAP_JUMP_GATE_ANGLE_RAD) * orbitRadius,
  };
}

export function systemMapPointDistanceLy(
  a: SystemMapPoint,
  b: SystemMapPoint,
  worldUnitsPerLy = SYSTEM_MAP_WORLD_UNITS_PER_LY,
): number {
  if (worldUnitsPerLy <= 0) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y) / worldUnitsPerLy;
}

export function systemMapPlanetOrbitSlot(
  planet: SystemMapPlanetInput,
  sortedIndex?: number,
): number {
  const explicitOrbitIndex = normalizedOrbitIndex(planet);
  if (explicitOrbitIndex) return explicitOrbitIndex;
  return typeof sortedIndex === "number"
    ? sortedIndex + 1
    : systemMapPlanetOrbitTier(planet);
}

export function buildSystemMapOrbitGuideRadii(
  planets: SystemMapPlanetInput[],
  minimumOrbitCount =
    planets.length > 0 ? SYSTEM_MAP_HOME_GUIDE_ORBIT_COUNT : 1,
): number[] {
  const visiblePlanets = planets
    .filter((planet) => planet.biome !== "unknown")
    .sort(compareSystemMapPlanets);
  const orbitSlots = visiblePlanets.map((planet, index) =>
    systemMapPlanetOrbitSlot(planet, index),
  );
  const orbitCount = Math.max(
    1,
    minimumOrbitCount,
    visiblePlanets.length,
    ...orbitSlots,
  );
  return Array.from({ length: orbitCount }, (_, index) =>
    systemMapOrbitRadiusForSlot(index + 1),
  );
}

function planetAngleIndex(planet: SystemMapPlanetInput, sortedIndex: number): number {
  return normalizedOrbitIndex(planet) ?? sortedIndex + 1;
}

export function compareSystemMapPlanets(
  a: SystemMapPlanetInput,
  b: SystemMapPlanetInput,
): number {
  const orbitSlotDelta =
    (normalizedOrbitIndex(a) ?? systemMapPlanetOrbitTier(a)) -
    (normalizedOrbitIndex(b) ?? systemMapPlanetOrbitTier(b));
  if (orbitSlotDelta !== 0) return orbitSlotDelta;

  const tierDelta = systemMapPlanetOrbitTier(a) - systemMapPlanetOrbitTier(b);
  if (tierDelta !== 0) return tierDelta;

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
  return [...planets]
    .sort(compareSystemMapPlanets)
    .map((planet, index) => {
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
