import { describe, expect, it, vi } from 'vitest';
import {
  BUILDING_BY_TYPE,
  BUILDING_CATEGORY_ORDER,
  getBuildingCategoryKey,
  getBuildingCategoryLabel,
  resolveBuildingType,
} from './buildings';

describe('resolveBuildingType', () => {
  it('returns catalog entry for known ids', () => {
    expect(resolveBuildingType('solar_plant')).toBe(BUILDING_BY_TYPE.solar_plant);
  });

  it('resolves the new fabrication_bay id (was previously falling back to mine)', () => {
    expect(resolveBuildingType('fabrication_bay')).toBe(BUILDING_BY_TYPE.fabrication_bay);
    expect(BUILDING_BY_TYPE.fabrication_bay.label).toBe('Fabrication Bay');
  });

  it('resolves legacy `electronics_factory` alias to fabrication_bay', () => {
    expect(resolveBuildingType('electronics_factory')).toBe(BUILDING_BY_TYPE.fabrication_bay);
  });

  it('returns a placeholder for unknown ids — never silently masquerades as another building', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const def = resolveBuildingType('nonexistent_building');

    // The whole point of the new fallback: it must not equal any real
    // catalog entry, so unknown buildings cannot impersonate a known one
    // (this was the source of the "fabrication_bay renders as Mine" bug).
    for (const known of Object.values(BUILDING_BY_TYPE)) {
      expect(def).not.toBe(known);
    }
    expect(def.label).toBe('nonexistent_building');
    expect(def.cat).toBe('Unknown');
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe('building categories', () => {
  it('maps catalog ids to stable grouped build-list categories', () => {
    expect(BUILDING_CATEGORY_ORDER).toEqual([
      'energy',
      'extraction',
      'processing',
      'logistics',
      'shipbuilding',
      'progress',
      'special',
      'unknown',
    ]);
    expect(getBuildingCategoryKey('solar_plant')).toBe('energy');
    expect(getBuildingCategoryKey('mine')).toBe('extraction');
    expect(getBuildingCategoryKey('smelter')).toBe('processing');
    expect(getBuildingCategoryKey('cryo_factory')).toBe('processing');
    expect(getBuildingCategoryKey('shipyard')).toBe('shipbuilding');
    expect(getBuildingCategoryKey('command_center')).toBe('special');
    expect(getBuildingCategoryLabel('shipbuilding', 'ru')).toBe('Строительство кораблей');
  });
});
