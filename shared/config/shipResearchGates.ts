import type { ResearchUnlockRequirement } from './buildingResearchGates.js';

/** Ship type ID -> minimum completed research before build queue accepts the hull. */
export const SHIP_RESEARCH_GATES: Partial<Record<string, ResearchUnlockRequirement>> = {
  cargo_light: { branch: 'logistics', level: 1 },
  colonizer: { branch: 'engineering', level: 2 },
  recon_probe: { branch: 'sensors', level: 1 },
  jump_ship: { branch: 'jump_drive', level: 1 },
};
