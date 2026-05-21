import { describe, expect, it } from 'vitest';
import {
  buildSystemMapLayouts,
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

  it('keeps public destination planets on one generated orbit each', () => {
    const layouts = buildSystemMapLayouts(
      [
        { id: 'p1', name: 'CP-1', biome: 'volcanic', size: 18, orbitIndex: 1 },
        { id: 'p2', name: 'CP-2', biome: 'toxic', size: 19, orbitIndex: 2 },
        { id: 'p3', name: 'CP-3', biome: 'rocky', size: 16, orbitIndex: 3 },
        { id: 'p4', name: 'CP-4', biome: 'ocean', size: 20, orbitIndex: 4 },
        { id: 'p5', name: 'CP-5', biome: 'green', size: 21, orbitIndex: 5 },
        { id: 'p6', name: 'CP-6', biome: 'gas_giant', size: 34, orbitIndex: 6 },
        { id: 'p7', name: 'CP-7', biome: 'ice', size: 17, orbitIndex: 7 },
      ],
      321,
    );

    expect(new Set(layouts.map((layout) => layout.orbitRadius)).size).toBe(7);
    expect(layouts.map((layout) => layout.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
    ]);
    expect(layouts[0]?.orbitRadius).toBe(SYSTEM_MAP_ORBIT_BASE);
    expect(layouts[1]?.orbitRadius).toBe(SYSTEM_MAP_ORBIT_BASE + SYSTEM_MAP_ORBIT_STEP);
  });

  it('keeps planet positions stable when display names change', () => {
    const planets = [
      { id: 'inner-a', name: 'ABCD-2', biome: 'volcanic', size: 18, orbitIndex: 1 },
      { id: 'capital', name: 'ABCD-1', biome: 'green', size: 22, orbitIndex: 6 },
      { id: 'outer', name: 'ABCD-8', biome: 'ice', size: 24, orbitIndex: 8 },
    ];
    const renamedPlanets = planets.map((planet) => ({
      ...planet,
      name: `Custom ${planet.id}`,
    }));

    const before = buildSystemMapLayouts(planets, 777);
    const after = buildSystemMapLayouts(renamedPlanets, 777);

    expect(after.map((layout) => layout.id)).toEqual(before.map((layout) => layout.id));
    for (const layout of before) {
      const renamed = after.find((candidate) => candidate.id === layout.id);
      expect(renamed?.orbitRadius).toBe(layout.orbitRadius);
      expect(renamed?.angle).toBeCloseTo(layout.angle, 12);
      expect(renamed?.x).toBeCloseTo(layout.x, 8);
      expect(renamed?.y).toBeCloseTo(layout.y, 8);
    }
  });
});
