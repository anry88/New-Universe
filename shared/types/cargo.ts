export interface CargoTransferLoad {
  resourceId: string;
  amount: number;
}

export interface CargoTransferRequest {
  shipId: string;
  targetPlanetId: string;
  /**
   * One transfer order can include several load lines. Duplicate resource ids
   * are valid and are aggregated by the backend for reservation and delivery.
   */
  resources: CargoTransferLoad[];
}
