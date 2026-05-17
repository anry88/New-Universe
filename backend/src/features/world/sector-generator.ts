import { randomUUID } from 'node:crypto';
import {
  formatCommonSystemDisplayName,
  formatPlanetCode,
  homeSystemShortTag,
} from '@shared/format/homeSystemNaming.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import { systems, planets, richness, planetResources, sectors } from '../../db/schema.js';
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
export const COMMON_POOL_INITIAL_SYSTEM_COUNT = 5;
export const COMMON_SYSTEM_PLANET_COUNT_MIN = 6;
export const COMMON_SYSTEM_PLANET_COUNT_MAX = 9;

const COMMON_POOL_SECTOR_Y = 0;
const COMMON_POOL_SECTOR_Z = 0;
const COMMON_SYSTEM_BASE_BIOME_ORDER = [
  'volcanic',
  'rocky',
  'ocean',
  'green',
  'gas_giant',
  'ice',
] as const satisfies readonly BiomeType[];

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

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
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

function commonSystemBiomePlan(planetCount: number, random: () => number): BiomeType[] {
  const plan: BiomeType[] = [...COMMON_SYSTEM_BASE_BIOME_ORDER];

  while (plan.length < planetCount) {
    const anomaly = getAnomalousBiomeByWeight(random);
    const insertAt = 1 + Math.floor(random() * Math.max(1, plan.length - 1));
    plan.splice(insertAt, 0, anomaly);
  }

  return plan;
}

function publicSystemWhere(table = systems) {
  return and(
    eq(table.isHome, false),
    isNull(table.ownerId),
  );
}

async function updateSectorSystemCount(
  sector: { x: number; y: number; z: number },
  systemCount: number,
  database: any,
) {
  await database
    .update(sectors)
    .set({ systemCount })
    .where(and(
      eq(sectors.x, sector.x),
      eq(sectors.y, sector.y),
      eq(sectors.z, sector.z),
    ));
}

export async function generateSystemsInSector(sector: any, targetCount: number = DEFAULT_TARGET_COUNT, tx?: any) {

  const database = tx || defaultDb;

  const existingSystems = await database.query.systems.findMany({
    where: (systemsTable: any, { and, eq }: any) => and(
      eq(systemsTable.sectorX, sector.x),
      eq(systemsTable.sectorY, sector.y),
      eq(systemsTable.sectorZ, sector.z),
      eq(systemsTable.isHome, false),
      sql`${systemsTable.ownerId} IS NULL`,
    ),
  });

  if (existingSystems.length >= targetCount) {
    await updateSectorSystemCount(sector, existingSystems.length, database);
    return existingSystems;
  }

  const systemsToCreate = Math.min(targetCount - existingSystems.length, MAX_SYSTEMS_PER_SECTOR - existingSystems.length);

  if (systemsToCreate <= 0) {
    await updateSectorSystemCount(sector, existingSystems.length, database);
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
    const biomePlan = commonSystemBiomePlan(planetCount, random);

    for (let p = 0; p < planetCount; p++) {
      const biomeType = biomePlan[p]!;
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

  await updateSectorSystemCount(sector, existingSystems.length + newSystems.length, database);

  return [...existingSystems, ...newSystems];
}

async function ensureCommonPoolSectorRow(
  coordinates: { x: number; y: number; z: number },
  database: any,
) {
  const existing = await database.query.sectors.findFirst({
    where: (sectorTable: any, { and, eq }: any) => and(
      eq(sectorTable.x, coordinates.x),
      eq(sectorTable.y, coordinates.y),
      eq(sectorTable.z, coordinates.z),
    ),
  });
  if (existing) return existing;

  const [sector] = await database
    .insert(sectors)
    .values({
      ...coordinates,
      seed: hashString(`common-pool:${coordinates.x},${coordinates.y},${coordinates.z}`),
    })
    .returning();

  return sector;
}

async function nextCommonPoolSectorCoordinates(database: any) {
  const rows = await database
    .select({
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      count: sql<number>`count(*)::int`,
    })
    .from(systems)
    .where(publicSystemWhere())
    .groupBy(systems.sectorX, systems.sectorY, systems.sectorZ);

  const usedCommonPoolSectorX = new Set(
    rows
      .filter((row: any) => row.sectorY === COMMON_POOL_SECTOR_Y && row.sectorZ === COMMON_POOL_SECTOR_Z)
      .map((row: any) => Number(row.sectorX)),
  );

  let nextSectorX = 0;
  while (usedCommonPoolSectorX.has(nextSectorX)) {
    nextSectorX += 1;
  }

  return { x: nextSectorX, y: COMMON_POOL_SECTOR_Y, z: COMMON_POOL_SECTOR_Z };
}

async function resolveWritableCommonPoolSector(database: any, forceNewSector = false) {
  if (forceNewSector) {
    return ensureCommonPoolSectorRow(await nextCommonPoolSectorCoordinates(database), database);
  }

  const rows = await database
    .select({
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      count: sql<number>`count(*)::int`,
    })
    .from(systems)
    .where(publicSystemWhere())
    .groupBy(systems.sectorX, systems.sectorY, systems.sectorZ);

  const nonFull = rows
    .map((row: any) => ({
      x: row.sectorX,
      y: row.sectorY,
      z: row.sectorZ,
      count: Number(row.count),
    }))
    .filter((row: any) => row.count < MAX_SYSTEMS_PER_SECTOR)
    .sort((a: any, b: any) => a.x - b.x || a.y - b.y || a.z - b.z)[0];

  if (nonFull) {
    return ensureCommonPoolSectorRow(nonFull, database);
  }

  return ensureCommonPoolSectorRow(await nextCommonPoolSectorCoordinates(database), database);
}

export async function countCommonPoolSystems(tx?: any): Promise<number> {
  const database = tx || defaultDb;
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(systems)
    .where(publicSystemWhere());

  return Number(row?.count ?? 0);
}

export async function countCommonPoolSectors(tx?: any): Promise<number> {
  const database = tx || defaultDb;
  const [row] = await database
    .select({
      count: sql<number>`count(distinct (${systems.sectorX}, ${systems.sectorY}, ${systems.sectorZ}))::int`,
    })
    .from(systems)
    .where(publicSystemWhere());

  return Number(row?.count ?? 0);
}

export async function createCommonPoolSystems(
  count: number,
  tx?: any,
  options: { forceNewSector?: boolean } = {},
) {
  const database = tx || defaultDb;
  const createdSystems = [];
  let remaining = Math.max(0, Math.floor(count));

  while (remaining > 0) {
    const sector = await resolveWritableCommonPoolSector(database, options.forceNewSector);
    const existingSystems = await database.query.systems.findMany({
      where: (systemsTable: any, { and, eq }: any) => and(
        eq(systemsTable.sectorX, sector.x),
        eq(systemsTable.sectorY, sector.y),
        eq(systemsTable.sectorZ, sector.z),
        eq(systemsTable.isHome, false),
        sql`${systemsTable.ownerId} IS NULL`,
      ),
    });
    const capacity = MAX_SYSTEMS_PER_SECTOR - existingSystems.length;
    if (capacity <= 0) {
      await updateSectorSystemCount(sector, existingSystems.length, database);
      continue;
    }

    const targetCount = existingSystems.length + Math.min(capacity, remaining);
    const sectorSystems = await generateSystemsInSector(sector, targetCount, database);
    const newSectorSystems = sectorSystems.slice(existingSystems.length);
    createdSystems.push(...newSectorSystems);
    remaining -= newSectorSystems.length;

    if (options.forceNewSector) {
      options.forceNewSector = false;
    }
  }

  return createdSystems;
}
