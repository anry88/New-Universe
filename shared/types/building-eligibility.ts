import type { BuildBlockedReason, BuildingOutput } from './buildings.js';
import type { ResearchUnlockRequirement } from '../config/buildingResearchGates.js';

export const METAL_DEPOSIT_RESOURCE_IDS = [
  'iron',
  'copper',
  'aluminum',
  'carbon',
  'silicon',
  'titanium',
  'mercury',
  'magnesium',
  'lead',
  'uranium',
  'cobalt',
  'silicon_carbide',
  'iridium',
] as const;

export const FLUID_DEPOSIT_RESOURCE_IDS = [
  'water',
  'methane',
  'ice',
  'oil',
  'tritium',
] as const;

const METAL_DEPOSIT_SET = new Set<string>(METAL_DEPOSIT_RESOURCE_IDS);
const FLUID_DEPOSIT_SET = new Set<string>(FLUID_DEPOSIT_RESOURCE_IDS);

function researchLevel(levels: Map<string, number> | Record<string, number>, branch: string): number {
  if (levels instanceof Map) {
    return levels.get(branch) ?? 0;
  }
  return levels[branch] ?? 0;
}

function uniqueKnownResourceIds(resourceIds: Iterable<string>): string[] {
  return [...new Set([...resourceIds].filter(Boolean))];
}

function resourceLabel(resourceId: string, lang: 'en' | 'ru'): string {
  switch (resourceId) {
    case 'metal':
      return lang === 'ru' ? 'металлов' : 'metal';
    case 'fluid_or_gas':
      return lang === 'ru' ? 'воды, метана, льда или нефти' : 'water, methane, ice or oil';
    default:
      return resourceId;
  }
}

/**
 * First blocking rule for starting construction (research → deps → per-planet → global).
 * Uses building-type rows from API/DB plus live building snapshots.
 */
export function resolveBuildBlockedReason(input: {
  typeId: string;
  deps: { typeId: string; level: number }[];
  maxPerPlanet: number | null | undefined;
  maxGlobal: number | null | undefined;
  planetBuildings: { typeId: string; level: number }[];
  /**
   * Buildings that count toward dependency checks (operational or upgrading).
   * Omit or leave unset to use `planetBuildings`. Use a narrower list to ignore rows that are
   * still in the initial construction queue (`queueAction === 'build'`).
   */
  dependencyBuildings?: { typeId: string; level: number }[];
  globalCountForType: number;
  researchLevels: Map<string, number> | Record<string, number>;
  researchGate: ResearchUnlockRequirement | undefined;
}): BuildBlockedReason | null {
  const gate = input.researchGate;
  if (gate) {
    const have = researchLevel(input.researchLevels, gate.branch);
    if (have < gate.level) {
      return {
        code: 'building_blocked_research',
        details: { branch: gate.branch, level: gate.level },
      };
    }
  }

  const buildingsForDeps = input.dependencyBuildings ?? input.planetBuildings;

  for (const dep of input.deps ?? []) {
    const found = buildingsForDeps.find((b) => b.typeId === dep.typeId);
    if (!found || found.level < dep.level) {
      return {
        code: 'building_blocked_dependency',
        details: { requiredTypeId: dep.typeId, requiredLevel: dep.level },
      };
    }
  }

  const limitPlanet = input.maxPerPlanet;
  if (limitPlanet != null && limitPlanet > 0) {
    const onPlanet = input.planetBuildings.filter((b) => b.typeId === input.typeId).length;
    if (onPlanet >= limitPlanet) {
      return {
        code: 'building_blocked_per_planet',
        details: { typeId: input.typeId, limit: limitPlanet, current: onPlanet },
      };
    }
  }

  const limitGlobal = input.maxGlobal;
  if (limitGlobal != null && limitGlobal > 0) {
    const total = input.globalCountForType;
    if (total >= limitGlobal) {
      return {
        code: 'building_blocked_global',
        details: { typeId: input.typeId, limit: limitGlobal, current: total },
      };
    }
  }

  return null;
}

/**
 * Planet-surface suitability gates for extractor/feedstock buildings.
 * `planetResourceIds` should represent discovered deposits, not just cargo stock.
 */
