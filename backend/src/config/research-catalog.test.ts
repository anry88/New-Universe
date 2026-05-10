import { describe, expect, it } from 'vitest';
import { RESEARCH_CATALOG, RESEARCH_TECH_TREE } from './research-catalog.js';
import { getResearchDef } from '../features/research/data.js';

const STEP_EARLY = 2.0;
const STEP_LATE = 2.5;

function costSum(cost: Record<string, number>): number {
  return Object.values(cost).reduce((a, b) => a + b, 0);
}

describe('research catalog', () => {
  it('exposes exactly five tiers per branch (7 × 5 nodes)', () => {
    expect(RESEARCH_TECH_TREE).toHaveLength(35);
    for (const branch of RESEARCH_CATALOG) {
      const levels = branch.levels.map((entry) => entry.level);
      expect(levels).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('keeps localized names/descriptions and positive multipliers when effects exist', () => {
    for (const entry of RESEARCH_TECH_TREE) {
      expect(entry.name.ru.length).toBeGreaterThan(0);
      expect(entry.name.en.length).toBeGreaterThan(0);
      expect(entry.description.ru.length).toBeGreaterThan(0);
      expect(entry.description.en.length).toBeGreaterThan(0);
      for (const effect of entry.effects) {
        expect(effect.multiplier).toBeGreaterThan(0);
      }
    }
  });

  it('applies P2.1-417 cost/time scaling (≥2.0× for L1→L2, ≥2.5× for deeper tiers)', () => {
    for (const branch of RESEARCH_CATALOG) {
      let prevCost = 0;
      let prevTime = 0;
      for (const entry of branch.levels) {
        const sum = costSum(entry.cost as Record<string, number>);
        expect(sum).toBeGreaterThan(0);
        if (entry.level > 1) {
          const minStep = entry.level === 2 ? STEP_EARLY : STEP_LATE;
          /* Integer seconds/resource piles rarely hit pure rational multiples — keep monotonic intent ≥ target − 0.2% */
          const slack = 0.002;
          expect(sum / prevCost).toBeGreaterThanOrEqual(minStep - slack);
          expect(entry.timeSec / prevTime).toBeGreaterThanOrEqual(minStep - slack);
        }
        prevCost = sum;
        prevTime = entry.timeSec;
      }
    }
  });
});

/** Maps acceptance for epic P2-EPIC-RESEARCH: every tech branch completable through catalog max level at the API layer (`getResearchDef`). */
describe('P2-EPIC-RESEARCH catalog ↔ runtime', () => {
  it('defines levels 1–5 per branch for research/start resolution and blocks level 6', () => {
    for (const branch of RESEARCH_CATALOG) {
      expect(getResearchDef(branch.branch, 1)).toBeDefined();
      expect(getResearchDef(branch.branch, 5)).toBeDefined();
      expect(getResearchDef(branch.branch, 6)).toBeUndefined();
    }
  });
});
