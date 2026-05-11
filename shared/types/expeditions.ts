export interface ExpeditionResult {
  fuelRequired?: number;
  /** Deprecated legacy field from older launches; new launches use `fuelRequired`. */
  fuelLoaded?: number;
  cargoLoaded?: number;
  distance?: number;
  requestedDistance?: number;
  speed?: number;
  engineFactor?: number;
  [key: string]: unknown;
}

export interface Expedition {
  id: string;
  shipId: string;
  type: string;
  originPlanetId: string;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetPlanetId: string | null;
  status: string;
  eta: string;
  returnedAt: string | null;
  result: ExpeditionResult;
}
