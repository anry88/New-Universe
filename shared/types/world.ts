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
  /** Stable physical orbit slot; user-visible planet names never drive layout. */
  orbitIndex?: number;
  isDiscovered?: boolean;
  /** True only after the planet has an active Command Center/capital or colony record. */
  isColonized?: boolean;
  /** True when the active colony belongs to the current viewer. */
  isOwnedColony?: boolean;
  /** Current count of standing buildings when a summary endpoint does not expose full building rows. */
  buildingCount?: number;
  /** Recent surface-combat timestamp for map polling/visual state. */
  lastCombatTickAt?: string | null;
  /** Server-side rename counter; first rename is free, subsequent paid. */
  renameCount?: number;
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
  /**
   * Stored system name. New home systems are auto-named with random
   * characters (`xxxx-xxxx`); legacy systems keep the original
   * "{slug}'s system" / "Система {slug}" wording. Renaming overwrites this.
   */
  name: string;
  seed: number;
  /** Four-char lowercase id derived from `id` (`homeSystemShortTag`); planet names use `{shortTag}-N`. */
  shortTag?: string;
  /** Server-side rename counter; first rename is free, subsequent paid. */
  renameCount?: number;
  planets?: Planet[];
}
