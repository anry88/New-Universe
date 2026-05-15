import type { CombatStats } from './combat.js';

export interface BuildingOutput {
  resourceId?: string;
  baseRate?: number;
  cap?: number;
  energyCap?: number;
  energy?: number;
  conversion?: {
    from: string;
    to: string;
    rate: number;
  };
}

export interface BuildingType {
  id: string;
  name: { ru: string; en: string };
  description: { ru: string; en: string };
  category: string;
  /** From DB; null/undefined = unlimited per planet. */
  maxPerPlanet?: number | null;
  /** From DB; null/undefined = unlimited account-wide. */
  maxGlobal?: number | null;
  maxLevel: number;
  deps: { typeId: string; level: number }[];
  baseCost: Record<string, number>;
  baseTimeSec: number;
  baseOutput: BuildingOutput;
  energyConsumption: number;
  hp?: number;
  combatStats?: CombatStats;
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
    }
  | {
      code: 'building_blocked_planet_resource';
      details: { resourceId: string; acceptedResourceIds?: string[] };
    }
  | {
      code: 'building_blocked_resource_selection_required';
      details: { typeId: string; acceptedResourceIds: string[] };
    }
  | {
      code: 'building_blocked_invalid_resource_selection';
      details: { typeId: string; resourceId: string; acceptedResourceIds: string[] };
    }
  | {
      code: 'building_blocked_deposit_limit';
      details: { resourceId: string; limit: number; current: number };
    }
  | {
      code: 'building_blocked_max_level';
      details: { maxLevel: number };
    }
  | {
      code: 'building_blocked_command_center_level';
      details: { commandCenterLevel: number; requiredLevel: number };
    }
  | {
      /**
       * Client-side gate: the planet does not currently hold every resource
       * required by the prospective build/upgrade. Backend rejects the same
       * case with `insufficient_resource`; this code keeps the UX message
       * consistent without firing a doomed request.
       */
      code: 'building_blocked_insufficient_resources';
      details: {
        missing: { resourceId: string; required: number; available: number }[];
      };
    }
  | {
      /**
       * Client-side gate: the planet's single construction lane is busy with
       * another build or upgrade. Mirrors the backend's `Build queue is full`
       * error so the player never sees the request fail.
       */
      code: 'building_blocked_queue_full';
      details: { planetId?: string };
    };

export interface BuildRequest {
  planetId: string;
  typeId: string;
  slotIndex: number;
  selectedResourceId?: string | null;
}

export interface UpgradeRequest {
  buildingId: string;
}

export interface ChangeExtractorResourceRequest {
  buildingId: string;
  selectedResourceId: string;
}

export interface ChangeExtractorResourceResponse {
  success: boolean;
  buildingId: string;
  selectedResourceId: string;
}

export interface BuildingQueueItem {
  id: string;
  planetId: string;
  buildingTypeId: string;
  level: number;
  queueAction: 'build' | 'upgrade' | 'destroy';
  queueCompletesAt: string;
  /** Backward-compatible alias for older construction callers. */
  completesAt?: string;
  queueStartedAt?: string | null;
  rushCost?: number;
  selectedResourceId?: string | null;
  slotIndex?: number | null;
}

export interface ConstructionStatus {
  success: boolean;
  message?: string;
  queueItem?: BuildingQueueItem;
}
export interface DemolishRequest {
  buildingId: string;
}

export interface DemolishStatus {
  success: boolean;
  message?: string;
  refund?: Record<string, number>;
}

export interface RushBuildRequest {
  buildingId: string;
}

export interface RushBuildResponse {
  success: boolean;
  cost: number;
  diamondsRemaining: number;
}
