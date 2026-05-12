/**
 * Numeric mirrors of backend seeds / config. Update when changing:
 * - backend/src/db/seed/building-types.ts
 * - backend/src/db/seed/ship-types.ts
 * - shared/config/researchCatalog.ts (canonical tree; re-exported as backend/src/config/research-catalog.ts)
 * - backend/src/config/colonization-rules.ts
 * - backend/src/config/market-prices.ts
 * - backend/src/features/world/biomes.ts (`HOME_SYSTEM_BASE_BIOMES`) / home-system-generator.ts (planet counts, capital slots)
 */

/** Mirrors `HOME_SYSTEM_BASE_BIOMES` in `backend/src/features/world/biomes.ts`. */
export const HOME_SYSTEM_BASE_BIOME_IDS = [
  'green',
  'rocky',
  'ocean',
  'ice',
  'gas_giant',
  'volcanic',
] as const;

/** Mirrors fixed home genesis planet count (`generateHomeSystem`). */
export const HOME_SYSTEM_PLANET_COUNT_MIN = 9;
export const HOME_SYSTEM_PLANET_COUNT_MAX = 9;

export const BUILDINGS = {
  command_center: {
    deps: [] as { typeId: string; level: number }[],
    baseCost: { iron: 80, carbon: 40, silicon: 10 } as Record<string, number>,
    baseTimeSec: 600,
    category: 'base',
    /** Mirrors seeded `building_types.max_per_planet`. */
    maxPerPlanet: 1 as const,
  },
  mine: {
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 120, carbon: 40 },
    baseTimeSec: 300,
    category: 'production',
    output: { resourceId: 'iron', baseRate: 50 },
  },
  drill: {
    deps: [
      { typeId: 'command_center', level: 1 },
      { typeId: 'solar_plant', level: 1 },
    ],
    baseCost: { silicon: 100, carbon: 80 },
    baseTimeSec: 360,
    category: 'production',
    output: { resourceId: 'water', baseRate: 60 },
  },
  storage: {
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 150, carbon: 50 },
    baseTimeSec: 600,
    category: 'logistics',
    storageBonusPerLevel: 5000,
  },
  oil_pump: {
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 220, silicon: 140, carbon: 120 },
    baseTimeSec: 720,
    category: 'production',
    output: { resourceId: 'oil', baseRate: 45 },
  },
  biomass_harvester: {
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 180, carbon: 160, water: 120 },
    baseTimeSec: 840,
    category: 'production',
    output: { resourceId: 'biomass', baseRate: 18 },
  },
  smelter: {
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 400, silicon: 200 },
    baseTimeSec: 900,
    category: 'production',
    recipes: ['steel_from_iron_water'],
  },
  fabrication_bay: {
    deps: [
      { typeId: 'command_center', level: 3 },
      { typeId: 'smelter', level: 1 },
    ],
    baseCost: { iron: 450, silicon: 350, carbon: 150, steel: 120 },
    baseTimeSec: 1200,
    category: 'production',
    recipes: ['electronics_standard'],
  },
  refinery: {
    deps: [
      { typeId: 'command_center', level: 3 },
      { typeId: 'smelter', level: 2 },
    ],
    baseCost: { iron: 550, silicon: 320, steel: 180 },
    baseTimeSec: 1500,
    category: 'production',
    recipes: ['fuel_from_oil', 'fuel_from_methane'],
  },
  cryo_factory: {
    deps: [
      { typeId: 'spaceport', level: 2 },
      { typeId: 'smelter', level: 3 },
    ],
    baseCost: { iron: 600, silicon: 200, magnesium: 50 },
    baseTimeSec: 2700,
    category: 'production',
    recipes: ['water_from_ice', 'ice_from_water'],
  },
  spaceport: {
    deps: [{ typeId: 'command_center', level: 4 }],
    baseCost: { iron: 500, carbon: 500 },
    baseTimeSec: 1200,
    category: 'ships',
  },
  shipyard: {
    deps: [{ typeId: 'spaceport', level: 2 }],
    baseCost: { iron: 800, silicon: 400 },
    baseTimeSec: 1800,
    category: 'ships',
  },
  lab: {
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 300, silicon: 600 },
    baseTimeSec: 1800,
    category: 'progress',
    /** Mirrors seeded `building_types.max_global`. */
    maxGlobal: 1 as const,
  },
  solar_plant: {
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { silicon: 150, iron: 50 },
    baseTimeSec: 600,
    category: 'energy',
  },
} as const;

export type BuildingId = keyof typeof BUILDINGS;

