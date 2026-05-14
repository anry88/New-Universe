import type { BuildBlockedReason, BuildingOutput } from './buildings.js';
import { buildingLabel, formatEntityList, resourceLabel } from './entity-labels.js';
import { researchBranchLabel } from './research.js';
import type { ResearchUnlockRequirement } from '../config/buildingResearchGates.js';
import { extractionRateForResource } from '../config/resourceExtractionRates.js';

export const METAL_DEPOSIT_RESOURCE_IDS = [
  'iron',
  'copper',
  'aluminum',
  'carbon',
  'silicon',
  'sulfur',
  'titanium',
  'silver',
  'mercury',
  'magnesium',
  'lead',
  'gold',
  'uranium',
  'cobalt',
  'silicon_carbide',
  'antimatter',
  'iridium',
] as const;

export const GAS_DEPOSIT_RESOURCE_IDS = [
  'methane',
  'oxygen',
  'hydrogen',
  'nitrogen',
  'tritium',
] as const;

const METAL_DEPOSIT_SET = new Set<string>(METAL_DEPOSIT_RESOURCE_IDS);
const GAS_DEPOSIT_SET = new Set<string>(GAS_DEPOSIT_RESOURCE_IDS);
const BIOREACTOR_DEPOSIT_RESOURCE_IDS = ['water', 'biomass'] as const;
const OIL_PUMP_DEPOSIT_RESOURCE_IDS = ['oil', 'methane'] as const;

const EXTRACTOR_RESOURCE_IDS_BY_TYPE = {
  mine: METAL_DEPOSIT_RESOURCE_IDS,
  drill: GAS_DEPOSIT_RESOURCE_IDS,
  oil_pump: OIL_PUMP_DEPOSIT_RESOURCE_IDS,
  biomass_harvester: BIOREACTOR_DEPOSIT_RESOURCE_IDS,
} as const;

type ExtractorTypeId = keyof typeof EXTRACTOR_RESOURCE_IDS_BY_TYPE;

function researchLevel(levels: Map<string, number> | Record<string, number>, branch: string): number {
  if (levels instanceof Map) {
    return levels.get(branch) ?? 0;
  }
  return levels[branch] ?? 0;
}

function uniqueKnownResourceIds(resourceIds: Iterable<string>): string[] {
  return [...new Set([...resourceIds].filter(Boolean))];
}

export function isSelectableExtractorType(typeId: string): typeId is ExtractorTypeId {
  return typeId in EXTRACTOR_RESOURCE_IDS_BY_TYPE;
}

export function acceptedResourceIdsForExtractor(typeId: string): string[] {
  if (!isSelectableExtractorType(typeId)) return [];
  return [...EXTRACTOR_RESOURCE_IDS_BY_TYPE[typeId]];
}

export function selectableResourceIdsForExtractor(input: {
  typeId: string;
  planetResourceIds: Iterable<string>;
}): string[] {
  const acceptedResourceIds = new Set(acceptedResourceIdsForExtractor(input.typeId));
  if (acceptedResourceIds.size === 0) return [];

  const resourceIds = uniqueKnownResourceIds(input.planetResourceIds);
  return resourceIds.filter((resourceId) => acceptedResourceIds.has(resourceId));
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
    const hasGasDeposit = [...resourceIds].some((resourceId) => GAS_DEPOSIT_SET.has(resourceId));
    if (!hasGasDeposit) {
      return {
        code: 'building_blocked_planet_resource',
        details: {
          resourceId: 'gas',
          acceptedResourceIds: [...GAS_DEPOSIT_RESOURCE_IDS],
        },
      };
    }
  }

  if (input.typeId === 'oil_pump') {
    if (![...OIL_PUMP_DEPOSIT_RESOURCE_IDS].some((resourceId) => resourceIds.has(resourceId))) {
      return {
        code: 'building_blocked_planet_resource',
        details: { resourceId: 'oil_or_methane', acceptedResourceIds: [...OIL_PUMP_DEPOSIT_RESOURCE_IDS] },
      };
    }
  }

  if (input.typeId === 'biomass_harvester') {
    if (![...BIOREACTOR_DEPOSIT_RESOURCE_IDS].some((resourceId) => resourceIds.has(resourceId))) {
      return {
        code: 'building_blocked_planet_resource',
        details: { resourceId: 'water_or_biomass', acceptedResourceIds: [...BIOREACTOR_DEPOSIT_RESOURCE_IDS] },
      };
    }
  }

  return null;
}

