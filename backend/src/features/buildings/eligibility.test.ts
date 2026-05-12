import { describe, expect, it } from 'vitest';
import {
  resolveBuildBlockedReason,
  formatBuildBlockedMessage,
  resolveBuildingProducedResourceIds,
  resolveBuildingProductionRateForResource,
  resolveExtractorSelectionBlockedReason,
  resolvePlanetResourceBlockedReason,
} from '@shared/types/building-eligibility.js';
import { BUILDING_RESEARCH_GATES, type ResearchUnlockRequirement } from '@shared/config/buildingResearchGates.js';

describe('resolveBuildBlockedReason', () => {
  const emptyGate: ResearchUnlockRequirement | undefined = undefined;

  it('keeps Battery and Solar Plant available without completed Energy research', () => {
    expect(BUILDING_RESEARCH_GATES.battery).toBeUndefined();
    expect(BUILDING_RESEARCH_GATES.solar_plant).toBeUndefined();
    expect(BUILDING_RESEARCH_GATES.wind_turbine).toEqual({ branch: 'energy', level: 1 });
    expect(BUILDING_RESEARCH_GATES.fuel_generator).toEqual({ branch: 'energy', level: 2 });
  });

  it('blocks second command center on the same planet', () => {
    const reason = resolveBuildBlockedReason({
      typeId: 'command_center',
      deps: [],
      maxPerPlanet: 1,
      maxGlobal: null,
      planetBuildings: [{ typeId: 'command_center', level: 1 }],
      globalCountForType: 1,
      researchLevels: new Map(),
      researchGate: emptyGate,
    });
    expect(reason?.code).toBe('building_blocked_per_planet');
    expect(formatBuildBlockedMessage(reason!, 'en')).toContain('maximum');
  });

  it('allows first command center on a planet without one', () => {
    expect(
      resolveBuildBlockedReason({
        typeId: 'command_center',
        deps: [],
        maxPerPlanet: 1,
        maxGlobal: null,
        planetBuildings: [],
        globalCountForType: 0,
        researchLevels: new Map(),
        researchGate: emptyGate,
      }),
    ).toBeNull();
  });

  it('enforces global laboratory cap', () => {
    const reason = resolveBuildBlockedReason({
      typeId: 'lab',
      deps: [{ typeId: 'command_center', level: 3 }],
      maxPerPlanet: null,
      maxGlobal: 1,
      planetBuildings: [{ typeId: 'command_center', level: 3 }],
      globalCountForType: 1,
      researchLevels: new Map(),
      researchGate: emptyGate,
    });
    expect(reason?.code).toBe('building_blocked_global');
  });

  it('prefers research block before dependency', () => {
    const reason = resolveBuildBlockedReason({
      typeId: 'smelter',
      deps: [{ typeId: 'command_center', level: 3 }],
      maxPerPlanet: null,
      maxGlobal: null,
      planetBuildings: [{ typeId: 'command_center', level: 1 }],
      globalCountForType: 0,
      researchLevels: new Map([['mining', 0]]),
      researchGate: { branch: 'mining', level: 1 },
    });
    expect(reason?.code).toBe('building_blocked_research');
  });

  it('localizes Energy research blocks for advanced generators', () => {
    const reason = resolveBuildBlockedReason({
      typeId: 'wind_turbine',
      deps: [{ typeId: 'command_center', level: 1 }],
      maxPerPlanet: null,
      maxGlobal: null,
      planetBuildings: [{ typeId: 'command_center', level: 1 }],
      globalCountForType: 0,
      researchLevels: new Map([['energy', 0]]),
      researchGate: { branch: 'energy', level: 1 },
    });

    expect(reason?.code).toBe('building_blocked_research');
    expect(formatBuildBlockedMessage(reason!, 'en')).toContain('Energy research level 1');
    expect(formatBuildBlockedMessage(reason!, 'ru')).toContain('«Энергетика» уровня 1');
  });

  it('does not treat a command center still under construction as a dependency', () => {
    const reason = resolveBuildBlockedReason({
      typeId: 'mine',
      deps: [{ typeId: 'command_center', level: 1 }],
      maxPerPlanet: null,
      maxGlobal: null,
      planetBuildings: [{ typeId: 'command_center', level: 1 }],
      dependencyBuildings: [],
      globalCountForType: 0,
      researchLevels: new Map(),
      researchGate: emptyGate,
    });
    expect(reason?.code).toBe('building_blocked_dependency');
  });
});

