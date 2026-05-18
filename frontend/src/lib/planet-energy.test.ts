import { describe, expect, it } from 'vitest';
import {
  buildingEnergyOutputForLevel,
  windEnergyMultiplier,
} from '@shared/config/planetEnergy';

describe('planet energy preview formulas', () => {
  it('scales wind output by planet size for frontend previews', () => {
    const basePlanet = {
      id: 'p-size-22',
      name: 'home-1',
      biome: 'green',
      size: 22,
    };

    expect(windEnergyMultiplier({ size: 22 })).toBe(1);
    expect(buildingEnergyOutputForLevel({
      typeId: 'wind_turbine',
      baseEnergy: 75,
      level: 1,
      planet: basePlanet,
    })).toBe(75);
    expect(buildingEnergyOutputForLevel({
      typeId: 'wind_turbine',
      baseEnergy: 75,
      level: 1,
      planet: { ...basePlanet, id: 'p-size-33', size: 33 },
    })).toBe(112.5);
    expect(buildingEnergyOutputForLevel({
      typeId: 'wind_turbine',
      baseEnergy: 75,
      level: 1,
      planet: { ...basePlanet, id: 'p-size-12', size: 12 },
    })).toBe(40.91);
  });
});