export function resolvePlanetResourceBlockedReason(input: {
  typeId: string;
  planetResourceIds: Iterable<string>;
}): BuildBlockedReason | null {
  const resourceIds = new Set(uniqueKnownResourceIds(input.planetResourceIds));

  if (input.typeId === 'mine') {
    const hasMetalDeposit = [...resourceIds].some((resourceId) => METAL_DEPOSIT_SET.has(resourceId));
    if (!hasMetalDeposit) {
      return {
        code: 'building_blocked_planet_resource',
        details: {
          resourceId: 'metal',
          acceptedResourceIds: [...METAL_DEPOSIT_RESOURCE_IDS],
        },
      };
    }
  }

  if (input.typeId === 'drill') {
    const hasFluidDeposit = [...resourceIds].some((resourceId) => FLUID_DEPOSIT_SET.has(resourceId));
    if (!hasFluidDeposit) {
      return {
        code: 'building_blocked_planet_resource',
        details: {
          resourceId: 'fluid_or_gas',
          acceptedResourceIds: [...FLUID_DEPOSIT_RESOURCE_IDS],
        },
      };
    }
  }

  if (input.typeId === 'oil_pump') {
    if (!resourceIds.has('oil')) {
      return {
        code: 'building_blocked_planet_resource',
        details: { resourceId: 'oil', acceptedResourceIds: ['oil'] },
      };
    }
  }

  if (input.typeId === 'biomass_harvester') {
    if (!resourceIds.has('biomass')) {
      return {
        code: 'building_blocked_planet_resource',
        details: { resourceId: 'biomass', acceptedResourceIds: ['biomass'] },
      };
    }
  }

  return null;
}

/**
 * Resolves the concrete resource ids a building can produce on a specific planet.
 * Extractors use local deposits; processors keep their fixed catalog output.
 */
export function resolveBuildingProducedResourceIds(input: {
  typeId: string;
  baseOutput?: BuildingOutput | null;
  planetResourceIds: Iterable<string>;
}): string[] {
  const resourceIds = uniqueKnownResourceIds(input.planetResourceIds);
  const resourceSet = new Set(resourceIds);

  if (input.typeId === 'mine') {
    return resourceIds.filter((resourceId) => METAL_DEPOSIT_SET.has(resourceId));
  }

  if (input.typeId === 'drill') {
    return resourceIds.filter((resourceId) => FLUID_DEPOSIT_SET.has(resourceId));
  }

  if (input.typeId === 'oil_pump') {
    return resourceSet.has('oil') ? ['oil'] : [];
  }

  if (input.typeId === 'refinery') {
    return [];
  }

  if (input.typeId === 'smelter' || input.typeId === 'fabrication_bay' || input.typeId === 'cryo_factory') {
    return [];
  }

  if (input.typeId === 'biomass_harvester') {
    return resourceSet.has('biomass') ? ['biomass'] : [];
  }

  const resourceId = input.baseOutput?.resourceId;
  return resourceId && typeof input.baseOutput?.baseRate === 'number' ? [resourceId] : [];
}

export function resolveBuildingProductionRateForResource(input: {
  typeId: string;
  baseOutput?: BuildingOutput | null;
  planetResourceIds: Iterable<string>;
  resourceId: string;
}): number {
  const baseRate = input.baseOutput?.baseRate;
  if (typeof baseRate !== 'number' || baseRate <= 0) return 0;

  const producedResourceIds = resolveBuildingProducedResourceIds(input);
  if (!producedResourceIds.includes(input.resourceId)) return 0;

  if (input.typeId === 'mine' || input.typeId === 'drill') {
    return baseRate / Math.max(1, producedResourceIds.length);
  }

  return baseRate;
}

export function formatBuildBlockedMessage(reason: BuildBlockedReason, lang: 'en' | 'ru'): string {
  switch (reason.code) {
    case 'building_blocked_per_planet':
      return lang === 'ru'
        ? `На этой планете уже есть максимум этого здания (${reason.details.current}/${reason.details.limit}).`
        : `This planet already has the maximum of this building (${reason.details.current}/${reason.details.limit}).`;
    case 'building_blocked_global':
      return lang === 'ru'
        ? `Достигнут аккаунтный лимит этого здания (${reason.details.current}/${reason.details.limit}).`
        : `Account-wide limit reached for this building (${reason.details.current}/${reason.details.limit}).`;
    case 'building_blocked_dependency':
      return lang === 'ru'
        ? `Требуется здание ${reason.details.requiredTypeId} уровня ${reason.details.requiredLevel}.`
        : `Requires building ${reason.details.requiredTypeId} at level ${reason.details.requiredLevel}.`;
    case 'building_blocked_research':
      return lang === 'ru'
        ? `Требуется исследование ${reason.details.branch} уровня ${reason.details.level}.`
        : `Requires research ${reason.details.branch} level ${reason.details.level}.`;
    case 'building_blocked_planet_resource':
      return lang === 'ru'
        ? `На этой планете нет подходящего месторождения: ${resourceLabel(reason.details.resourceId, lang)}.`
        : `This planet has no ${resourceLabel(reason.details.resourceId, lang)} deposit.`;
    default:
      return lang === 'en' ? 'Cannot build.' : 'Строительство недоступно.';
  }
}
