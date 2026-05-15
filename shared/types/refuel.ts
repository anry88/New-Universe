import type { Locale } from './locale.js';
import { shipLabel } from './entity-labels.js';

export interface RefuelRequest {
  /** The ship receiving fuel. */
  targetShipId: string;
  /** The refueler ship providing fuel. */
  sourceShipId: string;
  /** Amount of ordinary fuel to transfer. */
  fuel?: number;
  /** Amount of jump fuel to transfer. */
  jumpFuel?: number;
}

export interface RefuelResponse {
  success: boolean;
  targetShip: {
    id: string;
    fuel: string;
    jumpFuel: string;
  };
  sourceShip: {
    id: string;
    fuel: string;
    jumpFuel: string;
  };
}

export type RefuelErrorCode =
  | 'refuel_target_not_found'
  | 'refuel_source_not_found'
  | 'refuel_same_ship'
  | 'refuel_not_owned'
  | 'refuel_ship_not_idle'
  | 'refuel_not_same_planet'
  | 'refuel_source_not_refueler'
  | 'refuel_no_fuel_requested'
  | 'refuel_exceeds_tank'
  | 'refuel_source_insufficient';

export type RefuelErrorDetails =
  | { code: 'refuel_target_not_found' }
  | { code: 'refuel_source_not_found' }
  | { code: 'refuel_same_ship' }
  | { code: 'refuel_not_owned' }
  | { code: 'refuel_ship_not_idle' }
  | { code: 'refuel_not_same_planet' }
  | { code: 'refuel_source_not_refueler' }
  | { code: 'refuel_no_fuel_requested' }
  | { code: 'refuel_exceeds_tank'; fuelType: 'fuel' | 'jump_fuel'; capacity: number; current: number; requested: number }
  | { code: 'refuel_source_insufficient'; fuelType: 'fuel' | 'jump_fuel'; available: number; requested: number };

export function formatRefuelErrorMessage(
  error: RefuelErrorDetails,
  locale: Locale = 'en',
): string {
  switch (error.code) {
    case 'refuel_target_not_found':
      return locale === 'ru' ? 'Целевой корабль не найден.' : 'Target ship not found.';
    case 'refuel_source_not_found':
      return locale === 'ru' ? 'Корабль-заправщик не найден.' : 'Refueler ship not found.';
    case 'refuel_same_ship':
      return locale === 'ru' ? 'Нельзя заправить корабль из самого себя.' : 'Cannot refuel a ship from itself.';
    case 'refuel_not_owned':
      return locale === 'ru' ? 'Оба корабля должны принадлежать вам.' : 'Both ships must belong to you.';
    case 'refuel_ship_not_idle':
      return locale === 'ru' ? 'Оба корабля должны быть свободны.' : 'Both ships must be idle.';
    case 'refuel_not_same_planet':
      return locale === 'ru'
        ? 'Корабли должны находиться на одной планете.'
        : 'Ships must be on the same planet.';
    case 'refuel_source_not_refueler':
      return locale === 'ru'
        ? `Заправка возможна только от «${shipLabel('refueler', locale)}».`
        : `Refueling is only available from a ${shipLabel('refueler', locale)}.`;
    case 'refuel_no_fuel_requested':
      return locale === 'ru' ? 'Укажите количество топлива для передачи.' : 'Specify fuel amount to transfer.';
    case 'refuel_exceeds_tank':
      return locale === 'ru'
        ? `Превышена ёмкость бака: доступно ${error.capacity}, текущий запас ${error.current}, запрошено ${error.requested}.`
        : `Tank capacity exceeded: capacity ${error.capacity}, current ${error.current}, requested ${error.requested}.`;
    case 'refuel_source_insufficient':
      return locale === 'ru'
        ? `Заправщик не имеет достаточно топлива: доступно ${error.available}, запрошено ${error.requested}.`
        : `Refueler does not have enough fuel: available ${error.available}, requested ${error.requested}.`;
    default:
      return locale === 'ru' ? 'Дозаправка невозможна.' : 'Refueling is unavailable.';
  }
}
