import { describe, expect, it } from 'vitest';
import { BUILDING_BY_TYPE, resolveBuildingType } from './buildings';

describe('resolveBuildingType', () => {
  it('returns catalog entry for known ids', () => {
    expect(resolveBuildingType('solar_plant')).toBe(BUILDING_BY_TYPE.solar_plant);
  });

  it('falls back to mine for unknown ids', () => {
    expect(resolveBuildingType('nonexistent_building')).toBe(BUILDING_BY_TYPE.mine);
  });
});
