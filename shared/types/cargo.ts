export interface CargoTransferLoad {
  resourceId: string;
  amount: number;
}

export type CargoTransferRouteMode = 'standard' | 'jump_gate';

export interface CargoTransferRequest {
  shipId: string;
  targetPlanetId: string;
  /**
   * Standard cargo keeps the existing logistics route. Jump Gate cargo is an
   * explicit opt-in route that spends stored jump_fuel from the origin planet.
   */
  routeMode?: CargoTransferRouteMode;
  /**
   * One transfer order can include several load lines. Duplicate resource ids
   * are valid and are aggregated by the backend for reservation and delivery.
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
  distance: number;
  requestedDistance: number;
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
