import type { JumpGateJumpResponse } from './jump-gate.js';
import type { Locale } from './locale.js';
import { formatInsufficientResourceMessage, shipLabel } from './entity-labels.js';
import type { ExpeditionRouteMode } from '../config/expeditionRouting.js';

export interface LaunchExpeditionRequest {
  shipId: string;
  routeMode?: ExpeditionRouteMode;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  /** Known public destination system used when `routeMode` is `jump_gate`. */
  destinationSystemId?: string | null;
  /** Deprecated client hint. Fuel is calculated server-side from distance and ship consumption. */
  fuelLoaded?: number;
  cargoLoaded: number;
  /** Target body for direct survey or colonizer deployment. */
  targetPlanetId?: string | null;
}

export interface ExpeditionResult {
  fuelRequired?: number;
  jumpFuelRequired?: number;
  /** Deprecated legacy field from older launches; new launches use `fuelRequired`. */
  fuelLoaded?: number;
  cargoLoaded?: number;
  distance?: number;
  requestedDistance?: number;
  speed?: number;
  engineFactor?: number;
  routeMode?: ExpeditionRouteMode;
  destinationSystemId?: string | null;
  [key: string]: unknown;
}

export interface Expedition {
  id: string;
  shipId: string;
  type: string;
  originPlanetId: string;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetPlanetId: string | null;
  status: string;
  eta: string;
  returnedAt: string | null;
  result: ExpeditionResult;
}

export interface ExpeditionJumpRequest {
  shipId: string;
  mode?: 'random';
  destinationSystemId?: string;
  /**
   * @deprecated Manual sector coordinates are no longer accepted for Jump Gate travel.
   * Use `mode: "random"` with a one-use `recon_probe` for server-authoritative
   * exploration, or `destinationSystemId` for a known destination.
   */
  targetSector?: { x: number; y: number; z: number };
}

export interface ExpeditionJumpResponse extends JumpGateJumpResponse {
  deprecated?: boolean;
}

export type LaunchExpeditionErrorCode =
  | 'expedition_ship_required'
  | 'expedition_invalid_route_mode'
  | 'expedition_invalid_numbers'
  | 'expedition_destination_required'
  | 'expedition_cargo_negative'
  | 'expedition_ship_not_found'
  | 'expedition_ship_not_owned'
  | 'expedition_ship_not_idle'
  | 'expedition_ship_not_on_planet'
  | 'expedition_logistics_route_required'
  | 'expedition_jump_gate_role_required'
  | 'expedition_jump_drive_required'
  | 'expedition_jump_gate_locked'
  | 'expedition_jump_gate_calibrating'
  | 'expedition_known_destination_not_found'
  | 'expedition_known_destination_not_public'
  | 'expedition_colonizer_target_required'
  | 'expedition_cargo_capacity'
  | 'expedition_target_not_found'
  | 'expedition_target_wrong_gate_destination'
  | 'expedition_target_not_public'
  | 'expedition_target_sector_mismatch'
  | 'expedition_target_role_required'
  | 'expedition_target_home_required'
  | 'expedition_target_already_surveyed'
  | 'expedition_colonization_blocked'
  | 'expedition_cargo_unavailable'
  | 'insufficient_resource';

