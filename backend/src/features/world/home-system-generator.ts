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
import {
  BIOME_ORBIT_TIER,
  BIOME_SIZE_CLASS,
  BiomeType,
  PLANET_SIZE_RANGE,
  PlanetSizeClass,
} from './biomes.js';

/**
 * Capital planet (green, orbit tier 4) needs enough slots for the bootstrap
 * progression: command_center, mine, drill, smelter, fabrication_bay,
 * spaceport, shipyard, lab, solar_plants + room for storage and a small
 * fleet from local resource loops.
 */
export const MIN_HOME_CAPITAL_SLOT_COUNT = 22;

/**
 * Fixed at 9 planets so every new player gets the full starter resource
 * surface without making rare/extreme worlds common.
 */
export const HOME_PLANET_COUNT = 9;

/**
 * Planned starter layout (orbit inner → outer). One slot per biome below
 * is one planet on its own orbit. Capital is always green and pre-built
 * with a command_center + auto-discovered for the player.
 *
 *   tier 1 — volcanic (hot sulfur/copper world)
 *   tier 1 — volcanic (hot titanium/sulfur reserve)
 *   tier 2 — rocky    (iron/copper/aluminum belt)
 *   tier 2 — rocky    (silicon/carbon/titanium belt)
 *   tier 3 — ocean    (water/biomass)
 *   tier 4 — green    ★ capital (habitable, deeper safe orbit)
 *   tier 5 — gas_giant (methane/tritium)
 *   tier 6 — ice      (ice/water outer body; no biomass)
 *   tier 6 — ice      (ice/tritium outer reserve; no biomass)
 */
interface HomePlanetOrbitPlanEntry {
  biome: BiomeType;
  resources: readonly string[];
  isCapital?: boolean;
}

export const HOME_PLANET_ORBIT_PLAN: readonly HomePlanetOrbitPlanEntry[] = [
  {
    biome: 'volcanic',
    resources: ['sulfur', 'iron', 'copper'],
  },
  {
    biome: 'volcanic',
    resources: ['sulfur', 'copper', 'titanium'],
  },
  {
    biome: 'rocky',
    resources: ['iron', 'copper', 'aluminum'],
  },
  {
    biome: 'rocky',
    resources: ['silicon', 'carbon', 'titanium'],
  },
  {
    biome: 'ocean',
    resources: ['water', 'biomass', 'oil'],
  },
  {
    biome: 'green',
    resources: ['water', 'iron', 'carbon', 'silicon', 'methane', 'oil', 'biomass'],
    isCapital: true,
  },
  {
    biome: 'gas_giant',
    resources: ['methane', 'tritium'],
  },
  {
    biome: 'ice',
    resources: ['ice', 'water'],
  },
  {
    biome: 'ice',
    resources: ['ice', 'water', 'tritium'],
  },
] as const;

export const HOME_PLANET_BIOME_PLAN: readonly BiomeType[] = [
  ...HOME_PLANET_ORBIT_PLAN.map((entry) => entry.biome),
] as const;

