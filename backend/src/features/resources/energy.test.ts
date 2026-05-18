import { describe, expect, it } from 'vitest';
import {
  createPlanetEnergyRequestCache,
  invalidatePlanetEnergyStateCache,
  resolvePlanetEnergyStateFromSnapshot,
  resolvePlanetEnergyState,
  solarEnergyMultiplier,
  windEnergyMultiplier,
} from './energy.js';

describe('planet energy formulas', () => {
  it('makes solar output noticeably stronger on inner orbits than outer orbits', () => {
    const inner = solarEnergyMultiplier({ id: 'inner', name: 'home-1', biome: 'volcanic' });
    const outer = solarEnergyMultiplier({ id: 'outer', name: 'home-8', biome: 'ice' });

    expect(inner).toBeGreaterThan(outer);
    expect(inner - outer).toBeGreaterThan(0.8);
  });

  it('scales wind output by planet size as a mass proxy', () => {
    const small = windEnergyMultiplier({ size: 6 });
    const homeCapital = windEnergyMultiplier({ size: 22 });
    const large = windEnergyMultiplier({ size: 24 });

    expect(homeCapital).toBe(1);
    expect(large).toBeGreaterThan(small);
    expect(large / small).toBeGreaterThan(1.5);
  });

  it('makes a size-22 level-1 wind turbine produce 75 energy before research', () => {
    const now = new Date();
    const state = resolvePlanetEnergyStateFromSnapshot(
      {
        id: 'home-capital',
        name: 'home-1',
        biome: 'green',
        size: 22,
        buildings: [
          {
            id: 'wind-home',
            typeId: 'wind_turbine',
            level: 1,
            queueAction: null,
            type: { id: 'wind_turbine', baseOutput: { energy: 75 }, energyConsumption: 0 },
          },
        ],
      },
      { amount: '0', lastUpdateAt: now },
      { now },
    );

    expect(state.produced).toBe(75);
  });

  it('charges active recipe energy per occupied production slot, not per building level', () => {
    const now = new Date();
    const state = resolvePlanetEnergyStateFromSnapshot(
      {
        id: 'production-energy-slots',
        name: 'home-2',
        biome: 'green',
        size: 22,
        buildings: [
          {
            id: 'smelter-l5',
            typeId: 'smelter',
            level: 5,
            queueAction: null,
            type: { id: 'smelter', baseOutput: {}, energyConsumption: 30 },
          },
        ],
        activeProductionOrders: [
          { buildingId: 'smelter-l5', status: 'queued' },
          { buildingId: 'smelter-l5', status: 'queued' },
        ],
      },
      { amount: '100', lastUpdateAt: now },
      { now },
    );

    expect(state.consumed).toBe(60);
    expect(state.buildingStates['smelter-l5'].consumption).toBe(60);
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

  it('waives building and active-process energy demand on energy anomaly planets', () => {
    const now = new Date();
    const state = resolvePlanetEnergyStateFromSnapshot(
      {
        id: 'energy-anomaly',
        name: 'System X - 9',
        biome: 'energy',
        size: 20,
        buildings: [
          {
            id: 'battery-energy-free',
            typeId: 'battery',
            level: 1,
            queueAction: null,
            type: { id: 'battery', baseOutput: { energyCap: 100 }, energyConsumption: 0 },
          },
          {
            id: 'mine-energy-free',
            typeId: 'mine',
            level: 2,
            queueAction: null,
            type: { id: 'mine', baseOutput: {}, energyConsumption: 10 },
          },
          {
            id: 'smelter-energy-free',
            typeId: 'smelter',
            level: 1,
            queueAction: null,
            type: { id: 'smelter', baseOutput: {}, energyConsumption: 25 },
          },
        ],
        activeProductionOrders: [{ buildingId: 'smelter-energy-free', status: 'queued' }],
      },
      { amount: '0', lastUpdateAt: now },
      { now },
    );

    expect(state.consumed).toBe(0);
    expect(state.shortage).toBe(false);
    expect(state.buildingStates['battery-energy-free'].capacity).toBe(100);
    expect(state.buildingStates['mine-energy-free']).toBeUndefined();
    expect(state.buildingStates['smelter-energy-free']).toBeUndefined();
  });

  it('invalidates request-scoped energy snapshots after building state changes', async () => {
    const planetId = 'planet-energy-cache';
    let planetQueryCount = 0;
    const queuedSolar = {
      id: 'solar-cache',
      typeId: 'solar_plant',
      level: 0,
      queueAction: 'build' as string | null,
      type: { id: 'solar_plant', baseOutput: { energy: 50 }, energyConsumption: 0 },
    };
    const database = {
      query: {
        planets: {
          findFirst: async () => {
            planetQueryCount += 1;
            return {
              id: planetId,
              name: 'home-1',
              biome: 'volcanic',
              size: 12,
              system: { ownerId: 'user-energy-cache' },
              buildings: [
                {
                  id: 'battery-cache',
                  typeId: 'battery',
                  level: 1,
                  queueAction: null,
                  type: { id: 'battery', baseOutput: { energyCap: 500 }, energyConsumption: 0 },
                },
                queuedSolar,
              ],
            };
          },
        },
        planetResources: {
          findFirst: async () => ({ amount: '0', lastUpdateAt: new Date() }),
        },
        researchProgress: {
          findMany: async () => [],
        },
        productionOrders: {
          findMany: async () => [],
        },
      },
    };
    const cache = createPlanetEnergyRequestCache();

    const before = await resolvePlanetEnergyState(planetId, database, cache);
    const cached = await resolvePlanetEnergyState(planetId, database, cache);

    expect(cached).toEqual(before);
    expect(planetQueryCount).toBe(1);
    expect(before.produced).toBe(0);

    queuedSolar.level = 1;
    queuedSolar.queueAction = null;
    invalidatePlanetEnergyStateCache(planetId, cache);
    const afterCompletion = await resolvePlanetEnergyState(planetId, database, cache);

    expect(planetQueryCount).toBe(2);
    expect(afterCompletion.produced).toBeGreaterThan(before.produced);
  });
});
