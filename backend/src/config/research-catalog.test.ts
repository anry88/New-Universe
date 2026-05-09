import { describe, expect, it } from 'vitest';
import { RESEARCH_CATALOG, RESEARCH_TECH_TREE } from './research-catalog.js';
import { getResearchDef } from '../features/research/data.js';

describe('research catalog', () => {
  it('contains exactly levels 1-3 for each branch', () => {
    for (const branch of RESEARCH_CATALOG) {
      const levels = branch.levels.map((entry) => entry.level);
      expect(levels).toEqual([1, 2, 3]);
    }
  });

  it('keeps localized names/descriptions and typed effects in each level', () => {
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
});

/** Maps acceptance for epic P2-EPIC-RESEARCH: every tech branch must be completable through level 3 at the API layer (`getResearchDef`). */
describe('P2-EPIC-RESEARCH catalog ↔ runtime', () => {
  it('defines levels 1–3 per branch for research/start resolution and blocks level 4', () => {
    for (const branch of RESEARCH_CATALOG) {
      expect(getResearchDef(branch.branch, 1)).toBeDefined();
      expect(getResearchDef(branch.branch, 2)).toBeDefined();
      expect(getResearchDef(branch.branch, 3)).toBeDefined();
      expect(getResearchDef(branch.branch, 4)).toBeUndefined();
    }
  });
});