describe('planet resource construction rules', () => {
  it('blocks extractors when the planet has no matching deposit class', () => {
    const mineReason = resolvePlanetResourceBlockedReason({
      typeId: 'mine',
      planetResourceIds: ['methane', 'water'],
    });
    expect(mineReason?.code).toBe('building_blocked_planet_resource');
    expect(formatBuildBlockedMessage(mineReason!, 'en')).toContain('metal deposit');

    const oilReason = resolvePlanetResourceBlockedReason({
      typeId: 'oil_pump',
      planetResourceIds: ['water', 'iron'],
    });
    expect(oilReason?.code).toBe('building_blocked_planet_resource');
    expect(formatBuildBlockedMessage(oilReason!, 'en')).toContain('oil deposit');

    const biomassReason = resolvePlanetResourceBlockedReason({
      typeId: 'biomass_harvester',
      planetResourceIds: ['water', 'iron'],
    });
    expect(biomassReason?.code).toBe('building_blocked_planet_resource');
    expect(formatBuildBlockedMessage(biomassReason!, 'en')).toContain('biomass deposit');
  });

  it('maps extractor output to local deposits instead of fixed catalog ids', () => {
    expect(
      resolveBuildingProducedResourceIds({
        typeId: 'mine',
        baseOutput: { resourceId: 'iron', baseRate: 50 },
        planetResourceIds: ['aluminum', 'copper', 'sulfur', 'water'],
      }),
    ).toEqual(['aluminum', 'copper', 'sulfur']);

    expect(
      resolveBuildingProducedResourceIds({
        typeId: 'mine',
        baseOutput: { resourceId: 'iron', baseRate: 50 },
        planetResourceIds: ['titanium', 'carbon', 'silicon'],
      }),
    ).toEqual(['titanium', 'carbon', 'silicon']);

    expect(
      resolveBuildingProductionRateForResource({
        typeId: 'mine',
        baseOutput: { resourceId: 'iron', baseRate: 50 },
        planetResourceIds: ['aluminum', 'copper'],
        resourceId: 'aluminum',
      }),
    ).toBe(11);

    expect(
      resolveBuildingProducedResourceIds({
        typeId: 'mine',
        baseOutput: { resourceId: 'iron', baseRate: 50 },
        planetResourceIds: ['aluminum', 'copper'],
        selectedResourceId: 'copper',
      }),
    ).toEqual(['copper']);

    expect(
      resolveBuildingProductionRateForResource({
        typeId: 'mine',
        baseOutput: { resourceId: 'iron', baseRate: 50 },
        planetResourceIds: ['aluminum', 'copper'],
        selectedResourceId: 'copper',
        resourceId: 'copper',
      }),
    ).toBe(28);

    expect(
      resolveBuildingProductionRateForResource({
        typeId: 'mine',
        baseOutput: { resourceId: 'iron', baseRate: 50 },
        planetResourceIds: ['iron', 'silicon'],
        selectedResourceId: 'iron',
        resourceId: 'iron',
      }),
    ).toBeGreaterThan(
      resolveBuildingProductionRateForResource({
        typeId: 'mine',
        baseOutput: { resourceId: 'iron', baseRate: 50 },
        planetResourceIds: ['iron', 'silicon'],
        selectedResourceId: 'silicon',
        resourceId: 'silicon',
      }),
    );

    expect(
      resolveBuildingProducedResourceIds({
        typeId: 'biomass_harvester',
        baseOutput: { resourceId: 'biomass', baseRate: 4 },
        planetResourceIds: ['biomass', 'water'],
      }),
    ).toEqual(['biomass']);

    expect(
      resolveBuildingProducedResourceIds({
        typeId: 'smelter',
        baseOutput: { resourceId: 'steel', baseRate: 36 },
        planetResourceIds: ['iron', 'water'],
      }),
    ).toEqual([]);
  });

  it('blocks extractor choices when a selected deposit is invalid or exhausted', () => {
    const missingSelection = resolveExtractorSelectionBlockedReason({
      typeId: 'mine',
      planetResourceIds: ['iron', 'carbon'],
    });
    expect(missingSelection?.code).toBe('building_blocked_resource_selection_required');

    const invalidSelection = resolveExtractorSelectionBlockedReason({
      typeId: 'mine',
      selectedResourceId: 'water',
      planetResourceIds: ['iron', 'carbon'],
    });
    expect(invalidSelection?.code).toBe('building_blocked_invalid_resource_selection');

    const exhausted = resolveExtractorSelectionBlockedReason({
      typeId: 'mine',
      selectedResourceId: 'iron',
      planetResourceIds: ['iron', 'carbon'],
      depositLimitsByResourceId: { iron: 2, carbon: 1 },
      usedExtractorCountsByResourceId: { iron: 2 },
    });
    expect(exhausted?.code).toBe('building_blocked_deposit_limit');
    expect(formatBuildBlockedMessage(exhausted!, 'en')).toContain('deposit limit reached');
    expect(formatBuildBlockedMessage(exhausted!, 'ru')).toContain('Лимит месторождений');
  });
});
