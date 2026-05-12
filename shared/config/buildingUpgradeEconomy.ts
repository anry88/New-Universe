export const MAX_BUILDING_LEVEL = 10;
export const COMMAND_CENTER_TYPE_ID = 'command_center';
export const BUILDING_UPGRADE_COST_MULTIPLIER = 1.6;
export const BUILDING_UPGRADE_TIME_MULTIPLIER = 1.8;
export const HIGH_TIER_UPGRADE_START_LEVEL = 6;

/**
 * Extra material kits added when an upgrade targets level 6 or higher.
 * Resources are constrained to starter-home deposits or products crafted from them.
 */
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
} as const satisfies Record<string, Record<string, number>>;

export function scaleResourceCostMap(
  costs: Record<string, number>,
  multiplier: number,
): Record<string, number> {
  const scaled: Record<string, number> = {};
  for (const [resourceId, amount] of Object.entries(costs)) {
    const nextAmount = Math.floor(amount * multiplier);
    if (nextAmount > 0) {
      scaled[resourceId] = nextAmount;
    }
  }
  return scaled;
}

export function mergeResourceCostMaps(...maps: Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [resourceId, amount] of Object.entries(map)) {
      merged[resourceId] = (merged[resourceId] ?? 0) + amount;
    }
  }
  return merged;
}

export function baseUpgradeResourceCosts(
  baseCost: Record<string, number>,
  currentLevel: number,
): Record<string, number> {
  return scaleResourceCostMap(
    baseCost,
    Math.pow(BUILDING_UPGRADE_COST_MULTIPLIER, currentLevel),
  );
}

export function highTierUpgradeResourceCosts(
  typeId: string,
  targetLevel: number,
): Record<string, number> {
  if (targetLevel < HIGH_TIER_UPGRADE_START_LEVEL) return {};

  const highTierCosts = HIGH_TIER_UPGRADE_COSTS_BY_BUILDING as Record<string, Record<string, number>>;
  const baseExtra = highTierCosts[typeId];
  if (!baseExtra) return {};

  const multiplier = Math.pow(
    BUILDING_UPGRADE_COST_MULTIPLIER,
    targetLevel - HIGH_TIER_UPGRADE_START_LEVEL,
  );
  return scaleResourceCostMap(baseExtra, multiplier);
}

export function buildingUpgradeResourceCosts(input: {
  typeId: string;
  baseCost: Record<string, number>;
  currentLevel: number;
}): Record<string, number> {
  const targetLevel = input.currentLevel + 1;
  return mergeResourceCostMaps(
    baseUpgradeResourceCosts(input.baseCost, input.currentLevel),
    highTierUpgradeResourceCosts(input.typeId, targetLevel),
  );
}

export function buildingUpgradeTimeSeconds(baseTimeSec: number, currentLevel: number): number {
  return Math.floor(baseTimeSec * Math.pow(BUILDING_UPGRADE_TIME_MULTIPLIER, currentLevel));
}
