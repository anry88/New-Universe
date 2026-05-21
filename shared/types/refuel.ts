import type { Locale } from "./locale.js";
import { shipLabel } from "./entity-labels.js";
import type { ExpeditionRouteMode } from "../config/expeditionRouting.js";

export interface RefuelRequest {
  /** The ship receiving fuel. */
  targetShipId: string;
  /** The refueler ship providing fuel. */
  sourceShipId: string;
  /** Route family used to reach the target ship. */
  routeMode?: ExpeditionRouteMode;
  /** Known public destination system used when `routeMode` is `jump_gate`. */
  destinationSystemId?: string | null;
  /** Amount of ordinary fuel to transfer. */
  fuel?: number;
  /** Amount of jump fuel to transfer. */
  jumpFuel?: number;
}

export interface RefuelResponse {
  success: boolean;
  expedition?: {
    id: string;
    eta: string;
    targetPlanetId: string | null;
  };
  queueItem?: {
    id: string;
    completesAt: string;
  };
  targetShip: {
    id: string;
    fuel: string;
    jumpFuel: string;
  };
  sourceShip: {
    id: string;
    fuel: string;
    jumpFuel: string;
    refuelFuel: string;
    refuelJumpFuel: string;
  };
}

export interface RefuelReplenishRequest {
  /** The refueler ship that should fly to a planet and refill there. */
  sourceShipId: string;
  /** Owned planet where the refueler should refill own tanks and support reserves. */
  targetPlanetId: string;
  /** Route family used to reach the target planet. */
  routeMode?: ExpeditionRouteMode;
  /** Known public destination system used when `routeMode` is `jump_gate`. */
  destinationSystemId?: string | null;
}

export interface RefuelReplenishResponse {
  success: boolean;
  expedition?: {
    id: string;
    eta: string;
    targetPlanetId: string | null;
  };
  queueItem?: {
    id: string;
    completesAt: string;
  };
  sourceShip: {
    id: string;
    fuel: string;
    jumpFuel: string;
    refuelFuel: string;
    refuelJumpFuel: string;
  };
}

export type RefuelErrorCode =
  | "refuel_target_not_found"
  | "refuel_source_not_found"
  | "refuel_target_planet_not_found"
  | "refuel_same_ship"
  | "refuel_not_owned"
  | "refuel_ship_not_idle"
  | "refuel_source_not_on_planet"
  | "refuel_target_not_on_planet"
  | "refuel_source_not_refueler"
  | "refuel_no_fuel_requested"
  | "refuel_exceeds_tank"
  | "refuel_invalid_route_mode"
  | "refuel_destination_required"
  | "refuel_jump_drive_required"
  | "refuel_jump_gate_locked"
  | "refuel_jump_gate_calibrating"
  | "refuel_known_destination_not_found"
  | "refuel_known_destination_not_public"
  | "refuel_target_wrong_gate_destination"
  | "refuel_travel_fuel_exceeded"
  | "refuel_travel_jump_fuel_exceeded"
  | "refuel_source_insufficient";

export type RefuelErrorDetails =
  | { code: "refuel_target_not_found" }
  | { code: "refuel_source_not_found" }
  | { code: "refuel_target_planet_not_found" }
  | { code: "refuel_same_ship" }
  | { code: "refuel_not_owned" }
  | { code: "refuel_ship_not_idle" }
  | { code: "refuel_source_not_on_planet" }
  | { code: "refuel_target_not_on_planet" }
  | { code: "refuel_source_not_refueler" }
  | { code: "refuel_no_fuel_requested" }
  | {
      code: "refuel_exceeds_tank";
      fuelType: "fuel" | "jump_fuel";
      capacity: number;
      current: number;
      requested: number;
    }
  | { code: "refuel_invalid_route_mode" }
  | { code: "refuel_destination_required" }
  | { code: "refuel_jump_drive_required" }
  | { code: "refuel_jump_gate_locked" }
  | { code: "refuel_jump_gate_calibrating" }
  | { code: "refuel_known_destination_not_found" }
  | { code: "refuel_known_destination_not_public" }
  | { code: "refuel_target_wrong_gate_destination" }
  | {
      code: "refuel_travel_fuel_exceeded";
      capacity: number;
      required: number;
    }
  | {
      code: "refuel_travel_jump_fuel_exceeded";
      capacity: number;
      required: number;
    }
  | {
      code: "refuel_source_insufficient";
      fuelType: "fuel" | "jump_fuel";
      available: number;
      requested: number;
    };

