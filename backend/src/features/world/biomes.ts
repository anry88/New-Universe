export type BiomeType =
  | 'rocky'
  | 'ocean'
  | 'gas_giant'
  | 'ice'
  | 'volcanic'
  | 'green'
  | 'anomaly'
  | 'toxic'
  | 'metallic'
  | 'energy';

/**
 * Biomes that must each appear at least once in a freshly generated home system.
 * Capital is always `green`; the remaining base biomes are placed on the other
 * orbits in biome-orbit order (see `BIOME_ORBIT_TIER`).
 * Keep in sync with `generateHomeSystem` and `tools/balance-sim` mirrors.
 */
export const HOME_SYSTEM_BASE_BIOMES = [
  'green',
  'rocky',
  'ocean',
  'ice',
  'gas_giant',
  'volcanic',
] as const satisfies readonly BiomeType[];

export type HomeSystemBaseBiome = (typeof HOME_SYSTEM_BASE_BIOMES)[number];

/**
 * Visual size class of a planet, used by the renderer to draw planets at
 * meaningfully different sizes (gas giants ≫ ice worlds ≫ rocky moons).
 * Backend stores a numeric `size` in `planets.size`; the size class is
 * derived from biome and gives the generator a sane range to sample from.
 */
export type PlanetSizeClass = 'dwarf' | 'small' | 'medium' | 'large' | 'giant';

export const PLANET_SIZE_RANGE: Record<PlanetSizeClass, { min: number; max: number }> = {
  dwarf: { min: 6, max: 10 },
  small: { min: 10, max: 16 },
  medium: { min: 16, max: 22 },
  large: { min: 22, max: 30 },
  giant: { min: 30, max: 42 },
};

/**
 * Biome → orbit tier (1 = innermost, closest to sun; higher = farther out).
 * Used to sort planets onto orbits in physically intuitive positions:
 * volcanic next to the star, ice/gas giants at the far edge.
 */
export const BIOME_ORBIT_TIER: Record<BiomeType, number> = {
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
};

/**
 * Biome → size class. Drives visual scale and slot count.
 */
export const BIOME_SIZE_CLASS: Record<BiomeType, PlanetSizeClass> = {
  volcanic: 'small',
  rocky: 'small',
  green: 'medium',
  ocean: 'medium',
  gas_giant: 'giant',
  ice: 'large',
  anomaly: 'medium',
  toxic: 'medium',
  metallic: 'large',
  energy: 'medium',
};

export const ANOMALOUS_COMMON_BIOMES = [
  'anomaly',
  'toxic',
  'metallic',
  'energy',
] as const satisfies readonly BiomeType[];

const ANOMALOUS_COMMON_BIOME_SET = new Set<BiomeType>(ANOMALOUS_COMMON_BIOMES);

export function isAnomalousCommonBiome(biome: BiomeType): boolean {
  return ANOMALOUS_COMMON_BIOME_SET.has(biome);
}

export interface Biome {
  id: BiomeType;
  name: { ru: string; en: string };
  commonResources: string[];
  rareResources: string[];
  bonuses: string[];
  penalties: string[];
  /** Lower = closer to the star. 1..6 for base biomes, 7 for anomaly. */
  orbitTier: number;
  /** Visual + slot-count class. */
  sizeClass: PlanetSizeClass;
}

