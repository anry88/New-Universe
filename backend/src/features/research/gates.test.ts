import { describe, expect, it } from 'vitest';
import {
  assertResearchRequirement,
  levelsMapFromRows,
  meetsResearchRequirement,
} from './gates.js';
import {
  BUILDING_RESEARCH_GATES,
  COLONIZATION_RESEARCH_GATE,
  SHIP_RESEARCH_GATES,
} from '../../config/research-unlocks.js';

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

  it('gates combat ship hulls behind Weapons research branch', () => {
    expect(SHIP_RESEARCH_GATES.fighter).toEqual({ branch: 'weapons', level: 1 });
    expect(SHIP_RESEARCH_GATES.cruiser).toEqual({ branch: 'weapons', level: 2 });
    expect(SHIP_RESEARCH_GATES.battleship).toEqual({ branch: 'weapons', level: 3 });
    expect(SHIP_RESEARCH_GATES.medium_fighter).toEqual({ branch: 'weapons', level: 3 });
    expect(SHIP_RESEARCH_GATES.heavy_fighter).toEqual({ branch: 'weapons', level: 4 });
    expect(SHIP_RESEARCH_GATES.rocket_carrier).toEqual({ branch: 'weapons', level: 4 });
    expect(SHIP_RESEARCH_GATES.heavy_rocket_carrier).toEqual({ branch: 'weapons', level: 5 });
  });

  it('gates shield ship hulls behind Energy research branch', () => {
    expect(SHIP_RESEARCH_GATES.small_shield_ship).toEqual({ branch: 'energy', level: 2 });
    expect(SHIP_RESEARCH_GATES.medium_shield_ship).toEqual({ branch: 'energy', level: 3 });
    expect(SHIP_RESEARCH_GATES.large_shield_ship).toEqual({ branch: 'energy', level: 4 });
  });

  it('gates atomic reactor construction behind Energy IV', () => {
    expect(BUILDING_RESEARCH_GATES.atomic_reactor).toEqual({ branch: 'energy', level: 4 });
  });

  it('blocks fighter build when Weapons I is not researched', () => {
    const map = levelsMapFromRows([]);
    const gate = SHIP_RESEARCH_GATES.fighter!;
    expect(meetsResearchRequirement(map, gate)).toBe(false);
  });

  it('allows fighter build after Weapons I is researched', () => {
    const map = levelsMapFromRows([{ branch: 'weapons', level: 1 }]);
    const gate = SHIP_RESEARCH_GATES.fighter!;
    expect(meetsResearchRequirement(map, gate)).toBe(true);
  });

  it('blocks cruiser build until Weapons II', () => {
    const mapL1 = levelsMapFromRows([{ branch: 'weapons', level: 1 }]);
    const mapL2 = levelsMapFromRows([{ branch: 'weapons', level: 2 }]);
    const gate = SHIP_RESEARCH_GATES.cruiser!;
    expect(meetsResearchRequirement(mapL1, gate)).toBe(false);
    expect(meetsResearchRequirement(mapL2, gate)).toBe(true);
  });

  it('blocks battleship build until Weapons III', () => {
    const mapL2 = levelsMapFromRows([{ branch: 'weapons', level: 2 }]);
    const mapL3 = levelsMapFromRows([{ branch: 'weapons', level: 3 }]);
    const gate = SHIP_RESEARCH_GATES.battleship!;
    expect(meetsResearchRequirement(mapL2, gate)).toBe(false);
    expect(meetsResearchRequirement(mapL3, gate)).toBe(true);
  });

  it('blocks heavy rocket carriers until Weapons V', () => {
    const mapL4 = levelsMapFromRows([{ branch: 'weapons', level: 4 }]);
    const mapL5 = levelsMapFromRows([{ branch: 'weapons', level: 5 }]);
    const gate = SHIP_RESEARCH_GATES.heavy_rocket_carrier!;
    expect(meetsResearchRequirement(mapL4, gate)).toBe(false);
    expect(meetsResearchRequirement(mapL5, gate)).toBe(true);
  });
});
