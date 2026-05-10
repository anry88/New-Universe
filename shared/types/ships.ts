export interface Ship {
  id: string;
  ownerId: string;
  typeId: string;
  locationPlanetId: string | null;
  status: string;
  queueCompletesAt?: string | null;
  cargoJson: Record<string, number>;
  fuel: string;
}

export interface ShipQueueItem {
  id: string;
  planetId: string | null;
  typeId: string;
  status: string;
  queueCompletesAt: string;
  rushCost?: number;
}

export interface RushShipBuildRequest {
  shipId: string;
}

export interface RushShipBuildResponse {
  success: boolean;
  cost: number;
  diamondsRemaining: number;
}

export interface ShipType {
  id: string;
  name: { ru: string; en: string };
  role: string;
  hp: number;
  speed: string;
  cargo: number;
  dps: number;
  armor: number;
  fuelConsumption: string;
  buildTimeSec: number;
  buildCost: Record<string, number>;
  requiredBuildings: { typeId: string; level: number }[];
  sensorRange: number;
}
