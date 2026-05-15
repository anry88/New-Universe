import type { ProductionOrder } from './production.js';

export interface PlanetResource {
  planetId: string;
  resourceId: string;
  amount: string;
  lastUpdateAt: string;
  regenRate: string;
  /** Deposit richness for this resource on the planet; 0 means inventory only. */
  richness?: number;
  storageCap: string;
}

export interface BuildingEnergyState {
  stored?: number;
  capacity?: number;
  production?: number;
  consumption?: number;
  net?: number;
  disabled?: boolean;
  reason?: 'energy_shortage';
}

export interface Building {
  id: string;
  planetId: string;
  typeId: string;
  selectedResourceId?: string | null;
  level: number;
  slotIndex: number;
  queueAction?: 'build' | 'upgrade' | 'destroy';
  queueCompletesAt?: string | null;
  queueStartedAt?: string | null;
  energy?: BuildingEnergyState;
  production?: {
    activeOrders: ProductionOrder[];
  };
  hp?: number;
  maxHp?: number;
}

export interface PlanetEnergyStatus {
  stored: number;
  capacity: number;
  produced: number;
  consumed: number;
  net: number;
  shortage: boolean;
}

export interface Planet {
  id: string;
  systemId: string;
  biome: string;
  size: number;
  slotCount: number;
  name: string;
  isDiscovered?: boolean;
  /** True only after the planet has an active Command Center/capital or colony record. */
  isColonized?: boolean;
  energy?: PlanetEnergyStatus;
  resources?: PlanetResource[];
  buildings?: Building[];
}

export interface HomeSystem {
  id: string;
  ownerId: string;
  isHome: boolean;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  /** Legacy English-shaped label in DB; prefer localized title from `shortTag` + player slug. */
  name: string;
  seed: number;
  /** Four-char lowercase id derived from `id` (`homeSystemShortTag`); planet names use `{shortTag}-N`. */
  shortTag?: string;
  planets?: Planet[];
}
