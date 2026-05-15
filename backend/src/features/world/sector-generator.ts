import { randomUUID } from 'node:crypto';
import {
  formatCommonSystemDisplayName,
  formatPlanetCode,
  homeSystemShortTag,
} from '@shared/format/homeSystemNaming.js';
import { db as defaultDb } from '../../db/index.js';
import { systems, planets, richness, planetResources } from '../../db/schema.js';
import {
  BIOMES,
  BIOME_SIZE_CLASS,
  BiomeType,
  PLANET_SIZE_RANGE,
  isAnomalousCommonBiome,
} from './biomes.js';

const SECTOR_SIZE = 500;
const MIN_DISTANCE = 50;
const MAX_SYSTEMS_PER_SECTOR = 12;
const DEFAULT_TARGET_COUNT = 5;
export const COMMON_SYSTEM_PLANET_COUNT_MIN = 6;
export const COMMON_SYSTEM_PLANET_COUNT_MAX = 9;

type ResourceRarity = 'common' | 'rare';

interface WeightedResourceCandidate {
  resourceId: string;
  rarity: ResourceRarity;
  weight: number;
}

function createRandom(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getBiomeByWeight(random: () => number): BiomeType {
  const weightedBiomes: { biome: BiomeType; weight: number }[] = [
    { biome: 'rocky', weight: 22 },
    { biome: 'ocean', weight: 18 },
    { biome: 'gas_giant', weight: 14 },
    { biome: 'ice', weight: 14 },
    { biome: 'volcanic', weight: 10 },
    { biome: 'green', weight: 10 },
    { biome: 'metallic', weight: 5 },
    { biome: 'toxic', weight: 3 },
    { biome: 'anomaly', weight: 3 },
    { biome: 'energy', weight: 1 },
  ];

  const totalWeight = weightedBiomes.reduce((sum, b) => sum + b.weight, 0);
  let randomValue = random() * totalWeight;

  for (const { biome, weight } of weightedBiomes) {
    randomValue -= weight;
    if (randomValue <= 0) return biome;
  }

  return 'rocky';
}

function getAnomalousBiomeByWeight(random: () => number): BiomeType {
  const weightedBiomes: { biome: BiomeType; weight: number }[] = [
    { biome: 'metallic', weight: 4 },
    { biome: 'toxic', weight: 3 },
    { biome: 'anomaly', weight: 2 },
    { biome: 'energy', weight: 1 },
  ];
  const totalWeight = weightedBiomes.reduce((sum, b) => sum + b.weight, 0);
  let randomValue = random() * totalWeight;

  for (const { biome, weight } of weightedBiomes) {
    randomValue -= weight;
    if (randomValue <= 0) return biome;
  }

  return 'metallic';
}

function getInnerBiome(random: () => number): BiomeType {
  const innerBiomes: BiomeType[] = ['rocky', 'ocean', 'gas_giant', 'ice'];
  return innerBiomes[Math.floor(random() * innerBiomes.length)] ?? 'rocky';
}

function rollPlanetSize(biomeType: BiomeType, random: () => number): number {
  const sizeClass = BIOME_SIZE_CLASS[biomeType];
  const { min, max } = PLANET_SIZE_RANGE[sizeClass];
  return Math.floor(random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resourceDepositBudget(
  biomeType: BiomeType,
  size: number,
  slotCount: number,
  random: () => number,
): number {
  if (biomeType === 'energy') return 0;

  const freeSlotCap = Math.max(1, slotCount - 2);
  const sizeBudget = Math.floor(size / 5) + (size >= 24 ? 2 : size >= 18 ? 1 : 0);
  const variance = random() < 0.45 ? 1 : 0;
  const anomalyBoost = isAnomalousCommonBiome(biomeType) ? 1 : 0;
  return clamp(sizeBudget + variance + anomalyBoost, 2, Math.min(8, freeSlotCap));
}

function maxDepositSlots(resourceId: string, rarity: ResourceRarity): number {
  if (resourceId === 'antimatter') return 1;
  if (['iridium', 'uranium', 'tritium'].includes(resourceId)) return 1;
  if (rarity === 'rare') return 2;
  return 5;
}

function weightedResourceCandidates(biomeType: BiomeType): WeightedResourceCandidate[] {
  const biome = BIOMES[biomeType];
  return [
    ...biome.commonResources.map((resourceId) => ({
      resourceId,
      rarity: 'common' as const,
      weight: resourceId === 'antimatter' ? 2 : 4,
    })),
    ...biome.rareResources.map((resourceId) => ({
      resourceId,
      rarity: 'rare' as const,
      weight: 1,
    })),
  ];
}

function pickWeightedResource(
  candidates: WeightedResourceCandidate[],
  counts: Map<string, number>,
  random: () => number,
): WeightedResourceCandidate | null {
  const available = candidates.filter(
    (candidate) =>
      (counts.get(candidate.resourceId) ?? 0) <
      maxDepositSlots(candidate.resourceId, candidate.rarity),
  );
  if (available.length === 0) return null;

  const totalWeight = available.reduce((sum, candidate) => sum + candidate.weight, 0);
  let randomValue = random() * totalWeight;
  for (const candidate of available) {
    randomValue -= candidate.weight;
    if (randomValue <= 0) return candidate;
  }
  return available[available.length - 1] ?? null;
}

export function generateCommonPlanetRichness(
  biomeType: BiomeType,
  size: number,
  slotCount: number,
  random: () => number,
): Record<string, number> {
  const budget = resourceDepositBudget(biomeType, size, slotCount, random);
  if (budget <= 0) return {};

  const candidates = weightedResourceCandidates(biomeType);
  if (candidates.length === 0) return {};

  const counts = new Map<string, number>();
  let usedSlots = 0;
  let attempts = 0;
  while (usedSlots < budget && attempts < budget * 12) {
    attempts += 1;
    const selected = pickWeightedResource(candidates, counts, random);
    if (!selected) break;
    counts.set(selected.resourceId, (counts.get(selected.resourceId) ?? 0) + 1);
    usedSlots += 1;
  }

  return Object.fromEntries(counts.entries());
}

function calculateDistance(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dz = z1 - z2;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

interface SystemPosition {
  x: number;
  y: number;
  z: number;
}

function generateSystemPosition(
  random: () => number,
  sectorX: number,
  sectorY: number,
  sectorZ: number,
  existingPositions: SystemPosition[]
): SystemPosition {
  const maxAttempts = 100;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = sectorX * SECTOR_SIZE + random() * SECTOR_SIZE;
    const y = sectorY * SECTOR_SIZE + random() * SECTOR_SIZE;
    const z = sectorZ * SECTOR_SIZE + random() * SECTOR_SIZE;

    const tooClose = existingPositions.some(pos =>
      calculateDistance(x, y, z, pos.x, pos.y, pos.z) < MIN_DISTANCE
    );

    if (!tooClose) {
      return { x, y, z };
    }
  }

  return {
    x: sectorX * SECTOR_SIZE + random() * SECTOR_SIZE,
    y: sectorY * SECTOR_SIZE + random() * SECTOR_SIZE,
    z: sectorZ * SECTOR_SIZE + random() * SECTOR_SIZE,
  };
}

export async function generateSystemsInSector(sector: any, targetCount: number = DEFAULT_TARGET_COUNT, tx?: any) {

  const database = tx || defaultDb;

  const existingSystems = await database.query.systems.findMany({
    where: (systemsTable: any, { and, eq }: any) => and(
      eq(systemsTable.sectorX, sector.x),
      eq(systemsTable.sectorY, sector.y),
      eq(systemsTable.sectorZ, sector.z)
    ),
  });

  if (existingSystems.length >= targetCount) {
    return existingSystems;
  }

  const systemsToCreate = Math.min(targetCount - existingSystems.length, MAX_SYSTEMS_PER_SECTOR - existingSystems.length);

  if (systemsToCreate <= 0) {
    return existingSystems;
  }

  const seed = sector.seed;
  const random = createRandom(seed);

  const existingPositions: SystemPosition[] = existingSystems
    .filter((s: any) => s.x != null)
    .map((s: any) => ({ x: Number(s.x), y: Number(s.y), z: Number(s.z) }));

  const newSystems = [];

  for (let i = 0; i < systemsToCreate; i++) {
    const position = generateSystemPosition(
      random,
      sector.x,
      sector.y,
      sector.z,
      existingPositions
    );

    const systemId = randomUUID();
    const systemSeed = Math.floor(random() * 1000000);
    const systemShortTag = homeSystemShortTag(systemId);
    const systemName = formatCommonSystemDisplayName('en', systemShortTag);

    const [newSystem] = await database.insert(systems).values({
      id: systemId,
      sectorX: sector.x,
      sectorY: sector.y,
      sectorZ: sector.z,
      x: position.x.toFixed(2),
      y: position.y.toFixed(2),
      z: position.z.toFixed(2),
      name: systemName,
      seed: systemSeed,
      isHome: false,
      ownerId: null,
    }).returning();

    newSystems.push(newSystem);

    existingPositions.push(position);

    const planetCount =
      Math.floor(random() * (COMMON_SYSTEM_PLANET_COUNT_MAX - COMMON_SYSTEM_PLANET_COUNT_MIN + 1)) +
      COMMON_SYSTEM_PLANET_COUNT_MIN;
    let hasAnomalousPlanet = false;

    for (let p = 0; p < planetCount; p++) {
      const mustGuaranteeAnomaly: boolean =
        planetCount === COMMON_SYSTEM_PLANET_COUNT_MAX &&
        p === planetCount - 1 &&
        !hasAnomalousPlanet;
      let biomeType: BiomeType;
      if (mustGuaranteeAnomaly) {
        biomeType = getAnomalousBiomeByWeight(random);
      } else if (p < 2) {
        biomeType = getInnerBiome(random);
      } else {
        biomeType = getBiomeByWeight(random);
      }
      hasAnomalousPlanet = hasAnomalousPlanet || isAnomalousCommonBiome(biomeType);
      const size = rollPlanetSize(biomeType, random);
      const slotCount = Math.max(4, Math.floor(size * 0.75));

      const [planet] = await database.insert(planets).values({
        systemId: newSystem.id,
        biome: biomeType,
        size,
        slotCount,
        name: formatPlanetCode(systemShortTag, p + 1),
      }).returning();

      const richnessByResource = generateCommonPlanetRichness(
        biomeType,
        size,
        slotCount,
        random,
      );
      for (const [resourceId, value] of Object.entries(richnessByResource)) {
        await database.insert(richness).values({
          planetId: planet.id,
          resourceId,
          value,
        });
        await database.insert(planetResources).values({
          planetId: planet.id,
          resourceId,
          amount: '0',
          regenRate: '0',
        });
      }
    }
  }

  return [...existingSystems, ...newSystems];
}
