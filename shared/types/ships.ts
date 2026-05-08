export interface Ship {
  id: string;
  ownerId: string;
  typeId: string;
  locationPlanetId: string | null;
  status: string;
  cargoJson: Record<string, number>;
  fuel: string;
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
