/**
 * Numeric mirrors of backend seeds / config. Update when changing:
 * - backend/src/db/seed/building-types.ts
 * - backend/src/db/seed/ship-types.ts
 * - shared/config/researchCatalog.ts (canonical tree; re-exported as backend/src/config/research-catalog.ts)
 * - backend/src/config/colonization-rules.ts
 * - backend/src/features/world/biomes.ts (`HOME_SYSTEM_BASE_BIOMES`) / home-system-generator.ts (planet counts, capital slots)
 */

/** Mirrors `shared/config/buildingUpgradeEconomy.ts`. */
export const MAX_BUILDING_LEVEL = 10;
export const BUILDING_UPGRADE_COST_MULTIPLIER = 1.6;
export const BUILDING_UPGRADE_TIME_MULTIPLIER = 1.8;
export const HIGH_TIER_UPGRADE_START_LEVEL = 6;

/** Mirrors `shared/config/resourceExtractionRates.ts`. */
export const EXTRACTABLE_RESOURCE_RATES_PER_HOUR = {
  water: 64,
  iron: 72,
  carbon: 58,
  silicon: 34,
  methane: 46,
  oxygen: 54,
  hydrogen: 50,
  copper: 28,
  aluminum: 22,
  silver: 18,
  titanium: 14,
  ice: 30,
  oil: 24,
  sulfur: 24,
  mercury: 8,
  magnesium: 8,
  lead: 7,
  nitrogen: 6,
  uranium: 3,
  cobalt: 5,
  tritium: 2,
  gold: 5,
  antimatter: 1,
  iridium: 2,
  biomass: 4,
} as const;

/** Mirrors `HIGH_TIER_UPGRADE_COSTS_BY_BUILDING` in shared upgrade economy. */
export const HIGH_TIER_UPGRADE_COSTS_BY_BUILDING = {
  command_center: { aluminum: 24, steel: 16 },
  mine: { aluminum: 10, steel: 12 },
  drill: { aluminum: 12, titanium: 6 },
  storage: { aluminum: 14, steel: 10 },
  battery: { aluminum: 16, copper: 10 },
  oil_pump: { steel: 14, titanium: 8 },
  biomass_harvester: { aluminum: 10, water: 80 },
  smelter: { aluminum: 12, titanium: 8 },
  refinery: { steel: 18, sulfur: 6, titanium: 10 },
  fabrication_bay: { copper: 18, steel: 10, titanium: 8 },
  spaceport: { aluminum: 12, steel: 26, titanium: 14 },
  shipyard: { aluminum: 16, steel: 32, titanium: 18 },
  lab: { copper: 16, steel: 8, titanium: 10 },
  cryo_factory: { aluminum: 18, titanium: 8 },
  solar_plant: { aluminum: 14, copper: 10 },
  wind_turbine: { aluminum: 18, titanium: 8 },
  fuel_generator: { copper: 10, steel: 18, titanium: 8 },
  atomic_reactor: { lead: 12, steel: 24, silicon_carbide: 10 },
  military_shipyard: { steel: 30, military_alloy: 14, military_composite: 8 },
} as const satisfies Record<string, Record<string, number>>;

function scaleResourceCostMap(costs: Record<string, number>, multiplier: number): Record<string, number> {
  const scaled: Record<string, number> = {};
  for (const [resourceId, amount] of Object.entries(costs)) {
    const nextAmount = Math.floor(amount * multiplier);
    if (nextAmount > 0) scaled[resourceId] = nextAmount;
  }
  return scaled;
}

function mergeResourceCostMaps(...maps: Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [resourceId, amount] of Object.entries(map)) {
      merged[resourceId] = (merged[resourceId] ?? 0) + amount;
    }
  }
  return merged;
}

export function buildingUpgradeResourceCosts(input: {
  typeId: string;
  baseCost: Record<string, number>;
  currentLevel: number;
}): Record<string, number> {
  const baseCosts = scaleResourceCostMap(
    input.baseCost,
    Math.pow(BUILDING_UPGRADE_COST_MULTIPLIER, input.currentLevel),
  );
  const targetLevel = input.currentLevel + 1;
  if (targetLevel < HIGH_TIER_UPGRADE_START_LEVEL) return baseCosts;

  const extraBase = HIGH_TIER_UPGRADE_COSTS_BY_BUILDING[input.typeId];
  if (!extraBase) return baseCosts;

  const extraCosts = scaleResourceCostMap(
    extraBase,
    Math.pow(BUILDING_UPGRADE_COST_MULTIPLIER, targetLevel - HIGH_TIER_UPGRADE_START_LEVEL),
  );
  return mergeResourceCostMaps(baseCosts, extraCosts);
}

