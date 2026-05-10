import { db as defaultDb } from '../../db/index.js';
import {
  systems,
  planets,
  richness,
  planetResources,
  buildings,
  discoveredPlanets,
  users,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  formatHomeSystemDisplayName,
  formatPlanetCode,
  homeSystemShortTag,
  sanitizePlayerSlug,
} from '@shared/format/homeSystemNaming.js';
import { BIOMES, BiomeType, HOME_SYSTEM_BASE_BIOMES } from './biomes.js';

/** Enough building slots on the capital for early tutorial + first ships (shipyard chain). */
export const MIN_HOME_CAPITAL_SLOT_COUNT = 18;

const HOME_PLANET_COUNT_MIN = 6;
const HOME_PLANET_COUNT_MAX = 7;

function shuffleInPlace<T>(arr: T[], rnd: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

function planHomeBiomes(planetCount: number, rnd: () => number): BiomeType[] {
  const nonGreen = HOME_SYSTEM_BASE_BIOMES.filter((b) => b !== 'green') as BiomeType[];
  shuffleInPlace(nonGreen, rnd);
  const plan: BiomeType[] = [];
  plan[0] = 'green';
  for (let i = 0; i < nonGreen.length; i++) {
    plan[i + 1] = nonGreen[i]!;
  }
  for (let i = nonGreen.length + 1; i < planetCount; i++) {
    const pool = HOME_SYSTEM_BASE_BIOMES as unknown as BiomeType[];
    plan[i] = pool[Math.floor(rnd() * pool.length)]!;
  }
  return plan;
}

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

    const x = sectorX * 500 + random() * 500;
    const y = sectorY * 500 + random() * 500;
    const z = sectorZ * 500 + random() * 500;

    const userRow = await database.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!userRow) {
      throw new Error('generateHomeSystem: user row missing');
    }

    const [system] = await database.insert(systems).values({
      ownerId: userId,
      isHome: true,
      sectorX,
      sectorY,
      sectorZ,
      x: x.toFixed(2),
      y: y.toFixed(2),
      z: z.toFixed(2),
      name: 'pending',
      seed: Math.floor(random() * 1000000),
    }).returning();

    const shortTag = homeSystemShortTag(system.id);
    const slug = sanitizePlayerSlug(userRow.tgUsername, userRow.tgFirstName);
    const systemDisplayEn = formatHomeSystemDisplayName('en', slug, shortTag);

    await database.update(systems).set({ name: systemDisplayEn }).where(eq(systems.id, system.id));

    const planetCount =
      HOME_PLANET_COUNT_MIN +
      Math.floor(random() * (HOME_PLANET_COUNT_MAX - HOME_PLANET_COUNT_MIN + 1));
    const biomePlan = planHomeBiomes(planetCount, random);

    for (let i = 0; i < planetCount; i++) {
      const biomeType = biomePlan[i]!;
      const size =
        i === 0
          ? Math.floor(random() * 5) + 22
          : Math.floor(random() * 10) + 10;
      const slotCount =
        i === 0
          ? Math.max(Math.floor(size * 0.8), MIN_HOME_CAPITAL_SLOT_COUNT)
          : Math.floor(size * 0.8);

      const [planet] = await database.insert(planets).values({
        systemId: system.id,
        biome: biomeType,
        size,
        slotCount,
        name: formatPlanetCode(shortTag, i + 1),
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
