import type { ResearchUnlockRequirement } from './buildingResearchGates.js';

/** Ship type ID -> minimum completed research before build queue accepts the hull. */
export const SHIP_RESEARCH_GATES: Partial<Record<string, ResearchUnlockRequirement>> = {
  cargo_light: { branch: 'logistics', level: 1 },
  colonizer: { branch: 'engineering', level: 2 },
  recon_probe: { branch: 'jump_drive', level: 1 },
  fighter: { branch: 'weapons', level: 1 },
  light_fighter: { branch: 'weapons', level: 1 },
  cruiser: { branch: 'weapons', level: 2 },
  light_bomber: { branch: 'weapons', level: 2 },
  light_laser: { branch: 'weapons', level: 2 },
  battleship: { branch: 'weapons', level: 3 },
  medium_fighter: { branch: 'weapons', level: 3 },
  medium_bomber: { branch: 'weapons', level: 3 },
  medium_laser: { branch: 'weapons', level: 3 },
  rocket_carrier: { branch: 'weapons', level: 4 },
  heavy_fighter: { branch: 'weapons', level: 4 },
  heavy_bomber: { branch: 'weapons', level: 4 },
  heavy_laser: { branch: 'weapons', level: 4 },
  heavy_rocket_carrier: { branch: 'weapons', level: 5 },
};