export function buildingUpgradeTimeSeconds(baseTimeSec: number, currentLevel: number): number {
  return Math.floor(baseTimeSec * Math.pow(BUILDING_UPGRADE_TIME_MULTIPLIER, currentLevel));
}

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
export const HOME_SYSTEM_PLANET_COUNT_MIN = 8;
export const HOME_SYSTEM_PLANET_COUNT_MAX = 8;

/** Mirrors `shared/config/expeditionRouting.ts`. */
export const JUMP_FUEL_RESOURCE_ID = 'jump_fuel';
export const JUMP_GATE_JUMP_FUEL_COST = 50;

/** Mirrors `jump_fuel_from_ice_tritium` in `shared/config/productionRecipes.ts`. */
export const JUMP_FUEL_RECIPE = {
  id: 'jump_fuel_from_ice_tritium',
  buildingId: 'refinery',
  output: { resourceId: JUMP_FUEL_RESOURCE_ID, amount: 1 },
  inputs: { ice: 3, tritium: 0.05, sulfur: 0.2 },
  baseDurationSec: 18,
} as const;

export const ATOMIC_REACTOR_RECIPES = {
  energy_from_uranium_cell: {
    id: 'energy_from_uranium_cell',
    buildingId: 'atomic_reactor',
    output: { resourceId: 'energy', amount: 900 },
    inputs: { uranium: 0.4, lead: 1.5, water: 2 },
    baseDurationSec: 180,
  },
  energy_from_tritium_cell: {
    id: 'energy_from_tritium_cell',
    buildingId: 'atomic_reactor',
    output: { resourceId: 'energy', amount: 1300 },
    inputs: { tritium: 0.25, liquid_nitrogen: 1, water: 2 },
    baseDurationSec: 240,
  },
} as const;

