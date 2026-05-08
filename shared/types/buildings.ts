export interface BuildingType {
  id: string;
  name: { ru: string; en: string };
  category: string;
  maxLevel: number;
  deps: { typeId: string; level: number }[];
  baseCost: Record<string, number>;
  baseTimeSec: number;
  baseOutput: Record<string, unknown>;
  energyConsumption: number;
}

export interface BuildRequest {
  planetId: string;
  typeId: string;
  slotIndex: number;
}

export interface UpgradeRequest {
  buildingId: string;
}

export interface ConstructionStatus {
  success: boolean;
  message?: string;
  queueItem?: {
    id: string;
    completesAt: string;
  };
}
