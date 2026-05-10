export interface BuildingType {
  id: string;
  name: { ru: string; en: string };
  category: string;
  /** From DB; null/undefined = unlimited per planet. */
  maxPerPlanet?: number | null;
  /** From DB; null/undefined = unlimited account-wide. */
  maxGlobal?: number | null;
  maxLevel: number;
  deps: { typeId: string; level: number }[];
  baseCost: Record<string, number>;
  baseTimeSec: number;
  baseOutput: Record<string, unknown>;
  energyConsumption: number;
}

/** Structured validation failure for construction (API + UI copy). */
export type BuildBlockedReason =
  | {
      code: 'building_blocked_per_planet';
      details: { typeId: string; limit: number; current: number };
    }
  | {
      code: 'building_blocked_global';
      details: { typeId: string; limit: number; current: number };
    }
  | {
      code: 'building_blocked_dependency';
      details: { requiredTypeId: string; requiredLevel: number };
    }
  | {
      code: 'building_blocked_research';
      details: { branch: string; level: number };
    };

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
export interface DemolishRequest {
  buildingId: string;
}

export interface DemolishStatus {
  success: boolean;
  message?: string;
  refund?: Record<string, number>;
}
