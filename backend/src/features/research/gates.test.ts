import { describe, expect, it } from 'vitest';
import {
  assertResearchRequirement,
  levelsMapFromRows,
  meetsResearchRequirement,
} from './gates.js';
import { COLONIZATION_RESEARCH_GATE, SHIP_RESEARCH_GATES } from '../../config/research-unlocks.js';

describe('research gates', () => {
  it('levelsMapFromRows aggregates branch levels', () => {
    const map = levelsMapFromRows([
      { branch: 'mining', level: 2 },
      { branch: 'engineering', level: 1 },
    ]);
    expect(map.get('mining')).toBe(2);
    expect(map.get('engineering')).toBe(1);
  });

  it('meetsResearchRequirement returns false when level is too low', () => {
    const map = levelsMapFromRows([{ branch: 'engineering', level: 1 }]);
    expect(meetsResearchRequirement(map, { branch: 'engineering', level: 2 })).toBe(false);
  });

  it('meetsResearchRequirement returns true when satisfied', () => {
    const map = levelsMapFromRows([{ branch: 'engineering', level: 2 }]);
    expect(meetsResearchRequirement(map, COLONIZATION_RESEARCH_GATE)).toBe(true);
  });

  it('assertResearchRequirement throws with descriptive message', () => {
    const map = levelsMapFromRows([]);
    expect(() =>
      assertResearchRequirement(map, SHIP_RESEARCH_GATES.recon_probe, 'Build ship recon_probe'),
    ).toThrow(/recon_probe/);
  });

  it('gates cargo_light construction behind Logistics level 1', () => {
    expect(SHIP_RESEARCH_GATES.cargo_light).toEqual({ branch: 'logistics', level: 1 });
  });

  it('assertResearchRequirement no-ops when requirement undefined', () => {
    const map = levelsMapFromRows([]);
    expect(() => assertResearchRequirement(map, undefined, 'scout')).not.toThrow();
  });
});