function createRandom(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

/**
 * Returns the biome plan sorted by orbit tier (volcanic → ice) so the
 * visual layout is "inner → outer" by biome. Ties (e.g. two volcanic
 * planets) are stable. We do *not* randomise this for the home system —
 * placement is part of the starter-system design.
 */
export function planHomeBiomesOrdered(): BiomeType[] {
  return [...HOME_PLANET_BIOME_PLAN].sort((a, b) => {
    const tierDelta = BIOME_ORBIT_TIER[a] - BIOME_ORBIT_TIER[b];
    if (tierDelta !== 0) return tierDelta;
    return a.localeCompare(b);
  });
}

/**
 * Picks a numeric planet size inside the band defined by its biome's
 * size class, using the provided RNG for determinism.
 */
export function rollPlanetSize(sizeClass: PlanetSizeClass, rnd: () => number): number {
  const { min, max } = PLANET_SIZE_RANGE[sizeClass];
  return Math.floor(rnd() * (max - min + 1)) + min;
}

/**
 * Starter resource stocks the capital ships with on day 1. Tuned so the
 * player can immediately queue the bootstrap chain (mine + drill + solar
 * → smelter → shipyard → colonizer) without grinding or visiting the
 * common pool first.
 */
const CAPITAL_STARTING_RESOURCES: Record<string, number> = {
  iron: 800,
  silicon: 600,
  carbon: 500,
  water: 400,
  methane: 200,
  oil: 100,
  biomass: 50,
};

export async function generateHomeSystem(userId: string, tx?: any) {
  const SERVER_SECRET = process.env.SERVER_SECRET || 'default-secret';
  const seed = hashString(`${userId}-${SERVER_SECRET}`);
  const random = createRandom(seed);

  const perform = async (database: any) => {
    const existing = await database.query.systems.findFirst({
      where: (systems: any, { and, eq }: any) =>
        and(eq(systems.ownerId, userId), eq(systems.isHome, true)),
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

    const [system] = await database
      .insert(systems)
      .values({
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
      })
      .returning();

    const shortTag = homeSystemShortTag(system.id);
    const slug = sanitizePlayerSlug(userRow.tgUsername, userRow.tgFirstName);
    const systemDisplayEn = formatHomeSystemDisplayName('en', slug, shortTag);

    await database
      .update(systems)
      .set({ name: systemDisplayEn })
      .where(eq(systems.id, system.id));

    const biomeOrbitPlan = HOME_PLANET_ORBIT_PLAN;
    if (biomeOrbitPlan.length !== HOME_PLANET_COUNT) {
      throw new Error(
        `generateHomeSystem: expected ${HOME_PLANET_COUNT} planets in biome plan, got ${biomeOrbitPlan.length}`,
      );
    }
    if (!biomeOrbitPlan.some((entry) => entry.isCapital && entry.biome === 'green')) {
      throw new Error('generateHomeSystem: capital green biome missing from plan');
    }

    // Capital is inserted FIRST so existing call sites that look up "the
    // first planet in the home system" (tests, tutorial bootstrap, queue
    // checks) still hit the planet that owns the level-1 command center.
    // The remaining planets are inserted in biome-orbit order
    // (volcanic → ice). The frontend renderer sorts visually by
    // biome-orbit tier, so the *visual* layout still places green in a
    // deeper habitable ring even though it is stored as `-1` in the database.
    const capitalPlan = biomeOrbitPlan.find((entry) => entry.isCapital)!;
    const insertionPlan = [
      capitalPlan,
      ...biomeOrbitPlan.filter((entry) => entry !== capitalPlan),
    ];

    for (let i = 0; i < insertionPlan.length; i++) {
      const planetPlan = insertionPlan[i]!;
      const biomeType = planetPlan.biome;
      const isCapital = planetPlan.isCapital === true;
      const sizeClass = BIOME_SIZE_CLASS[biomeType];
      const size = isCapital
        ? PLANET_SIZE_RANGE.medium.max
        : rollPlanetSize(sizeClass, random);

      const slotCount = isCapital
        ? Math.max(Math.floor(size * 0.9), MIN_HOME_CAPITAL_SLOT_COUNT)
        : Math.max(4, Math.floor(size * 0.7));

      const [planet] = await database
        .insert(planets)
        .values({
          systemId: system.id,
          biome: biomeType,
          size,
          slotCount,
          name: formatPlanetCode(shortTag, i + 1),
        })
        .returning();

      // Resource set per planet is hand-authored for the starter system:
      // neutral worlds carry most progression resources, while extreme
      // worlds provide one focused specialty deposit.
      const planetResourcesList = [...planetPlan.resources];

      const uniqueResources = [...new Set(planetResourcesList)];

      for (const resId of uniqueResources) {
        // T3/T4 resources are research-gated; never auto-seed at the
        // home system. Note that `tritium` is intentionally *not* in the
        // forbidden list: a single starter system must be able to build
        // a jump_ship (which requires tritium) without trading.
        const t3t4forbidden = [
          'mercury',
          'magnesium',
          'lead',
          'uranium',
          'cobalt',
          'silicon_carbide',
          'antimatter',
          'dark_matter',
          'iridium',
        ];
        if (t3t4forbidden.includes(resId)) continue;

        // Most resources roll integer richness 1..3. Richness describes
        // deposits only; passive collection starts later when an extractor
        // building is completed. Tritium is intentionally rarer so the
        // starter system can contain it without making it abundant.
        let resRichness: number;
        let storedRichness: number;
        if (resId === 'tritium') {
          resRichness = random() * 0.5 + 0.3; // 0.3..0.8
          storedRichness = Math.max(1, Math.round(resRichness));
        } else {
          resRichness = random() * 2 + 0.5; // 0.5..2.5
          storedRichness = Math.max(1, Math.round(resRichness));
        }

        await database.insert(richness).values({
          planetId: planet.id,
          resourceId: resId,
          value: storedRichness,
        });

        await database.insert(planetResources).values({
          planetId: planet.id,
          resourceId: resId,
          amount: isCapital
            ? String(CAPITAL_STARTING_RESOURCES[resId] ?? 1000)
            : '500',
          regenRate: '0',
        });
      }

      if (isCapital) {
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
