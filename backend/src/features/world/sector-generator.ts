import { db as defaultDb } from '../../db/index.js';
import { systems, planets, richness, planetResources } from '../../db/schema.js';
import { BIOMES, BiomeType } from './biomes.js';

const SECTOR_SIZE = 500;
const MIN_DISTANCE = 50;
const MAX_SYSTEMS_PER_SECTOR = 12;
const DEFAULT_TARGET_COUNT = 5;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
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
    { biome: 'rocky', weight: 25 },
    { biome: 'ocean', weight: 20 },
    { biome: 'gas_giant', weight: 15 },
    { biome: 'ice', weight: 15 },
    { biome: 'volcanic', weight: 10 },
    { biome: 'green', weight: 10 },
    { biome: 'anomaly', weight: 5 },
  ];

  const totalWeight = weightedBiomes.reduce((sum, b) => sum + b.weight, 0);
  let randomValue = random() * totalWeight;

  for (const { biome, weight } of weightedBiomes) {
    randomValue -= weight;
    if (randomValue <= 0) return biome;
  }

  return 'rocky';
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
    where: (systems: any, { and, eq }: any) => and(
      eq(systems.sectorX, sector.x),
      eq(systems.sectorY, sector.y),
      eq(systems.sectorZ, sector.z)
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

    const systemSeed = Math.floor(random() * 1000000);
    const systemName = `System ${sector.x},${sector.y},${sector.z}-${existingSystems.length + i + 1}`;

    const [newSystem] = await database.insert(systems).values({
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

    const planetCount = Math.floor(random() * 4) + 4;
    const allBiomes: BiomeType[] = ['rocky', 'ocean', 'gas_giant', 'ice', 'volcanic', 'green', 'anomaly'];

    for (let p = 0; p < planetCount; p++) {
      const biomeType = p < 2 ? allBiomes[Math.floor(random() * 4)] : getBiomeByWeight(random);
      const size = Math.floor(random() * 10) + 10;
      const slotCount = Math.floor(size * 0.8);

      await database.insert(planets).values({
        systemId: newSystem.id,
        biome: biomeType,
        size,
        slotCount,
        name: `${systemName} - ${p + 1}`,
      });
    }
  }

  return [...existingSystems, ...newSystems];
}
