import type { ResourceId } from './research.js';

export type ProductionOrderStatus = 'queued' | 'paused' | 'completed' | 'cancelled';

export interface ResourceAmount {
  resourceId: ResourceId;
  amount: number;
}

export interface ProductionRecipeSummary {
  id: string;
  buildingTypeId: string;
  name: { ru: string; en: string };
  description: { ru: string; en: string };
  output: ResourceAmount;
  inputs: ResourceAmount[];
  baseDurationSec: number;
}

export interface ProductionPreviewRequest {
  planetId: string;
  buildingId: string;
  recipeId: string;
  quantity: number;
}

export type ProductionStartRequest = ProductionPreviewRequest;

export interface ProductionPreviewResponse {
  recipeId: string;
  buildingId: string;
  planetId: string;
  quantity: number;
  output: ResourceAmount;
  inputs: ResourceAmount[];
  durationSec: number;
  completesAt: string;
  energyPerHour?: number;
  activeSlots?: number;
  maxSlots?: number;
  canStart: boolean;
  blockedReason?: {
    code:
      | 'production_recipe_not_found'
      | 'production_building_required'
      | 'production_invalid_quantity'
      | 'production_insufficient_resources'
      | 'production_insufficient_energy'
      | 'production_output_capacity'
      | 'production_slots_full';
    message: { ru: string; en: string };
    details?: Record<string, unknown>;
  };
}

export interface ProductionOrder {
  id: string;
  userId: string;
  planetId: string;
  buildingId: string | null;
  recipeId: string;
  quantity: number;
  status: ProductionOrderStatus;
  inputs: ResourceAmount[];
  outputs: ResourceAmount[];
  startedAt: string;
  completesAt: string;
  completedAt: string | null;
  pausedAt?: string | null;
  energyPerHour?: number;
}

export interface ProductionStartResponse {
  success: boolean;
  order: ProductionOrder;
}

export interface ProductionOrdersResponse {
  orders: ProductionOrder[];
}
