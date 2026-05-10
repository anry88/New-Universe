export interface PlanetResource {
  planetId: string;
  resourceId: string;
  amount: string;
  lastUpdateAt: string;
  regenRate: string;
  storageCap: string;
}

export interface Building {
  id: string;
  planetId: string;
  typeId: string;
  level: number;
  slotIndex: number;
  queueAction?: 'build' | 'upgrade' | 'destroy';
  queueCompletesAt?: string;
}

export interface Planet {
  id: string;
  systemId: string;
  biome: string;
  size: number;
  slotCount: number;
  name: string;
  isDiscovered?: boolean;
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
  name: string;
  seed: number;
  planets?: Planet[];
}
