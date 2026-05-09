import { describe, expect, it } from 'vitest';
import { RESEARCH_CATALOG, RESEARCH_TECH_TREE } from './research-catalog.js';

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
