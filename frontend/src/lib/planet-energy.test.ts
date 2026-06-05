import { describe, expect, it } from 'vitest';
import {
  buildingEnergyOutputForLevel,
  windEnergyMultiplier,
} from '@shared/config/planetEnergy';
import { mergeLiveEnergyStatus } from './planet-energy';

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

describe('mergeLiveEnergyStatus', () => {
  it('uses live planet inventory energy over stale /me energy fields', () => {
    const merged = mergeLiveEnergyStatus(
      {
        stored: 220,
        capacity: 500,
        produced: 80,
        consumed: 40,
        net: 40,
        shortage: false,
      },
      [
        {
          planetId: 'public-colony',
          resourceId: 'energy',
          amount: '0',
          regenRate: '-25',
          storageCap: '500',
          lastUpdateAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    );

    expect(merged).toEqual({
      stored: 0,
      capacity: 500,
      produced: 80,
      consumed: 40,
      net: -25,
      shortage: true,
    });
  });
});
