import {
  BUILDINGS,
  COLONIZATION,
  RESEARCH_TIERS,
  SHIPS,
  buildingUpgradeResourceCosts,
  buildingUpgradeTimeSeconds,
  type BuildingId,
  MAX_BUILDING_LEVEL,
} from './catalog.js';
import {
  applyBuildTimeSeconds,
  applyProductionRate,
  applyStorageCap,
  composeEffects,
  type ResearchEffects,
} from './effects.js';
import type {
  MilestoneRecord,
  ScenarioDefinition,
  ScenarioSummary,
  StructureStep,
} from './types.js';

const COMMAND_CENTER_TYPE_ID = 'command_center';

const DT = 60;
const CATALOG_NOTE =
  'Mirrors backend seeds/config listed in tools/balance-sim/README.md, including stored Jump Fuel recipe/cost constants; update catalog.ts when seeds change.';

function depsSatisfied(typeId: BuildingId, levels: Record<string, number>): boolean {
  const meta = BUILDINGS[typeId];
  if (!meta || typeId === 'command_center') return true;
  const deps = 'deps' in meta ? meta.deps : [];
  return deps.every((d) => (levels[d.typeId] ?? 0) >= d.level);
}

function upgradeCostAndTime(
  typeId: BuildingId,
  currentLevel: number,
  fx: ResearchEffects,
): { cost: Record<string, number>; timeSec: number } {
  const meta = BUILDINGS[typeId];
  const baseCost = ('baseCost' in meta ? meta.baseCost : {}) as Record<string, number>;
  const baseTimeSec = 'baseTimeSec' in meta ? meta.baseTimeSec : 0;
  const cost = buildingUpgradeResourceCosts({ typeId, baseCost, currentLevel });
  const timeSec = applyBuildTimeSeconds(buildingUpgradeTimeSeconds(baseTimeSec, currentLevel), fx);
  return { cost, timeSec };
}

function buildCostAndTime(typeId: BuildingId, fx: ResearchEffects): { cost: Record<string, number>; timeSec: number } {
  const meta = BUILDINGS[typeId];
  const baseCost = ('baseCost' in meta ? meta.baseCost : {}) as Record<string, number>;
  const baseTimeSec = 'baseTimeSec' in meta ? meta.baseTimeSec : 0;
  const timeSec = applyBuildTimeSeconds(baseTimeSec, fx);
  return { cost: { ...baseCost }, timeSec };
}

function storageCap(levels: Record<string, number>, fx: ResearchEffects, baseCap: number): number {
  let cap = applyStorageCap(baseCap, fx);
  const storageLevels = levels.storage ?? 0;
  const bonus = BUILDINGS.storage.storageBonusPerLevel ?? 5000;
  cap += bonus * storageLevels;
  return cap;
}

function productionRates(levels: Record<string, number>, passive: Record<string, number>, fx: ResearchEffects): Record<string, number> {
  const rates: Record<string, number> = { ...passive };
  const mineL = levels.mine ?? 0;
  const drillL = levels.drill ?? 0;
  if (mineL > 0 && BUILDINGS.mine.output) {
    const base = BUILDINGS.mine.output.baseRate * mineL;
    rates.iron = (rates.iron ?? 0) + applyProductionRate(base, fx);
  }
  if (drillL > 0 && BUILDINGS.drill.output) {
    const base = BUILDINGS.drill.output.baseRate * drillL;
    rates.water = (rates.water ?? 0) + applyProductionRate(base, fx);
  }
  const biomassL = levels.biomass_harvester ?? 0;
  if (biomassL > 0 && BUILDINGS.biomass_harvester.output) {
    const base = BUILDINGS.biomass_harvester.output.baseRate * biomassL;
    rates.biomass = (rates.biomass ?? 0) + applyProductionRate(base, fx);
  }
  return rates;
}

function canSpend(resources: Record<string, number>, cost: Record<string, number>): boolean {
  for (const [k, need] of Object.entries(cost)) {
    if ((resources[k] ?? 0) + 1e-9 < need) return false;
  }
  return true;
}

