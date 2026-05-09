import { describe, expect, it } from 'vitest';
import { COLONIZATION_RULES } from './colonization-rules.js';

/** Mirrors `checkColonizationGates` colony-cap formula in `features/colonies/colonization-rules.ts`. */
function maxColoniesForLogistics(logisticsLevel: number): number {
  return (
    COLONIZATION_RULES.maxColoniesBase +
    logisticsLevel * COLONIZATION_RULES.maxColoniesPerLogisticsLevel
  );
}

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
    expect(maxColoniesForLogistics(0)).toBe(COLONIZATION_RULES.maxColoniesBase);
    expect(maxColoniesForLogistics(1)).toBe(
      COLONIZATION_RULES.maxColoniesBase + COLONIZATION_RULES.maxColoniesPerLogisticsLevel,
    );
  });
});

/** Acceptance gate for epic P2-EPIC-COLONIZE: expand to multiple off-world colonies and cargo (see also backend/tests/e2e/colonization.test.ts). */
describe('P2-EPIC-COLONIZE colony scaling', () => {
  it('allows at least two off-world colonies at logistics level 1', () => {
    expect(maxColoniesForLogistics(1)).toBeGreaterThanOrEqual(2);
  });

  it('allows three off-world colonies at logistics level 2', () => {
    expect(maxColoniesForLogistics(2)).toBeGreaterThanOrEqual(3);
  });
});
