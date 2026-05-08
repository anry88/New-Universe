import { db as defaultDb } from '../../db/index.js';
import { 
  systems, 
  planets, 
  richness, 
  planetResources, 
  buildings, 
  discoveredPlanets 
} from '../../db/schema.js';
import { BIOMES, BiomeType } from './biomes.js';

function createRandom(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

export async function generateHomeSystem(userId: string, tx?: any) {
  const SERVER_SECRET = process.env.SERVER_SECRET || 'default-secret';
  const seed = hashString(`${userId}-${SERVER_SECRET}`);
  const random = createRandom(seed);

  const perform = async (database: any) => {
    const existing = await database.query.systems.findFirst({
      where: (systems: any, { and, eq }: any) => and(eq(systems.ownerId, userId), eq(systems.isHome, true)),
    });
    if (existing) return existing.id;

    const sectorX = Math.floor(random() * 1001) - 500;
    const sectorY = Math.floor(random() * 1001) - 500;
    const sectorZ = Math.floor(random() * 1001) - 500;
    
    const [system] = await database.insert(systems).values({
      ownerId: userId,
      isHome: true,
      sectorX,
      sectorY,
      sectorZ,
      name: `Home System ${userId.slice(0, 4)}`,
      seed: Math.floor(random() * 1000000),
    }).returning();

    const planetCount = Math.floor(random() * 4) + 4;
    const homeBiomes: BiomeType[] = ['rocky', 'ocean', 'green', 'ice'];

    for (let i = 0; i < planetCount; i++) {
      const biomeType = homeBiomes[Math.floor(random() * homeBiomes.length)];
      const size = Math.floor(random() * 10) + 10;
      const slotCount = Math.floor(size * 0.8);

      const [planet] = await database.insert(planets).values({
        systemId: system.id,
        biome: biomeType,
        size,
        slotCount,
        name: `${system.name} - ${i + 1}`,
      }).returning();
      
      const planetResourcesList: string[] = [];
      
      if (i === 0) {
        planetResourcesList.push('water', 'iron', 'carbon', 'silicon', 'methane');
      } else if (i === 1) {
        planetResourcesList.push('tritium');
        planetResourcesList.push(...BIOMES[biomeType].commonResources);
      } else {
        planetResourcesList.push(...BIOMES[biomeType].commonResources);
        if (random() > 0.5) planetResourcesList.push(...BIOMES[biomeType].rareResources);
      }

      const uniqueResources = [...new Set(planetResourcesList)];

      for (const resId of uniqueResources) {
        const t3t4forbidden = ['mercury', 'magnesium', 'lead', 'uranium', 'cobalt', 'silicon_carbide', 'antimatter', 'dark_matter', 'iridium'];
        if (t3t4forbidden.includes(resId)) continue;

        let resRichness = random() * 2 + 0.5;
        if (resId === 'tritium') {
          resRichness = random() * 0.5 + 0.3;
        }

        await database.insert(richness).values({
          planetId: planet.id,
          resourceId: resId,
          value: Math.round(resRichness),
        });

        await database.insert(planetResources).values({
          planetId: planet.id,
          resourceId: resId,
          amount: '1000',
          regenRate: (resRichness * 10).toString(),
        });
      }

      if (i === 0) {
        await database.insert(buildings).values({
          planetId: planet.id,
          typeId: 'command_center',
          level: 1,
          slotIndex: 0,
        });

        await database.insert(discoveredPlanets).values({
          userId,
          planetId: planet.id,
        });
      }
    }

    return system.id;
  };

  if (tx) {
    return await perform(tx);
  } else {
    return await defaultDb.transaction(async (nestedTx) => {
      return await perform(nestedTx);
    });
  }
}
