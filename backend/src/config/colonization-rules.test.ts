import { describe, expect, it } from 'vitest';
import {
  COLONIZATION_RULES,
  maxColoniesForLogisticsLevel,
} from './colonization-rules.js';

describe('colonization rules config', () => {
  it('declares positive founding costs for core minerals', () => {
    for (const key of ['iron', 'water', 'carbon', 'silicon'] as const) {
      expect(COLONIZATION_RULES.foundingCost[key]).toBeGreaterThan(0);
    }
  });

  it('keeps engineering gate aligned with research unlock typing', () => {
    expect(COLONIZATION_RULES.researchRequirement.branch.length).toBeGreaterThan(0);
    expect(COLONIZATION_RULES.researchRequirement.level).toBeGreaterThanOrEqual(1);
  });

  it('matches the colony-cap formula used by checkColonizationGates', () => {
    expect(maxColoniesForLogisticsLevel(0)).toBe(COLONIZATION_RULES.maxColoniesBase);
    expect(maxColoniesForLogisticsLevel(1)).toBe(
      COLONIZATION_RULES.maxColoniesBase + COLONIZATION_RULES.maxColoniesPerLogisticsLevel,
    );
    expect(COLONIZATION_RULES.maxColoniesPerLogisticsLevel).toBe(5);
  });
});

/** Acceptance gate for epic P2-EPIC-COLONIZE: expand to multiple off-world colonies and cargo (see also backend/tests/e2e/colonization.test.ts). */
describe('P2-EPIC-COLONIZE colony scaling', () => {
  it('adds five colony slots at logistics level 1', () => {
    expect(maxColoniesForLogisticsLevel(1)).toBeGreaterThanOrEqual(6);
  });

  it('adds five more colony slots at logistics level 2', () => {
    expect(maxColoniesForLogisticsLevel(2)).toBeGreaterThanOrEqual(11);
  });
});