export const BUILDINGS = {
  command_center: {
    deps: [] as { typeId: string; level: number }[],
    baseCost: { iron: 80, carbon: 40, silicon: 10 } as Record<string, number>,
    baseTimeSec: 600,
    category: 'base',
    maxLevel: MAX_BUILDING_LEVEL,
    /** Mirrors seeded `building_types.max_per_planet`. */
    maxPerPlanet: 1 as const,
  },
  mine: {
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 120, carbon: 40 },
    baseTimeSec: 300,
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    output: { resourceId: 'iron', baseRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.iron },
  },
  drill: {
    deps: [
      { typeId: 'command_center', level: 1 },
      { typeId: 'solar_plant', level: 1 },
    ],
    baseCost: { silicon: 100, carbon: 80 },
    baseTimeSec: 360,
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    output: { resourceId: 'methane', baseRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.methane },
  },
  battery: {
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 120, silicon: 90, carbon: 40 },
    baseTimeSec: 420,
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    energyStoragePerLevel: 500,
  },
  storage: {
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 150, carbon: 50 },
    baseTimeSec: 600,
    category: 'logistics',
    maxLevel: MAX_BUILDING_LEVEL,
    storageBonusPerLevel: 5000,
  },
  oil_pump: {
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 220, silicon: 140, carbon: 120 },
    baseTimeSec: 720,
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    output: { resourceId: 'oil', baseRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.oil },
  },
  biomass_harvester: {
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 180, carbon: 160, water: 120 },
    baseTimeSec: 840,
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    output: { resourceId: 'biomass', baseRate: EXTRACTABLE_RESOURCE_RATES_PER_HOUR.biomass },
  },
  smelter: {
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 400, silicon: 200 },
    baseTimeSec: 900,
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    recipes: ['steel_from_iron_water', 'military_alloy_from_iron_silver'],
  },
  fabrication_bay: {
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 450, silicon: 350, carbon: 150, steel: 120 },
    baseTimeSec: 1200,
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    recipes: ['electronics_standard', 'military_composite_from_carbon_silicon'],
  },
  refinery: {
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 550, silicon: 320, steel: 180 },
    baseTimeSec: 1500,
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    recipes: ['fuel_from_oil', 'fuel_from_methane', 'jump_fuel_from_ice_tritium'],
  },
  cryo_factory: {
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 600, silicon: 200, magnesium: 50 },
    baseTimeSec: 2700,
    category: 'production',
    maxLevel: MAX_BUILDING_LEVEL,
    recipes: ['water_from_ice', 'ice_from_water', 'liquid_nitrogen_from_nitrogen_ice'],
  },
  spaceport: {
    deps: [{ typeId: 'command_center', level: 4 }],
    baseCost: { iron: 500, carbon: 500 },
    baseTimeSec: 1200,
    category: 'ships',
    maxLevel: MAX_BUILDING_LEVEL,
  },
  shipyard: {
    deps: [{ typeId: 'spaceport', level: 1 }],
    baseCost: { iron: 800, silicon: 400 },
    baseTimeSec: 1800,
    category: 'ships',
    maxLevel: MAX_BUILDING_LEVEL,
  },
  military_shipyard: {
    deps: [{ typeId: 'shipyard', level: 2 }],
    baseCost: { steel: 600, military_alloy: 200, military_composite: 100, electronics: 150 },
    baseTimeSec: 3600,
    category: 'ships',
    maxLevel: MAX_BUILDING_LEVEL,
    maxPerPlanet: 1 as const,
  },
  lab: {
    deps: [{ typeId: 'command_center', level: 3 }],
    baseCost: { iron: 300, silicon: 600 },
    baseTimeSec: 1800,
    category: 'progress',
    maxLevel: MAX_BUILDING_LEVEL,
    /** Mirrors seeded `building_types.max_global`. */
    maxGlobal: 1 as const,
  },
  solar_plant: {
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { silicon: 150, iron: 50 },
    baseTimeSec: 600,
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    output: { energy: 50 },
  },
  wind_turbine: {
    deps: [{ typeId: 'command_center', level: 1 }],
    baseCost: { iron: 140, aluminum: 60, silicon: 60 },
    baseTimeSec: 720,
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    output: { energy: 75 },
  },
  fuel_generator: {
    deps: [{ typeId: 'command_center', level: 2 }],
    baseCost: { iron: 220, silicon: 120, steel: 80 },
    baseTimeSec: 900,
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    recipes: ['energy_from_fuel', 'energy_from_oil', 'energy_from_methane'],
  },
  atomic_reactor: {
    deps: [
      { typeId: 'command_center', level: 5 },
      { typeId: 'battery', level: 2 },
    ],
    baseCost: { steel: 1400, electronics: 900, lead: 240, silicon_carbide: 180 },
    baseTimeSec: 5400,
    category: 'energy',
    maxLevel: MAX_BUILDING_LEVEL,
    maxPerPlanet: 1 as const,
    recipes: ['energy_from_uranium_cell', 'energy_from_tritium_cell'],
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
    buildCost: { iron: 500, silicon: 300, carbon: 200, methane: 100 },
    buildTimeSec: 1200,
    requiredBuildings: [{ typeId: 'shipyard', level: 2 }],
    requiredResearch: [{ branch: 'logistics', level: 1 }],
  },
  colonizer: {
    buildCost: { steel: 2500, silicon: 800, biomass: 400 },
    buildTimeSec: 14400,
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
    requiredResearch: [{ branch: 'engineering', level: 2 }],
  },
  recon_probe: {
    buildCost: { silicon: 40, fuel: 20, electronics: 10 },
    buildTimeSec: 300,
    requiredBuildings: [{ typeId: 'shipyard', level: 1 }],
    requiredResearch: [{ branch: 'sensors', level: 1 }],
  },
  light_fighter: {
    buildCost: { iron: 200, silicon: 150, fuel: 30 },
    buildTimeSec: 1200,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 1 }],
    requiredResearch: [{ branch: 'weapons', level: 1 }],
  },
  light_bomber: {
    buildCost: { steel: 600, military_alloy: 100, electronics: 150, fuel: 80 },
    buildTimeSec: 3600,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 2 }],
    requiredResearch: [{ branch: 'weapons', level: 2 }],
  },
  light_laser: {
    buildCost: { steel: 400, silicon: 200, liquid_nitrogen: 50, electronics: 120 },
    buildTimeSec: 2700,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 2 }],
    requiredResearch: [{ branch: 'weapons', level: 2 }],
  },
  small_shield_ship: {
    buildCost: { steel: 700, electronics: 180, military_composite: 80, liquid_nitrogen: 60, fuel: 80 },
    buildTimeSec: 4200,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 2 }],
    requiredResearch: [{ branch: 'energy', level: 2 }],
    shields: { capacity: 700, radius: 1.5, rechargeRate: 18, delayAfterDamageSec: 10, downtimeSec: 20 },
  },
  medium_fighter: {
    buildCost: { steel: 900, military_alloy: 220, military_composite: 80, electronics: 180, titanium: 80, fuel: 120 },
    buildTimeSec: 5400,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 3 }],
    requiredResearch: [{ branch: 'weapons', level: 3 }],
  },
  medium_bomber: {
    buildCost: { steel: 1600, military_alloy: 350, military_composite: 180, electronics: 260, titanium: 160, sulfur: 120, fuel: 220 },
    buildTimeSec: 9000,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 3 }],
    requiredResearch: [{ branch: 'weapons', level: 3 }],
  },
  medium_laser: {
    buildCost: { steel: 1100, silicon_carbide: 80, liquid_nitrogen: 130, electronics: 320, cobalt: 90, jump_fuel: 2 },
    buildTimeSec: 7200,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 3 }],
    requiredResearch: [{ branch: 'weapons', level: 3 }],
  },
  medium_shield_ship: {
    buildCost: { steel: 1900, military_alloy: 320, military_composite: 260, electronics: 420, silicon_carbide: 100, cobalt: 120, jump_fuel: 3 },
    buildTimeSec: 9600,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 4 }],
    requiredResearch: [{ branch: 'energy', level: 3 }],
    shields: { capacity: 1800, radius: 3.5, rechargeRate: 35, delayAfterDamageSec: 15, downtimeSec: 30 },
  },
  rocket_carrier: {
    buildCost: { steel: 2500, military_composite: 500, electronics: 650, cobalt: 200, sulfur: 260, jump_fuel: 10 },
    buildTimeSec: 14400,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 4 }],
    requiredResearch: [{ branch: 'weapons', level: 4 }],
    missilePayload: { alphaDamage: 1500, reloadSec: 30, validTargetClasses: ['military_medium', 'military_heavy'] },
  },
  heavy_fighter: {
    buildCost: { steel: 2800, military_alloy: 650, military_composite: 320, electronics: 520, titanium: 420, cobalt: 160, jump_fuel: 5 },
    buildTimeSec: 14400,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 5 }],
    requiredResearch: [{ branch: 'weapons', level: 4 }],
  },
  heavy_bomber: {
    buildCost: { steel: 4200, military_alloy: 900, military_composite: 520, electronics: 700, titanium: 520, iridium: 40, jump_fuel: 8 },
    buildTimeSec: 21600,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 5 }],
    requiredResearch: [{ branch: 'weapons', level: 4 }],
  },
  heavy_laser: {
    buildCost: { steel: 3600, silicon_carbide: 260, liquid_nitrogen: 320, electronics: 900, cobalt: 240, iridium: 30, jump_fuel: 6 },
    buildTimeSec: 18000,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 5 }],
    requiredResearch: [{ branch: 'weapons', level: 4 }],
  },
  large_shield_ship: {
    buildCost: { steel: 4800, military_alloy: 900, military_composite: 700, electronics: 1000, silicon_carbide: 260, iridium: 80, antimatter: 6, jump_fuel: 12 },
    buildTimeSec: 24000,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 6 }],
    requiredResearch: [{ branch: 'energy', level: 4 }],
    shields: { capacity: 4200, radius: 6, rechargeRate: 70, delayAfterDamageSec: 20, downtimeSec: 45 },
  },
  heavy_rocket_carrier: {
    buildCost: { steel: 5200, military_composite: 900, electronics: 1200, cobalt: 420, iridium: 80, antimatter: 8, jump_fuel: 18 },
    buildTimeSec: 28800,
    requiredBuildings: [{ typeId: 'military_shipyard', level: 6 }],
    requiredResearch: [{ branch: 'weapons', level: 5 }],
    missilePayload: { alphaDamage: 3300, reloadSec: 36, validTargetClasses: ['military_medium', 'military_heavy'] },
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
  energy: {
    1: { cost: { iron: 260, silicon: 130 }, timeSec: 180, effects: [{ target: 'energyGeneration', multiplier: 1.08 }] },
    2: {
      cost: { iron: 520, silicon: 260 },
      timeSec: 390,
      effects: [
        { target: 'energyGeneration', multiplier: 1.12 },
        { target: 'energyStorage', multiplier: 1.15 },
      ],
    },
    3: {
      cost: { iron: 1300, silicon: 650 },
      timeSec: 975,
      effects: [
        { target: 'energyGeneration', multiplier: 1.18 },
        { target: 'energyStorage', multiplier: 1.25 },
        { target: 'energyEfficiency', multiplier: 0.92 },
      ],
    },
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
  oxygen: 1,
  hydrogen: 1,
  fuel: 1,
  copper: 2,
  aluminum: 2,
  silver: 2,
  titanium: 2,
  ice: 2,
  oil: 2,
  sulfur: 2,
  steel: 2,
  electronics: 2,
  mercury: 3,
  magnesium: 3,
  lead: 3,
  nitrogen: 3,
  liquid_nitrogen: 3,
  military_alloy: 3,
  military_composite: 3,
  uranium: 3,
  cobalt: 3,
  silicon_carbide: 3,
  tritium: 3,
  gold: 3,
  jump_fuel: 3,
  antimatter: 4,
  iridium: 4,
  biomass: 4,
};
