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
  /** True only after the planet has an active Command Center/capital or colony record. */
  isColonized?: boolean;
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