export function resolveExtractorSelectionBlockedReason(input: {
  typeId: string;
  selectedResourceId?: string | null;
  planetResourceIds: Iterable<string>;
  depositLimitsByResourceId?: Record<string, number>;
  usedExtractorCountsByResourceId?: Record<string, number>;
}): BuildBlockedReason | null {
  const acceptedResourceIds = acceptedResourceIdsForExtractor(input.typeId);
  if (acceptedResourceIds.length === 0) return null;

  const selectableResourceIds = selectableResourceIdsForExtractor({
    typeId: input.typeId,
    planetResourceIds: input.planetResourceIds,
  });

  if (selectableResourceIds.length === 0) {
    return resolvePlanetResourceBlockedReason({
      typeId: input.typeId,
      planetResourceIds: input.planetResourceIds,
    });
  }

  if (!input.selectedResourceId) {
    return {
      code: 'building_blocked_resource_selection_required',
      details: {
        typeId: input.typeId,
        acceptedResourceIds: selectableResourceIds.length > 0 ? selectableResourceIds : acceptedResourceIds,
      },
    };
  }

  if (!acceptedResourceIds.includes(input.selectedResourceId) || !selectableResourceIds.includes(input.selectedResourceId)) {
    return {
      code: 'building_blocked_invalid_resource_selection',
      details: {
        typeId: input.typeId,
        resourceId: input.selectedResourceId,
        acceptedResourceIds: selectableResourceIds.length > 0 ? selectableResourceIds : acceptedResourceIds,
      },
    };
  }

  const limit = input.depositLimitsByResourceId?.[input.selectedResourceId];
  if (limit != null && limit > 0) {
    const current = input.usedExtractorCountsByResourceId?.[input.selectedResourceId] ?? 0;
    if (current >= limit) {
      return {
        code: 'building_blocked_deposit_limit',
        details: { resourceId: input.selectedResourceId, limit, current },
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
  selectedResourceId?: string | null;
}): string[] {
  const resourceIds = uniqueKnownResourceIds(input.planetResourceIds);
  const resourceSet = new Set(resourceIds);
  const selectedResourceId = input.selectedResourceId ?? null;

  if (isSelectableExtractorType(input.typeId) && selectedResourceId) {
    const acceptedResourceIds = acceptedResourceIdsForExtractor(input.typeId);
    return acceptedResourceIds.includes(selectedResourceId) && resourceSet.has(selectedResourceId)
      ? [selectedResourceId]
      : [];
  }

  if (input.typeId === 'mine') {
    return resourceIds.filter((resourceId) => METAL_DEPOSIT_SET.has(resourceId));
  }

  if (input.typeId === 'drill') {
    return resourceIds.filter((resourceId) => GAS_DEPOSIT_SET.has(resourceId));
  }

  if (input.typeId === 'oil_pump') {
    return resourceIds.filter((resourceId) =>
      (OIL_PUMP_DEPOSIT_RESOURCE_IDS as readonly string[]).includes(resourceId),
    );
  }

  if (input.typeId === 'refinery') {
    return [];
  }

  if (input.typeId === 'smelter' || input.typeId === 'fabrication_bay' || input.typeId === 'cryo_factory') {
    return [];
  }

  if (input.typeId === 'biomass_harvester') {
    return resourceIds.filter((resourceId) =>
      (BIOREACTOR_DEPOSIT_RESOURCE_IDS as readonly string[]).includes(resourceId),
    );
  }

  const resourceId = input.baseOutput?.resourceId;
  return resourceId && typeof input.baseOutput?.baseRate === 'number' ? [resourceId] : [];
}

export function resolveBuildingProductionRateForResource(input: {
  typeId: string;
  baseOutput?: BuildingOutput | null;
  planetResourceIds: Iterable<string>;
  resourceId: string;
  selectedResourceId?: string | null;
}): number {
  const baseRate = input.baseOutput?.baseRate;
  if (typeof baseRate !== 'number' || baseRate <= 0) return 0;

  const producedResourceIds = resolveBuildingProducedResourceIds(input);
  if (!producedResourceIds.includes(input.resourceId)) return 0;

  if (isSelectableExtractorType(input.typeId)) {
    const resourceRate = extractionRateForResource(input.resourceId, baseRate);
    if (!input.selectedResourceId) {
      return resourceRate / Math.max(1, producedResourceIds.length);
    }
    return resourceRate;
  }

  return baseRate;
}

export function formatBuildBlockedMessage(reason: BuildBlockedReason, lang: 'en' | 'ru'): string {
  switch (reason.code) {
    case 'building_blocked_per_planet': {
      const label = buildingLabel(reason.details.typeId, lang);
      return lang === 'ru'
        ? `На этой планете уже достигнут лимит для здания «${label}» (${reason.details.current}/${reason.details.limit}).`
        : `This planet already has the maximum number of ${label} buildings (${reason.details.current}/${reason.details.limit}).`;
    }
    case 'building_blocked_global': {
      const label = buildingLabel(reason.details.typeId, lang);
      return lang === 'ru'
        ? `Достигнут общий лимит для здания «${label}» (${reason.details.current}/${reason.details.limit}).`
        : `Account-wide limit reached for ${label} (${reason.details.current}/${reason.details.limit}).`;
    }
    case 'building_blocked_dependency': {
      const label = buildingLabel(reason.details.requiredTypeId, lang);
      return lang === 'ru'
        ? `Требуется здание «${label}» уровня ${reason.details.requiredLevel}.`
        : `Requires ${label} level ${reason.details.requiredLevel}.`;
    }
    case 'building_blocked_research': {
      const branchLabel = researchBranchLabel(reason.details.branch, lang);
      return lang === 'ru'
        ? `Требуется исследование «${branchLabel}» уровня ${reason.details.level}.`
        : `Requires ${branchLabel} research level ${reason.details.level}.`;
    }
    case 'building_blocked_planet_resource': {
      const label = resourceLabel(reason.details.resourceId, lang);
      return lang === 'ru'
        ? `На этой планете нет подходящего месторождения: ${label}.`
        : `This planet has no suitable ${label} deposit.`;
    }
    case 'building_blocked_resource_selection_required': {
      const accepted = formatEntityList(reason.details.acceptedResourceIds, resourceLabel, lang);
      return lang === 'ru'
        ? `Выберите месторождение для этой добывающей постройки${accepted ? `: ${accepted}.` : '.'}`
        : `Select a deposit for this extraction building${accepted ? `: ${accepted}.` : '.'}`;
    }
    case 'building_blocked_invalid_resource_selection': {
      const resource = resourceLabel(reason.details.resourceId, lang);
      const accepted = formatEntityList(reason.details.acceptedResourceIds, resourceLabel, lang);
      return lang === 'ru'
        ? `Эта постройка не может добывать ${resource} на выбранной планете${accepted ? `. Доступно: ${accepted}.` : '.'}`
        : `This building cannot extract ${resource} on the selected planet${accepted ? `. Available deposits: ${accepted}.` : '.'}`;
    }
    case 'building_blocked_deposit_limit': {
      const label = resourceLabel(reason.details.resourceId, lang);
      return lang === 'ru'
        ? `Месторождения «${label}» уже заняты (${reason.details.current}/${reason.details.limit}).`
        : `${label} deposits are already assigned (${reason.details.current}/${reason.details.limit}).`;
    }
    case 'building_blocked_max_level':
      return lang === 'ru'
        ? `Достигнут максимальный уровень здания (${reason.details.maxLevel}).`
        : `Building is already at max level (${reason.details.maxLevel}).`;
    case 'building_blocked_command_center_level':
      return lang === 'ru'
        ? `Для апгрейда до уровня ${reason.details.requiredLevel} нужен командный центр уровня ${reason.details.requiredLevel} на этой планете. Сейчас: ${reason.details.commandCenterLevel}.`
        : `Command Center level ${reason.details.requiredLevel} is required on this planet before upgrading to level ${reason.details.requiredLevel}. Current: ${reason.details.commandCenterLevel}.`;
    default:
      return lang === 'en' ? 'Cannot build.' : 'Строительство недоступно.';
  }
}
