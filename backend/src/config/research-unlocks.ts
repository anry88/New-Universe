/**
 * Declarative research gates for progression actions.
 * Tuning: adjust branch/level pairs here; backend gates and UI labels follow this catalog.
 */

export interface ResearchUnlockRequirement {
  branch: string;
  level: number;
}

/** Building type ID → minimum completed research level for **new** construction */
export const BUILDING_RESEARCH_GATES: Partial<Record<string, ResearchUnlockRequirement>> = {
  /** Lab is not gated — it unlocks the research tree (see research catalog prerequisites). */
  shipyard: { branch: 'engineering', level: 1 },
  spaceport: { branch: 'engineering', level: 1 },
  cryo_factory: { branch: 'engineering', level: 2 },
  smelter: { branch: 'mining', level: 1 },
};

/** Ship type ID → minimum completed research before build queue accepts the hull */
export const SHIP_RESEARCH_GATES: Partial<Record<string, ResearchUnlockRequirement>> = {
  cargo_light: { branch: 'logistics', level: 1 },
  colonizer: { branch: 'engineering', level: 2 },
  recon_probe: { branch: 'sensors', level: 1 },
  jump_ship: { branch: 'jump_drive', level: 1 },
};

/** Founding a colony on a discovered planet (colonizer flow) */
export const COLONIZATION_RESEARCH_GATE: ResearchUnlockRequirement = {
  branch: 'engineering',
  level: 2,
};

/** Player ↔ player cargo expeditions between owned colonies */
export const CARGO_TRANSFER_RESEARCH_GATE: ResearchUnlockRequirement = {
  branch: 'logistics',
  level: 1,
};

/** Creating or cancelling NPC broker orders */
export const NPC_MARKET_TRADING_GATE: ResearchUnlockRequirement = {
  branch: 'logistics',
  level: 1,
};

/** Jump ship sector jumps (mirrors existing jump.ts rule; kept centralised for docs/tests) */
export const JUMP_DRIVE_RESEARCH_GATE: ResearchUnlockRequirement = {
  branch: 'jump_drive',
  level: 1,
};
