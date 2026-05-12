import { and, eq } from 'drizzle-orm';
import { systemMapPlanetOrbitSlot } from '@shared/format/systemMapLayout.js';
import type { BuildingEnergyState, PlanetEnergyStatus } from '@shared/types/world.js';
import { db as defaultDb } from '../../db/index.js';
import { planetResources, planets } from '../../db/schema.js';

export const ENERGY_RESOURCE_ID = 'energy';
export const BATTERY_BUILDING_TYPE_ID = 'battery';
export const PASSIVE_ENERGY_PRODUCER_TYPES = new Set(['solar_plant', 'wind_turbine']);

type BuildingRow = {
  id: string;
  typeId: string;
  level: number;
  queueAction: string | null;
  type?: {
    id: string;
    baseOutput: Record<string, unknown>;
    energyConsumption: number;
  } | null;
};

type PlanetEnergyInput = {
  id: string;
  name: string;
  biome: string;
  size: number;
  buildings?: BuildingRow[];
};

type EnergyResourceRow = {
  amount: string;
  lastUpdateAt: Date;
} | null;

export interface ResolvedPlanetEnergyState extends PlanetEnergyStatus {
  netRate: number;
  buildingStates: Record<string, BuildingEnergyState>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundEnergy(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function solarEnergyMultiplier(planet: Pick<PlanetEnergyInput, 'id' | 'name' | 'biome'>): number {
  const orbitSlot = systemMapPlanetOrbitSlot(planet);
  return roundEnergy(clamp(1.55 - (orbitSlot - 1) * 0.14, 0.35, 1.55));
}

export function windEnergyMultiplier(planet: Pick<PlanetEnergyInput, 'size'>): number {
  return roundEnergy(clamp(0.55 + planet.size / 24, 0.65, 1.6));
}

function isOperational(building: BuildingRow): boolean {
  return building.queueAction !== 'build' && building.level > 0;
}

function energyCapacityForBuilding(building: BuildingRow): number {
  if (building.typeId !== BATTERY_BUILDING_TYPE_ID || !isOperational(building)) return 0;
  const output = building.type?.baseOutput ?? {};
  const cap = typeof output.energyCap === 'number' ? output.energyCap : 0;
  return cap * building.level;
}

function energyProductionForBuilding(planet: PlanetEnergyInput, building: BuildingRow): number {
  if (!isOperational(building)) return 0;
  const output = building.type?.baseOutput ?? {};
  const baseEnergy = typeof output.energy === 'number' ? output.energy : 0;
  if (baseEnergy <= 0) return 0;

  if (building.typeId === 'solar_plant') {
    return baseEnergy * building.level * solarEnergyMultiplier(planet);
  }

  if (building.typeId === 'wind_turbine') {
    return baseEnergy * building.level * windEnergyMultiplier(planet);
  }

  return baseEnergy * building.level;
}

function energyConsumptionForBuilding(building: BuildingRow): number {
  if (!isOperational(building)) return 0;
  return Math.max(0, Number(building.type?.energyConsumption ?? 0)) * building.level;
}

function resolveEnergyStateFromRows(
  planet: PlanetEnergyInput,
  energyRow: EnergyResourceRow,
  now = new Date(),
): ResolvedPlanetEnergyState {
  const operationalBuildings = planet.buildings?.filter(isOperational) ?? [];
  const capacity = operationalBuildings.reduce((sum, building) => sum + energyCapacityForBuilding(building), 0);
  const produced = operationalBuildings.reduce((sum, building) => sum + energyProductionForBuilding(planet, building), 0);
  const consumed = operationalBuildings.reduce((sum, building) => sum + energyConsumptionForBuilding(building), 0);
  const netRate = produced - consumed;

  const startingAmount = Math.max(0, Number(energyRow?.amount ?? 0));
  const lastUpdateAt = energyRow?.lastUpdateAt ?? now;
  const elapsedHours = Math.max(0, (now.getTime() - lastUpdateAt.getTime()) / 3_600_000);
  const stored = capacity > 0
    ? clamp(startingAmount + netRate * elapsedHours, 0, capacity)
    : 0;
  const shortage = consumed > produced && stored <= 0;

  const buildingStates: Record<string, BuildingEnergyState> = {};
  for (const building of planet.buildings ?? []) {
    const production = energyProductionForBuilding(planet, building);
    const consumption = energyConsumptionForBuilding(building);
    const capacityForBuilding = energyCapacityForBuilding(building);
    if (production <= 0 && consumption <= 0 && capacityForBuilding <= 0) continue;

    buildingStates[building.id] = {
      stored: capacityForBuilding > 0 ? roundEnergy(stored) : undefined,
      capacity: capacityForBuilding > 0 ? roundEnergy(capacity) : undefined,
      production: production > 0 ? roundEnergy(production) : undefined,
      consumption: consumption > 0 ? roundEnergy(consumption) : undefined,
      net: roundEnergy(production - consumption),
      disabled: shortage && consumption > 0,
      reason: shortage && consumption > 0 ? 'energy_shortage' : undefined,
    };
  }

  return {
    stored: roundEnergy(stored),
    capacity: roundEnergy(capacity),
    produced: roundEnergy(produced),
    consumed: roundEnergy(consumed),
    net: roundEnergy(netRate),
    shortage,
    netRate: roundEnergy(netRate),
    buildingStates,
  };
}

export async function resolvePlanetEnergyState(
  planetId: string,
  database: any = defaultDb,
): Promise<ResolvedPlanetEnergyState> {
  const planet = await database.query.planets.findFirst({
    where: eq(planets.id, planetId),
    with: {
      buildings: {
        with: {
          type: true,
        },
      },
    },
  });

  if (!planet) {
    return {
      stored: 0,
      capacity: 0,
      produced: 0,
      consumed: 0,
      net: 0,
      shortage: false,
      netRate: 0,
      buildingStates: {},
    };
  }

  const energyRow = await database.query.planetResources.findFirst({
    where: and(
      eq(planetResources.planetId, planetId),
      eq(planetResources.resourceId, ENERGY_RESOURCE_ID),
    ),
  });

  return resolveEnergyStateFromRows(planet, energyRow ?? null);
}

export async function syncEnergyResourceRow(
  planetId: string,
  database: any = defaultDb,
): Promise<ResolvedPlanetEnergyState> {
  const state = await resolvePlanetEnergyState(planetId, database);
  const existing = await database.query.planetResources.findFirst({
    where: and(
      eq(planetResources.planetId, planetId),
      eq(planetResources.resourceId, ENERGY_RESOURCE_ID),
    ),
  });

  if (state.capacity <= 0 && !existing) return state;

  const amount = state.stored.toFixed(4);
  const regenRate = state.netRate.toFixed(4);
  const now = new Date();

  if (existing) {
    await database
      .update(planetResources)
      .set({ amount, regenRate, lastUpdateAt: now })
      .where(
        and(
          eq(planetResources.planetId, planetId),
          eq(planetResources.resourceId, ENERGY_RESOURCE_ID),
        ),
      );
  } else {
    await database.insert(planetResources).values({
      planetId,
      resourceId: ENERGY_RESOURCE_ID,
      amount,
      regenRate,
      lastUpdateAt: now,
    });
  }

  return state;
}

export function energyRequirementForDuration(energyConsumptionPerHour: number, durationSec: number): number {
  if (energyConsumptionPerHour <= 0 || durationSec <= 0) return 0;
  return Math.max(0.0001, roundEnergy((energyConsumptionPerHour * durationSec) / 3600));
}

export async function resolveEnergyOutputCapacity(
  planetId: string,
  database: any = defaultDb,
): Promise<{ currentAmount: number; storageCap: number }> {
  const state = await resolvePlanetEnergyState(planetId, database);
  return {
    currentAmount: state.stored,
    storageCap: state.capacity,
  };
}
