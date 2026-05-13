/**
 * Declarative research gates for progression actions.
 * Building construction gates live in `shared/config/buildingResearchGates.ts` (backend + UI).
 */

import type { ResearchUnlockRequirement } from '@shared/config/buildingResearchGates.js';

export type { ResearchUnlockRequirement };
export { BUILDING_RESEARCH_GATES } from '@shared/config/buildingResearchGates.js';
export { SHIP_RESEARCH_GATES } from '@shared/config/shipResearchGates.js';

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

/** Jump ship sector jumps (mirrors existing jump.ts rule; kept centralised for docs/tests) */
export const JUMP_DRIVE_RESEARCH_GATE: ResearchUnlockRequirement = {
  branch: 'jump_drive',
  level: 1,
};