export type LaunchExpeditionErrorDetails =
  | { code: 'expedition_ship_required' }
  | { code: 'expedition_invalid_route_mode' }
  | { code: 'expedition_invalid_numbers'; routeMode?: ExpeditionRouteMode }
  | { code: 'expedition_destination_required' }
  | { code: 'expedition_cargo_negative' }
  | { code: 'expedition_ship_not_found' }
  | { code: 'expedition_ship_not_owned' }
  | { code: 'expedition_ship_not_idle' }
  | { code: 'expedition_ship_not_on_planet' }
  | { code: 'expedition_logistics_route_required'; shipTypeId?: string }
  | { code: 'expedition_jump_gate_role_required' }
  | { code: 'expedition_jump_drive_required' }
  | { code: 'expedition_jump_gate_locked' }
  | { code: 'expedition_jump_gate_calibrating' }
  | { code: 'expedition_known_destination_not_found' }
  | { code: 'expedition_known_destination_not_public' }
  | { code: 'expedition_colonizer_target_required' }
  | { code: 'expedition_cargo_capacity' }
  | { code: 'expedition_target_not_found' }
  | { code: 'expedition_target_wrong_gate_destination' }
  | { code: 'expedition_target_not_public' }
  | { code: 'expedition_target_sector_mismatch' }
  | { code: 'expedition_target_role_required' }
  | { code: 'expedition_target_home_required' }
  | { code: 'expedition_target_already_surveyed' }
  | { code: 'expedition_colonization_blocked'; reason?: string }
  | { code: 'expedition_cargo_unavailable' }
  | { code: 'insufficient_resource'; resourceId: string; required?: number; available?: number };

