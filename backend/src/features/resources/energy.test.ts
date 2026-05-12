import { describe, expect, it } from 'vitest';
import { resolvePlanetEnergyState, solarEnergyMultiplier, windEnergyMultiplier } from './energy.js';

describe('planet energy formulas', () => {
  it('makes solar output noticeably stronger on inner orbits than outer orbits', () => {
    const inner = solarEnergyMultiplier({ id: 'inner', name: 'home-1', biome: 'volcanic' });
    const outer = solarEnergyMultiplier({ id: 'outer', name: 'home-9', biome: 'ice' });

    expect(inner).toBeGreaterThan(outer);
    expect(inner - outer).toBeGreaterThan(0.8);
  });

  it('scales wind output by planet size as a mass proxy', () => {
    const small = windEnergyMultiplier({ size: 6 });
    const large = windEnergyMultiplier({ size: 24 });

    expect(large).toBeGreaterThan(small);
    expect(large / small).toBeGreaterThan(1.5);
  });

  it('applies completed Energy research to production, storage, and demand', async () => {
    const planetId = 'planet-energy-research';
    const database = {
      query: {
        planets: {
          findFirst: async () => ({
            id: planetId,
            name: 'home-1',
            biome: 'volcanic',
            size: 12,
            system: { ownerId: 'user-energy' },
            buildings: [
              {
                id: 'battery-1',
                typeId: 'battery',
                level: 1,
                queueAction: null,
                type: { id: 'battery', baseOutput: { energyCap: 500 }, energyConsumption: 0 },
              },
              {
                id: 'solar-1',
                typeId: 'solar_plant',
                level: 1,
                queueAction: null,
                type: { id: 'solar_plant', baseOutput: { energy: 50 }, energyConsumption: 0 },
              },
              {
                id: 'mine-1',
                typeId: 'mine',
                level: 1,
                queueAction: null,
                type: { id: 'mine', baseOutput: {}, energyConsumption: 10 },
              },
            ],
          }),
        },
        planetResources: {
          findFirst: async () => ({ amount: '100', lastUpdateAt: new Date() }),
        },
        researchProgress: {
          findMany: async () => [{ userId: 'user-energy', branch: 'energy', level: 3, completesAt: null }],
        },
      },
    };

    const state = await resolvePlanetEnergyState(planetId, database);

    expect(state.capacity).toBeCloseTo(625, 4);
    expect(state.produced).toBeCloseTo(50 * solarEnergyMultiplier({ id: planetId, name: 'home-1', biome: 'volcanic' }) * 1.18, 4);
    expect(state.consumed).toBeCloseTo(9.2, 4);
    expect(state.buildingStates['battery-1'].capacity).toBeCloseTo(625, 4);
  });
});
