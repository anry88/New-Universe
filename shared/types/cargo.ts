export interface CargoTransferLoad {
  resourceId: string;
  amount: number;
}

export interface CargoTransferRequest {
  shipId: string;
  targetPlanetId: string;
  /**
   * Standard cargo keeps the existing logistics route. Jump Gate cargo is an
   * explicit opt-in route that spends stored jump_fuel from the origin planet.
   */
  routeMode?: 'standard' | 'jump_gate';
  /**
   * One transfer order can include several load lines. Duplicate resource ids
   * are valid and are aggregated by the backend for reservation and delivery.
   */
  resources: CargoTransferLoad[];
}