export function formatLaunchExpeditionErrorMessage(
  error: LaunchExpeditionErrorDetails,
  locale: Locale = 'en',
): string {
  switch (error.code) {
    case 'expedition_ship_required':
      return locale === 'ru' ? 'Выберите корабль для запуска.' : 'Select a ship before launch.';
    case 'expedition_invalid_route_mode':
      return locale === 'ru' ? 'Выберите доступный маршрут экспедиции.' : 'Select an available expedition route.';
    case 'expedition_invalid_numbers':
      return locale === 'ru'
        ? 'Проверьте координаты маршрута и загрузку груза.'
        : 'Check route coordinates and cargo load.';
    case 'expedition_destination_required':
      return locale === 'ru'
        ? 'Выберите известное направление Прыжковых врат.'
        : 'Select a known Jump Gate destination.';
    case 'expedition_cargo_negative':
      return locale === 'ru' ? 'Количество груза не может быть отрицательным.' : 'Cargo load cannot be negative.';
    case 'expedition_ship_not_found':
      return locale === 'ru' ? 'Корабль не найден.' : 'Ship not found.';
    case 'expedition_ship_not_owned':
      return locale === 'ru' ? 'Этот корабль не принадлежит вам.' : 'This ship does not belong to you.';
    case 'expedition_ship_not_idle':
      return locale === 'ru' ? 'Корабль уже назначен на другую миссию.' : 'Ship is already assigned to another mission.';
    case 'expedition_ship_not_on_planet':
      return locale === 'ru'
        ? 'Корабль должен находиться на вашей планете перед запуском.'
        : 'Ship must be docked at one of your planets before launch.';
    case 'expedition_logistics_route_required':
      return locale === 'ru'
        ? `${shipLabel(error.shipTypeId ?? 'cargo_light', locale)} использует меню перевозки грузов.`
        : `${shipLabel(error.shipTypeId ?? 'cargo_light', locale)} uses cargo transfer.`;
    case 'expedition_jump_gate_role_required':
      return locale === 'ru'
        ? `Маршруты через врата доступны для кораблей «${shipLabel('scout', locale)}» и «${shipLabel('colonizer', locale)}».`
        : `Jump Gate expedition routes support ${shipLabel('scout', locale)} and ${shipLabel('colonizer', locale)} ships.`;
    case 'expedition_jump_drive_required':
      return locale === 'ru'
        ? 'Для маршрутов через врата нужен Прыжковый двигатель уровня 1.'
        : 'Jump Drive research level 1 is required for gate routes.';
    case 'expedition_jump_gate_locked':
      return locale === 'ru' ? 'Прыжковые врата заблокированы.' : 'Jump Gate is locked.';
    case 'expedition_jump_gate_calibrating':
      return locale === 'ru' ? 'Прыжковые врата ещё калибруются.' : 'Jump Gate calibration is still in progress.';
    case 'expedition_known_destination_not_found':
      return locale === 'ru'
        ? 'Это направление Прыжковых врат больше недоступно.'
        : 'This Jump Gate destination is no longer available.';
    case 'expedition_known_destination_not_public':
      return locale === 'ru'
        ? 'Направление Прыжковых врат должно вести в открытую общую систему.'
        : 'Jump Gate destination must be a public common system.';
    case 'expedition_colonizer_target_required':
      return locale === 'ru' ? 'Выберите планету для колонизации.' : 'Select a colonization target planet.';
    case 'expedition_cargo_capacity':
      return locale === 'ru' ? 'Груз превышает вместимость корабля.' : 'Cargo load exceeds ship capacity.';
    case 'expedition_target_not_found':
      return locale === 'ru' ? 'Целевая планета не найдена.' : 'Target planet not found.';
    case 'expedition_target_wrong_gate_destination':
      return locale === 'ru'
        ? 'Целевая планета должна находиться в выбранной системе Прыжковых врат.'
        : 'Target planet must belong to the selected Jump Gate destination system.';
    case 'expedition_target_not_public':
      return locale === 'ru'
        ? 'Цель через врата должна находиться в открытой общей системе.'
        : 'Jump Gate target planet must be in a public common system.';
    case 'expedition_target_sector_mismatch':
      return locale === 'ru'
        ? 'Сектор маршрута должен совпадать с системой целевой планеты.'
        : 'Route sector must match the target planet system.';
    case 'expedition_target_role_required':
      return locale === 'ru'
        ? `Целевые планеты доступны только для кораблей «${shipLabel('scout', locale)}» и «${shipLabel('colonizer', locale)}».`
        : `Target planets are supported only for ${shipLabel('scout', locale)} and ${shipLabel('colonizer', locale)} missions.`;
    case 'expedition_target_home_required':
      return locale === 'ru'
        ? 'Для локальной разведки выберите планету в вашей домашней системе.'
        : 'For local survey, select a planet in your home system.';
    case 'expedition_target_already_surveyed':
      return locale === 'ru' ? 'Эта планета уже разведана.' : 'This planet has already been surveyed.';
    case 'expedition_colonization_blocked': {
      const normalized = error.reason?.toLowerCase() ?? '';
      if (normalized.includes('not discovered')) {
        return locale === 'ru' ? 'Сначала разведайте эту планету.' : 'Scout this planet before sending a colonizer.';
      }
      if (normalized.includes('already colonized')) {
        return locale === 'ru' ? 'Эта планета уже колонизирована.' : 'This planet is already colonized.';
      }
      if (normalized.includes('protected home')) {
        return locale === 'ru' ? 'Чужие домашние системы нельзя колонизировать.' : 'Foreign home systems cannot be colonized.';
      }
      if (normalized.includes('colony limit')) {
        return locale === 'ru' ? 'Лимит колоний уже достигнут.' : 'Your colony limit is already reached.';
      }
      if (normalized.includes('cooldown')) {
        return locale === 'ru' ? 'Колонизация ещё на перезарядке.' : 'Colonization is still on cooldown.';
      }
      if (normalized.includes('requires engineering')) {
        return locale === 'ru'
          ? 'Требуется исследование «Инженерия» для колонизации.'
          : 'Engineering research is required for colonization.';
      }
      if (normalized.includes('too far')) {
        return locale === 'ru'
          ? 'Цель слишком далеко от ближайшей колонии.'
          : 'Target is too far from the nearest colony.';
      }
      return locale === 'ru' ? 'Колонизация этой планеты недоступна.' : 'This planet cannot be colonized.';
    }
    case 'expedition_cargo_unavailable':
      return locale === 'ru'
        ? 'На стартовой планете недостаточно груза для загрузки.'
        : 'Launch planet does not have enough cargo to load.';
    case 'insufficient_resource':
      return formatInsufficientResourceMessage(error.resourceId, locale);
    default:
      return locale === 'ru' ? 'Запуск экспедиции недоступен.' : 'Expedition launch is unavailable.';
  }
}