function spend(resources: Record<string, number>, cost: Record<string, number>): void {
  for (const [k, need] of Object.entries(cost)) {
    resources[k] = (resources[k] ?? 0) - need;
  }
}

function dominantDeficit(resources: Record<string, number>, cost: Record<string, number>): string | null {
  let worst: { id: string; gap: number } | null = null;
  for (const [k, need] of Object.entries(cost)) {
    const have = resources[k] ?? 0;
    const gap = need - have;
    if (gap > 0 && (!worst || gap > worst.gap)) worst = { id: k, gap };
  }
  return worst?.id ?? null;
}

function canStartResearch(
  step: { branch: string; tier: number },
  levels: Record<string, number>,
  completed: Record<string, number>,
): boolean {
  const lab = levels.lab ?? 0;
  if (lab < step.tier) return false;
  const prev = step.tier - 1;
  if (prev >= 1 && (completed[step.branch] ?? 0) < prev) return false;
  return true;
}

interface ActiveStructure {
  completesAt: number;
  step: StructureStep;
}

interface ActiveResearch {
  completesAt: number;
  branch: string;
  tier: number;
}

interface ActiveShip {
  completesAt: number;
  shipId: keyof typeof SHIPS;
}

export function simulateScenario(
  scenario: ScenarioDefinition,
  horizonSec: number,
): ScenarioSummary {
  let resources: Record<string, number> = { ...scenario.initialResources };
  const passive = scenario.passiveRegenPerHour;
  const baseCap = scenario.baseStorageCap;

  const levels: Record<string, number> = { command_center: 1 };
  let completedResearch: Record<string, number> = {};

  let structure: ActiveStructure | null = null;
  let research: ActiveResearch | null = null;
  let ship: ActiveShip | null = null;

  let si = 0;
  let ri = 0;
  let yi = 0;

  const milestones: MilestoneRecord = {
    firstStructureCompleteSec: null,
    firstResearchCompleteSec: null,
    engineering2CompleteSec: null,
    shipyardReadySec: null,
    colonizerOrderedSec: null,
    colonizerCompleteSec: null,
    foundingPayloadAffordableSec: null,
  };

  const stallByResource: Record<string, number> = {};

  for (let t = 0; t < horizonSec; t += DT) {
    const fx = composeEffects(completedResearch);
    const cap = storageCap(levels, fx, baseCap);
    const rates = productionRates(levels, passive, fx);
    const hours = DT / 3600;
    for (const [rid, perHour] of Object.entries(rates)) {
      resources[rid] = (resources[rid] ?? 0) + perHour * hours;
    }
    for (const k of Object.keys(resources)) {
      resources[k] = Math.min(resources[k]!, cap);
    }

    // Complete queues
    if (structure && t >= structure.completesAt) {
      const step = structure.step;
      if (step.kind === 'build') {
        levels[step.buildingId] = (levels[step.buildingId] ?? 0) + 1;
      } else {
        levels[step.buildingId] = (levels[step.buildingId] ?? 0) + 1;
      }
      structure = null;
      if (milestones.firstStructureCompleteSec === null) milestones.firstStructureCompleteSec = t;
      if ((levels.shipyard ?? 0) >= 1 && milestones.shipyardReadySec === null) {
        milestones.shipyardReadySec = t;
      }
    }
    if (research && t >= research.completesAt) {
      completedResearch[research.branch] = research.tier;
      if (research.branch === 'engineering' && research.tier === 2) {
        milestones.engineering2CompleteSec = t;
      }
      if (milestones.firstResearchCompleteSec === null) milestones.firstResearchCompleteSec = t;
      research = null;
    }
    if (ship && t >= ship.completesAt) {
      if (ship.shipId === 'colonizer') milestones.colonizerCompleteSec = t;
      ship = null;
    }

    const foundingOk =
      (completedResearch.engineering ?? 0) >= COLONIZATION.researchRequirement.level &&
      canSpend(resources, COLONIZATION.foundingCost);
    if (foundingOk && milestones.foundingPayloadAffordableSec === null) {
      milestones.foundingPayloadAffordableSec = t;
    }

    // Start new work (single queue each, matching server caps)
    const fx2 = composeEffects(completedResearch);

    if (!structure && si < scenario.structurePlan.length) {
      const step = scenario.structurePlan[si]!;
      const id = step.buildingId;
      if (depsSatisfied(id, levels)) {
        const curLevel = levels[id] ?? 0;
        const commandCenterCapOk =
          step.kind === 'build' ||
          id === COMMAND_CENTER_TYPE_ID ||
          curLevel + 1 <= (levels.command_center ?? 0);
        const maxLevelOk = step.kind === 'build' || curLevel < MAX_BUILDING_LEVEL;
        if (!commandCenterCapOk || !maxLevelOk) {
          stallByResource.command_center = (stallByResource.command_center ?? 0) + DT;
          continue;
        }
        const costs =
          step.kind === 'build'
            ? buildCostAndTime(id, fx2)
            : upgradeCostAndTime(id, curLevel, fx2);
        if (canSpend(resources, costs.cost)) {
          spend(resources, costs.cost);
          structure = {
            completesAt: t + costs.timeSec,
            step,
          };
          si++;
        } else {
          const d = dominantDeficit(resources, costs.cost);
          if (d) stallByResource[d] = (stallByResource[d] ?? 0) + DT;
        }
      }
    }

    if (!research && ri < scenario.researchPlan.length) {
      const step = scenario.researchPlan[ri]!;
      const def = RESEARCH_TIERS[step.branch]?.[step.tier];
      if (def && canStartResearch(step, levels, completedResearch)) {
        if (canSpend(resources, def.cost)) {
          spend(resources, def.cost);
          research = {
            completesAt: t + def.timeSec,
            branch: step.branch,
            tier: step.tier,
          };
          ri++;
        } else {
          const d = dominantDeficit(resources, def.cost);
          if (d) stallByResource[d] = (stallByResource[d] ?? 0) + DT;
        }
      }
    }

    if (!ship && yi < scenario.shipPlan.length) {
      const step = scenario.shipPlan[yi]!;
      const spec = SHIPS[step.shipId];
      const reqOk = spec.requiredBuildings.every((r) => (levels[r.typeId as BuildingId] ?? 0) >= r.level);
      const researchOk = ('requiredResearch' in spec ? spec.requiredResearch : []).every(
        (r) => (completedResearch[r.branch] ?? 0) >= r.level,
      );
      if (reqOk && researchOk) {
        const timeSec = applyBuildTimeSeconds(spec.buildTimeSec, fx2);
        if (canSpend(resources, spec.buildCost)) {
          spend(resources, spec.buildCost);
          ship = { completesAt: t + timeSec, shipId: step.shipId };
          if (step.shipId === 'colonizer') milestones.colonizerOrderedSec = t;
          yi++;
        } else {
          const d = dominantDeficit(resources, spec.buildCost);
          if (d) stallByResource[d] = (stallByResource[d] ?? 0) + DT;
        }
      }
    }

    for (const k of Object.keys(resources)) {
      resources[k] = Math.min(resources[k]!, cap);
    }
  }

  const bottlenecks = Object.entries(stallByResource)
    .map(([resourceId, stallScore]) => ({ resourceId, stallScore }))
    .sort((a, b) => b.stallScore - a.stallScore);

  const stallLogTop = bottlenecks.slice(0, 8).map((b) => ({
    resourceId: b.resourceId,
    secondsStalled: b.stallScore,
  }));

  return {
    scenarioId: scenario.id,
    label: scenario.label,
    horizonSec,
    catalogNote: CATALOG_NOTE,
    milestones,
    endingResources: resources,
    endingBuildings: { ...levels },
    endingResearch: { ...completedResearch },
    bottlenecks,
    stallLogTop,
  };
}
