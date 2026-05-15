/**
 * Research prerequisites for constructing specific building types.
 * Imported by backend gates and frontend build eligibility (single catalog).
 */

export interface ResearchUnlockRequirement {
  branch: string;
  level: number;
}

/** Building type ID → minimum completed research level for **new** construction */
export const BUILDING_RESEARCH_GATES: Partial<Record<string, ResearchUnlockRequirement>> = {
  /** Lab, Battery, and Solar Plant are intentionally ungated level-0 infrastructure. */
  wind_turbine: { branch: 'energy', level: 1 },
  fuel_generator: { branch: 'energy', level: 2 },
  shipyard: { branch: 'engineering', level: 1 },
  spaceport: { branch: 'engineering', level: 1 },
  cryo_factory: { branch: 'engineering', level: 2 },
  smelter: { branch: 'mining', level: 1 },
  fabrication_bay: { branch: 'engineering', level: 1 },
  military_shipyard: { branch: 'weapons', level: 1 },
};
