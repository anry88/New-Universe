import type { Locale } from './locale.js';
import { buildingLabel, formatInsufficientResourceMessage } from './entity-labels.js';
import { researchBranchLabel } from './research.js';

export interface Ship {
  id: string;
  ownerId: string;
  typeId: string;
  locationPlanetId: string | null;
  status: string;
  queueCompletesAt?: string | null;
  queueStartedAt?: string | null;
  cargoJson: Record<string, number>;
  fuel: string;
}

export interface ShipQueueItem {
  id: string;
  planetId: string | null;
  typeId: string;
  status: string;
  queueCompletesAt: string;
  queueStartedAt?: string | null;
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

export type ShipBuildErrorCode =
  | 'ship_build_planet_not_found'
  | 'ship_build_planet_not_owned'
  | 'ship_build_shipyard_required'
  | 'ship_build_unknown_type'
  | 'ship_build_missing_building'
  | 'ship_build_missing_research'
  | 'ship_build_queue_full'
  | 'insufficient_resource';

export type ShipBuildErrorDetails =
  | { code: 'ship_build_planet_not_found' }
  | { code: 'ship_build_planet_not_owned' }
  | { code: 'ship_build_shipyard_required' }
  | { code: 'ship_build_unknown_type'; typeId?: string }
  | { code: 'ship_build_missing_building'; typeId: string; requiredLevel: number }
  | { code: 'ship_build_missing_research'; branch: string; requiredLevel: number; currentLevel: number }
  | { code: 'ship_build_queue_full'; maxQueuedShips: number }
  | { code: 'insufficient_resource'; resourceId: string; required?: number; available?: number };

export function formatShipBuildErrorMessage(error: ShipBuildErrorDetails, locale: Locale = 'en'): string {
  switch (error.code) {
    case 'ship_build_planet_not_found':
      return locale === 'ru' ? 'Планета не найдена.' : 'Planet not found.';
    case 'ship_build_planet_not_owned':
      return locale === 'ru'
        ? 'Строительство кораблей доступно только в ваших поселениях.'
        : 'Ship construction is available only in your settlements.';
    case 'ship_build_shipyard_required':
      return locale === 'ru'
        ? `Для строительства кораблей нужна «${buildingLabel('shipyard', locale)}».`
        : `${buildingLabel('shipyard', locale)} is required to build ships.`;
    case 'ship_build_unknown_type':
      return locale === 'ru' ? 'Такой тип корабля не найден.' : 'Ship type not found.';
    case 'ship_build_missing_building':
      return locale === 'ru'
        ? `Требуется здание «${buildingLabel(error.typeId, locale)}» уровня ${error.requiredLevel}.`
        : `Requires ${buildingLabel(error.typeId, locale)} level ${error.requiredLevel}.`;
    case 'ship_build_missing_research':
      return locale === 'ru'
        ? `Требуется исследование «${researchBranchLabel(error.branch, locale)}» уровня ${error.requiredLevel}.`
        : `Requires ${researchBranchLabel(error.branch, locale)} research level ${error.requiredLevel}.`;
    case 'ship_build_queue_full':
      return locale === 'ru'
        ? `Очередь верфи заполнена: одновременно доступно ${error.maxQueuedShips} ${error.maxQueuedShips === 1 ? 'корабль' : 'корабля'}.`
        : `Shipyard queue is full: ${error.maxQueuedShips} ship build can be queued at a time.`;
    case 'insufficient_resource':
      return formatInsufficientResourceMessage(error.resourceId, locale);
    default:
      return locale === 'ru' ? 'Корабль нельзя поставить в очередь.' : 'Ship cannot be queued.';
  }
}