export const BIOMES: Record<BiomeType, Biome> = {
  rocky: {
    id: 'rocky',
    name: { ru: 'Каменистая', en: 'Rocky' },
    commonResources: ['iron', 'copper', 'silicon', 'carbon', 'aluminum', 'silver'],
    rareResources: ['titanium', 'gold', 'magnesium'],
    bonuses: ['cheap_mines'],
    penalties: ['slow_factories'],
    orbitTier: BIOME_ORBIT_TIER.rocky,
    sizeClass: BIOME_SIZE_CLASS.rocky,
  },
  ocean: {
    id: 'ocean',
    name: { ru: 'Океаническая', en: 'Ocean' },
    commonResources: ['water', 'biomass', 'oxygen', 'hydrogen'],
    rareResources: ['oil'],
    bonuses: ['free_cooling'],
    penalties: ['slow_build'],
    orbitTier: BIOME_ORBIT_TIER.ocean,
    sizeClass: BIOME_SIZE_CLASS.ocean,
  },
  gas_giant: {
    id: 'gas_giant',
    name: { ru: 'Газовый гигант', en: 'Gas Giant' },
    commonResources: ['methane', 'oxygen', 'hydrogen', 'nitrogen'],
    rareResources: ['tritium'],
    bonuses: ['infinite_gas'],
    penalties: ['no_factories'],
    orbitTier: BIOME_ORBIT_TIER.gas_giant,
    sizeClass: BIOME_SIZE_CLASS.gas_giant,
  },
  ice: {
    id: 'ice',
    name: { ru: 'Ледяная', en: 'Ice' },
    commonResources: ['ice', 'water'],
    rareResources: ['oil', 'tritium'],
    bonuses: ['storage_plus_10'],
    penalties: ['low_energy'],
    orbitTier: BIOME_ORBIT_TIER.ice,
    sizeClass: BIOME_SIZE_CLASS.ice,
  },
  volcanic: {
    id: 'volcanic',
    name: { ru: 'Вулканическая', en: 'Volcanic' },
    commonResources: ['sulfur', 'iron', 'copper', 'magnesium'],
    rareResources: ['titanium', 'cobalt', 'uranium'],
    bonuses: ['rare_alloys_chance'],
    penalties: ['eruptions'],
    orbitTier: BIOME_ORBIT_TIER.volcanic,
    sizeClass: BIOME_SIZE_CLASS.volcanic,
  },
  green: {
    id: 'green',
    name: { ru: 'Зелёная', en: 'Green' },
    commonResources: ['biomass', 'silicon', 'water', 'oil'],
    rareResources: ['iron'],
    bonuses: ['fast_build'],
    penalties: ['expensive_colonization'],
    orbitTier: BIOME_ORBIT_TIER.green,
    sizeClass: BIOME_SIZE_CLASS.green,
  },
  anomaly: {
    id: 'anomaly',
    name: { ru: 'Аномалия', en: 'Anomaly' },
    commonResources: ['antimatter'],
    rareResources: ['iridium', 'gold', 'uranium', 'cobalt'],
    bonuses: ['antimatter', 'rare_metals'],
    penalties: ['no_colonization'],
    orbitTier: BIOME_ORBIT_TIER.anomaly,
    sizeClass: BIOME_SIZE_CLASS.anomaly,
  },
  toxic: {
    id: 'toxic',
    name: { ru: 'Токсичная', en: 'Toxic' },
    commonResources: ['mercury', 'lead', 'sulfur'],
    rareResources: ['uranium', 'cobalt'],
    bonuses: ['heavy_metals'],
    penalties: ['hazardous_environment'],
    orbitTier: BIOME_ORBIT_TIER.toxic,
    sizeClass: BIOME_SIZE_CLASS.toxic,
  },
  metallic: {
    id: 'metallic',
    name: { ru: 'Металлическая', en: 'Metallic' },
    commonResources: ['iron', 'copper', 'aluminum', 'silver', 'titanium', 'magnesium'],
    rareResources: ['gold', 'cobalt', 'iridium', 'uranium'],
    bonuses: ['dense_ore_fields'],
    penalties: ['low_volatiles'],
    orbitTier: BIOME_ORBIT_TIER.metallic,
    sizeClass: BIOME_SIZE_CLASS.metallic,
  },
  energy: {
    id: 'energy',
    name: { ru: 'Энергетическая', en: 'Energetic' },
    commonResources: [],
    rareResources: [],
    bonuses: ['energy_free_operations'],
    penalties: ['no_extraction'],
    orbitTier: BIOME_ORBIT_TIER.energy,
    sizeClass: BIOME_SIZE_CLASS.energy,
  },
};

/**
 * Returns biomes sorted by orbit tier (volcanic → ice). Ties broken by
 * lexical id for determinism in tests.
 */
export function biomesByOrbit(): BiomeType[] {
  return (Object.keys(BIOMES) as BiomeType[])
    .filter((b) => !isAnomalousCommonBiome(b))
    .sort((a, b) => BIOMES[a].orbitTier - BIOMES[b].orbitTier || a.localeCompare(b));
}
