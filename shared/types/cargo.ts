export interface CargoTransferLoad {
  resourceId: string;
  amount: number;
}

export type CargoTransferRouteMode = 'standard' | 'jump_gate';

export interface CargoTransferRequest {
  shipId: string;
  targetPlanetId: string;
  /** Amount of ordinary fuel to load from the origin planet into the ship tank before departure. */
  fuelLoaded?: number;
  /** Amount of Jump Fuel to load from the origin planet into the ship tank before departure. */
  jumpFuelLoaded?: number;
  /**
   * Standard cargo keeps the existing logistics route. Jump Gate cargo is an
   * explicit opt-in route that consumes Jump Fuel from the ship tank, loading
   * missing fuel from the origin planet before departure when needed.
   */
  routeMode?: CargoTransferRouteMode;
  /**
   * One transfer order can include several load lines. Duplicate resource ids
   * are valid and are aggregated by the backend for reservation and delivery.
   * Empty arrays are valid logistics relocation flights that move only the ship.
   */
  resources: CargoTransferLoad[];
}

export interface CargoTransferRoutePreview {
  routeMode: CargoTransferRouteMode;
  deliveryMode: 'one_way';
  resources: CargoTransferLoad[];
  loads: CargoTransferLoad[];
  totalCargo: number;
  maxCargo: number;
  fuelRequired: number;
  jumpFuelRequired: number;
  fuelLoaded?: number;
  jumpFuelLoaded?: number;
  distance: number;
  requestedDistance: number;
  originGateDistance?: number;
  targetGateDistance?: number;
  speed: number;
  engineFactor: number;
  etaSeconds: number;
  eta: string;
  originSystemId: string;
  targetSystemId: string;
  targetPlanetName?: string;
}

export interface CargoTransferPreviewResponse {
  success: true;
  preview: CargoTransferRoutePreview;
}
