import { describe, expect, it } from 'vitest';
import {
  buildSystemMapOrbitGuideRadii,
  SYSTEM_MAP_ORBIT_BASE,
  SYSTEM_MAP_ORBIT_STEP,
  systemMapPlanetDistanceLy,
} from '@shared/format/systemMapLayout';

describe('system map layout helpers', () => {
  it('does not expand orbit guides for obfuscated unknown home planets', () => {
    const radii = buildSystemMapOrbitGuideRadii([
      { id: 'capital', name: 'abcd-1', biome: 'green', size: 22 },
      { id: 'hidden-1', name: 'Unknown Planet', biome: 'unknown', size: 0 },
      { id: 'hidden-2', name: 'Unknown Planet', biome: 'unknown', size: 0 },
      { id: 'hidden-3', name: 'Unknown Planet', biome: 'unknown', size: 0 },
    ]);

    expect(radii).toHaveLength(8);
    expect(radii.at(-1)).toBe(SYSTEM_MAP_ORBIT_BASE + 7 * SYSTEM_MAP_ORBIT_STEP);
  });

  it('computes real same-system planet distance instead of a constant fallback', () => {
    const distance = systemMapPlanetDistanceLy(
      [
        { id: 'capital', name: 'abcd-1', biome: 'green', size: 22 },
        { id: 'outer', name: 'abcd-8', biome: 'ice', size: 24 },
      ],
      123,
      'capital',
      'outer',
    );

    expect(distance).not.toBeNull();
    expect(distance!).toBeGreaterThan(1);
  });
});