export const SHIPS = {
  scout: {
    buildCost: { iron: 100, silicon: 50, fuel: 30 },
    buildTimeSec: 600,
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
  },
  cargo_light: {
    buildCost: { iron: 300, aluminum: 100, electronics: 50 },
    buildTimeSec: 1200,
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
  },
  colonizer: {
    buildCost: { steel: 2500, silicon: 800, biomass: 400 },
    buildTimeSec: 14400,
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
  },
  recon_probe: {
    buildCost: { silicon: 40, fuel: 20, electronics: 10 },
    buildTimeSec: 300,
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
  },
} as const;

export type ShipId = keyof typeof SHIPS;

/** Research tier costs/times — highest completed tier per branch applies (matches backend effects lookup). */
export const RESEARCH_TIERS: Record<
  string,
  Record<number, { cost: Record<string, number>; timeSec: number; effects: Array<{ target: string; multiplier: number }> }>
> = {
  mining: {
    1: { cost: { iron: 120, silicon: 60 }, timeSec: 90, effects: [{ target: 'resourceProduction', multiplier: 1.05 }] },
    2: { cost: { iron: 280, silicon: 140 }, timeSec: 210, effects: [{ target: 'resourceProduction', multiplier: 1.1 }] },
    3: { cost: { iron: 520, silicon: 260 }, timeSec: 420, effects: [{ target: 'resourceProduction', multiplier: 1.15 }] },
  },
  engineering: {
    1: { cost: { iron: 150, silicon: 70 }, timeSec: 120, effects: [{ target: 'buildTime', multiplier: 0.97 }] },
    2: { cost: { iron: 340, silicon: 160 }, timeSec: 270, effects: [{ target: 'buildTime', multiplier: 0.94 }] },
    3: { cost: { iron: 620, silicon: 300 }, timeSec: 540, effects: [{ target: 'buildTime', multiplier: 0.91 }] },
  },
  logistics: {
    1: { cost: { iron: 200, silicon: 180 }, timeSec: 210, effects: [{ target: 'resourceStorage', multiplier: 1.08 }] },
    2: { cost: { iron: 430, silicon: 380 }, timeSec: 450, effects: [{ target: 'resourceStorage', multiplier: 1.16 }] },
    3: { cost: { iron: 760, silicon: 700 }, timeSec: 900, effects: [{ target: 'resourceStorage', multiplier: 1.24 }] },
  },
  engines: {
    1: { cost: { iron: 220, silicon: 110 }, timeSec: 150, effects: [{ target: 'shipSpeed', multiplier: 1.05 }] },
    2: { cost: { iron: 460, silicon: 230 }, timeSec: 330, effects: [{ target: 'shipSpeed', multiplier: 1.1 }] },
    3: { cost: { iron: 820, silicon: 410 }, timeSec: 660, effects: [{ target: 'shipSpeed', multiplier: 1.15 }] },
  },
};

export const COLONIZATION = {
  foundingCost: {
    iron: 10000,
    water: 5000,
    carbon: 2000,
    silicon: 1000,
  },
  researchRequirement: { branch: 'engineering', level: 2 },
} as const;

/** Tier map for baseline NPC pricing when a resource id has no explicit baseline row in game config. */
export const RESOURCE_TIER: Record<string, number> = {
  water: 1,
  iron: 1,
  carbon: 1,
  silicon: 1,
  methane: 1,
  fuel: 1,
  copper: 2,
  aluminum: 2,
  titanium: 2,
  ice: 2,
  oil: 2,
  sulfur: 2,
  steel: 2,
  electronics: 2,
  mercury: 3,
  magnesium: 3,
  lead: 3,
  uranium: 3,
  cobalt: 3,
  silicon_carbide: 3,
  tritium: 3,
  antimatter: 4,
  dark_matter: 4,
  iridium: 4,
  biomass: 4,
};

export const RESOURCE_BASELINE_PRICE: Record<string, number> = {
  water: 10,
  iron: 12,
  carbon: 11,
  silicon: 14,
  methane: 13,
  copper: 44,
  aluminum: 46,
  titanium: 55,
  ice: 42,
  oil: 45,
  sulfur: 40,
  steel: 50,
  electronics: 54,
  mercury: 170,
  magnesium: 165,
  lead: 160,
  uranium: 230,
  cobalt: 190,
  silicon_carbide: 210,
  tritium: 280,
  antimatter: 840,
  dark_matter: 920,
  iridium: 780,
  biomass: 620,
};

export const TIER_BASELINE_PRICE: Record<number, number> = {
  1: 12,
  2: 48,
  3: 180,
  4: 720,
};

export const MARKET_SPREAD_BPS_BY_TIER: Record<number, number> = {
  1: 900,
  2: 1200,
  3: 1700,
  4: 2500,
};
