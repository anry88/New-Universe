import type { BuildBlockedReason } from './buildings.js';
import type { ResearchUnlockRequirement } from '../config/buildingResearchGates.js';

function researchLevel(levels: Map<string, number> | Record<string, number>, branch: string): number {
  if (levels instanceof Map) {
    return levels.get(branch) ?? 0;
  }
  return levels[branch] ?? 0;
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
    default:
      return lang === 'en' ? 'Cannot build.' : 'Строительство недоступно.';
  }
}
