import { ResearchUnlockRequirement } from './research-unlocks.js';

/**
 * Rules for establishing new colonies.
 * Centralized for balance tuning and frontend documentation.
 */
export interface ColonizationRules {
  /** Initial number of colonies allowed before any research. */
  maxColoniesBase: number;
  /** Additional colonies granted per level of logistics research. */
  maxColoniesPerLogisticsLevel: number;
  /** Resource cost deducted from the ORIGIN planet when founding. */
  foundingCost: Record<string, number>;
  /** Minimum time (seconds) required between colonization attempts per player. */
  cooldownSec: number;
  /** Maximum distance (in 3D coordinates) from the nearest owned colony or home system. */
  maxDistance: number;
  /** Global research requirement to even start the colonization flow. */
  researchRequirement: ResearchUnlockRequirement;
}

export const COLONIZATION_RULES: ColonizationRules = {
  maxColoniesBase: 1,
  maxColoniesPerLogisticsLevel: 1, // Total limit = 1 + logistics_level
  foundingCost: {
    iron: 10000,
    water: 5000,
    carbon: 2000,
    silicon: 1000,
  },
  cooldownSec: 1800, // 30 minutes
  maxDistance: 2000, // Significant but not unlimited range
  researchRequirement: {
    branch: 'engineering',
    level: 2,
  },
};
