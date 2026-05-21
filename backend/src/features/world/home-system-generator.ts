import { db as defaultDb } from '../../db/index.js';
import {
  systems,
  planets,
  richness,
  planetResources,
  buildings,
  discoveredPlanets,
  users,
  colonies,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  formatPlanetCode,
  homeSystemRandomTag,
  homeSystemShortTag,
} from '@shared/format/homeSystemNaming.js';
import {
  BIOME_ORBIT_TIER,
  BIOME_SIZE_CLASS,
  BiomeType,
  PLANET_SIZE_RANGE,
  PlanetSizeClass,
} from './biomes.js';
import { env } from '../../lib/env.js';

/**
 * Capital planet (green, orbit tier 4) needs enough slots for the bootstrap
 * progression: command_center, mine, drill, smelter, fabrication_bay,
 * spaceport, shipyard, lab, solar_plants + room for storage and a small
 * fleet from local resource loops.
 */
export const MIN_HOME_CAPITAL_SLOT_COUNT = 22;

/**
 * Fixed at 8 planets so every new player gets the full starter resource
 * surface without making rare/extreme worlds common.
 */
export const HOME_PLANET_COUNT = 8;

/**
 * Planned starter layout (orbit inner → outer). One slot per biome below
 * is one planet on its own orbit. Capital is always green and pre-built
 * with a command_center + auto-discovered for the player.
 *
 *   tier 1 — volcanic (hot sulfur/copper world)
 *   tier 1 — volcanic (hot titanium/sulfur reserve)
 *   tier 2 — rocky    (iron/copper/aluminum/silver belt)
 *   tier 2 — rocky    (silicon/carbon/titanium/gold belt)
 *   tier 3 — ocean    (water/biomass/oil + light gases)
 *   tier 4 — green    ★ capital (habitable, deeper safe orbit)
 *   tier 5 — gas_giant (methane/oxygen/hydrogen/nitrogen)
 *   tier 6 — ice      (ice/water/oil/tritium layered outer reserve)
 */
interface HomePlanetOrbitPlanEntry {
  biome: BiomeType;
  resources: readonly string[];
  isCapital?: boolean;
}

export const HOME_PLANET_ORBIT_PLAN: readonly HomePlanetOrbitPlanEntry[] = [
  {
    biome: 'volcanic',
    resources: ['sulfur', 'sulfur', 'iron', 'iron', 'copper'],
  },
  {
    biome: 'volcanic',
    resources: ['sulfur', 'sulfur', 'copper', 'copper', 'titanium'],
  },
  {
    biome: 'rocky',
    resources: ['iron', 'iron', 'copper', 'copper', 'aluminum', 'silver'],
  },
  {
    biome: 'rocky',
    resources: ['silicon', 'silicon', 'carbon', 'carbon', 'titanium', 'gold'],
  },
  {
    biome: 'ocean',
    resources: ['water', 'water', 'water', 'water', 'biomass', 'oil', 'oxygen', 'oxygen', 'hydrogen'],
  },
  {
    biome: 'green',
    resources: ['water', 'water', 'iron', 'iron', 'carbon', 'carbon', 'silicon', 'silicon', 'oil', 'methane', 'biomass'],
    isCapital: true,
  },
  {
    biome: 'gas_giant',
    resources: ['methane', 'methane', 'oxygen', 'oxygen', 'hydrogen', 'hydrogen', 'nitrogen'],
  },
  {
    biome: 'ice',
    resources: ['ice', 'ice', 'ice', 'water', 'water', 'oil', 'tritium'],
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
  const seed = hashString(`${userId}-${env.SERVER_SECRET}`);
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
    const randomName = homeSystemRandomTag(system.id);

    await database
      .update(systems)
      .set({ name: randomName })
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
    const orbitPlanWithSlots = biomeOrbitPlan.map((entry, index) => ({
      entry,
      orbitIndex: index + 1,
    }));
    const capitalPlan = orbitPlanWithSlots.find((slot) => slot.entry.isCapital)!;
    const insertionPlan = [
      capitalPlan,
      ...orbitPlanWithSlots.filter((slot) => slot !== capitalPlan),
    ];

    for (let i = 0; i < insertionPlan.length; i++) {
      const { entry: planetPlan, orbitIndex } = insertionPlan[i]!;
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
          orbitIndex,
        })
        .returning();

      // Resource slots per planet are hand-authored for the starter system.
      // Repeating a resource id in the plan means multiple local deposit
      // cells (`richness.value`), e.g. the capital has 2 iron slots and the
      // ocean world has 4 water slots.
      const planetResourcesList = [...planetPlan.resources];
      const resourceSlotCounts = new Map<string, number>();
      for (const resId of planetResourcesList) {
        resourceSlotCounts.set(resId, (resourceSlotCounts.get(resId) ?? 0) + 1);
      }

      for (const [resId, slotCount] of resourceSlotCounts.entries()) {
        // Most T3/T4 resources are research-gated; never auto-seed them at
        // the home system. Starter exceptions are explicit in the orbit plan:
        // tritium (Jump Fuel), nitrogen (rare gas), and gold (rocky rare).
        const t3t4forbidden = [
          'mercury',
          'magnesium',
          'lead',
          'uranium',
          'cobalt',
          'silicon_carbide',
          'antimatter',
          'iridium',
        ];
        if (t3t4forbidden.includes(resId)) continue;

        // Richness describes deposit slots only; passive collection starts
        // later when an extractor building is completed. Starter deposits
        // are fixed instead of random so rebalance changes remain testable.
        const storedRichness = Math.max(1, Math.min(5, slotCount));

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
        await database.insert(colonies).values({
          ownerId: userId,
          planetId: planet.id,
        });

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
