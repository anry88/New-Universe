import { systemMapPlanetOrbitSlot, type SystemMapPlanetInput } from '../format/systemMapLayout.js';

export const WIND_TURBINE_BASELINE_PLANET_SIZE = 22;
export const ENERGY_DECIMAL_PLACES = 2;

export type PlanetEnergyFormulaInput = Pick<
  SystemMapPlanetInput,
  'id' | 'name' | 'biome' | 'orbitIndex'
> & {
  size: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundEnergyMultiplier(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function roundEnergyAmount(value: number): number {
  const scale = 10 ** ENERGY_DECIMAL_PLACES;
  return Math.round(value * scale) / scale;
}

function normalizedPlanetSize(size: number): number {
  return Number.isFinite(size) && size > 0
    ? size
    : WIND_TURBINE_BASELINE_PLANET_SIZE;
}

export function solarEnergyMultiplier(
  planet: Pick<PlanetEnergyFormulaInput, 'id' | 'name' | 'biome' | 'orbitIndex'>,
): number {
  const orbitSlot = systemMapPlanetOrbitSlot(planet);
  return roundEnergyMultiplier(clamp(1.55 - (orbitSlot - 1) * 0.14, 0.35, 1.55));
}

export function windEnergyMultiplier(planet: Pick<PlanetEnergyFormulaInput, 'size'>): number {
  return roundEnergyMultiplier(
    clamp(normalizedPlanetSize(planet.size) / WIND_TURBINE_BASELINE_PLANET_SIZE, 0.45, 1.75),
  );
}

export function buildingEnergyOutputForLevel(input: {
  typeId: string;
  baseEnergy: number;
  level: number;
  planet?: PlanetEnergyFormulaInput | null;
}): number {
  const baseEnergy = Math.max(0, Number.isFinite(input.baseEnergy) ? input.baseEnergy : 0);
  if (baseEnergy <= 0) return 0;

  const level = Math.max(1, Math.floor(Number.isFinite(input.level) ? input.level : 1));
  if (!input.planet) return roundEnergyAmount(baseEnergy * level);

  if (input.typeId === 'solar_plant') {
    return roundEnergyAmount(baseEnergy * level * solarEnergyMultiplier(input.planet));
  }

  if (input.typeId === 'wind_turbine') {
    return roundEnergyAmount(baseEnergy * level * windEnergyMultiplier(input.planet));
  }

  return roundEnergyAmount(baseEnergy * level);
}