export function formatRefuelErrorMessage(
  error: RefuelErrorDetails,
  locale: Locale = "en",
): string {
  switch (error.code) {
    case "refuel_target_not_found":
      return locale === "ru"
        ? "Целевой корабль не найден."
        : "Target ship not found.";
    case "refuel_source_not_found":
      return locale === "ru"
        ? "Корабль-заправщик не найден."
        : "Refueler ship not found.";
    case "refuel_target_planet_not_found":
      return locale === "ru"
        ? "Планета для дозаправки не найдена."
        : "Refuel target planet not found.";
    case "refuel_same_ship":
      return locale === "ru"
        ? "Нельзя заправить корабль из самого себя."
        : "Cannot refuel a ship from itself.";
    case "refuel_not_owned":
      return locale === "ru"
        ? "Оба корабля должны принадлежать вам."
        : "Both ships must belong to you.";
    case "refuel_ship_not_idle":
      return locale === "ru"
        ? "Корабль должен быть свободен и не находиться в полёте."
        : "Ship must be idle and not already in transit.";
    case "refuel_source_not_on_planet":
      return locale === "ru"
        ? "Заправщик должен стартовать с планеты."
        : "Refueler must launch from a planet.";
    case "refuel_target_not_on_planet":
      return locale === "ru"
        ? "Целевой корабль должен находиться у планеты."
        : "Target ship must be stationed at a planet.";
    case "refuel_source_not_refueler":
      return locale === "ru"
        ? `Заправка возможна только от «${shipLabel("refueler", locale)}».`
        : `Refueling is only available from a ${shipLabel("refueler", locale)}.`;
    case "refuel_no_fuel_requested":
      return locale === "ru"
        ? "Укажите количество топлива для передачи."
        : "Specify fuel amount to transfer.";
    case "refuel_exceeds_tank":
      return locale === "ru"
        ? `Превышена ёмкость бака: доступно ${error.capacity}, текущий запас ${error.current}, запрошено ${error.requested}.`
        : `Tank capacity exceeded: capacity ${error.capacity}, current ${error.current}, requested ${error.requested}.`;
    case "refuel_invalid_route_mode":
      return locale === "ru"
        ? "Выберите доступный маршрут для заправщика."
        : "Select an available refueler route.";
    case "refuel_destination_required":
      return locale === "ru"
        ? "Выберите известное направление Прыжковых врат."
        : "Select a known Jump Gate destination.";
    case "refuel_jump_drive_required":
      return locale === "ru"
        ? "Для маршрута через врата нужен Прыжковый двигатель уровня 1."
        : "Jump Drive research level 1 is required for gate routes.";
    case "refuel_jump_gate_locked":
      return locale === "ru"
        ? "Прыжковые врата заблокированы."
        : "Jump Gate is locked.";
    case "refuel_jump_gate_calibrating":
      return locale === "ru"
        ? "Прыжковые врата ещё калибруются."
        : "Jump Gate calibration is still in progress.";
    case "refuel_known_destination_not_found":
      return locale === "ru"
        ? "Это направление Прыжковых врат больше недоступно."
        : "This Jump Gate destination is no longer available.";
    case "refuel_known_destination_not_public":
      return locale === "ru"
        ? "Направление Прыжковых врат должно вести в открытую общую систему."
        : "Jump Gate destination must be a public common system.";
    case "refuel_target_wrong_gate_destination":
      return locale === "ru"
        ? "Цель заправщика должна находиться в выбранной системе Прыжковых врат."
        : "Refueler target must be in the selected Jump Gate system.";
    case "refuel_travel_fuel_exceeded":
      return locale === "ru"
        ? `Маршрут требует ${error.required} топлива, но бак заправщика вмещает только ${error.capacity}.`
        : `Route requires ${error.required} fuel, but the refueler tank only holds ${error.capacity}.`;
    case "refuel_travel_jump_fuel_exceeded":
      return locale === "ru"
        ? `Маршрут требует ${error.required} прыжкового топлива, но бак заправщика вмещает только ${error.capacity}.`
        : `Route requires ${error.required} jump fuel, but the refueler tank only holds ${error.capacity}.`;
    case "refuel_source_insufficient":
      return locale === "ru"
        ? `Заправщик не имеет достаточно топлива: доступно ${error.available}, запрошено ${error.requested}.`
        : `Refueler does not have enough fuel: available ${error.available}, requested ${error.requested}.`;
    default:
      return locale === "ru"
        ? "Дозаправка невозможна."
        : "Refueling is unavailable.";
  }
}
