export type ExpeditionRouteMode = "local" | "jump_gate";

export const JUMP_FUEL_RESOURCE_ID = "jump_fuel";
export const JUMP_GATE_JUMP_FUEL_COST = 50;
/** @deprecated Use `JUMP_GATE_JUMP_FUEL_COST`; Jump Fuel is stored in planet inventory or ship tanks. */
export const JUMP_GATE_SHIP_FUEL_COST = JUMP_GATE_JUMP_FUEL_COST;

/**
 * Ship roles whose expeditions fly one-way to the destination and stay there
 * instead of returning to origin. Combat fleets, refuelers/tankers, shield
 * escorts and missile carriers are deployed at the target — they do not
 * automatically come home like a scout's recon trip.
 */
const ONE_WAY_SHIP_ROLES: ReadonlySet<string> = new Set([
  "combat",
  "support",
  "shield",
  "missile",
]);

export function isOneWayShipRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return ONE_WAY_SHIP_ROLES.has(role);
}

/**
 * Whether the launched mission should be modeled as one-way (no return trip).
 *
 * - Colonizers are one-way only when they actually carry a target planet (the
 *   hull is consumed on arrival).
 * - Combat / support / shield / missile hulls deploy one-way when they have a
 *   target planet to dock at, or when a Jump Gate route supplies a destination
 *   map point where the ship can stay stationed.
 */
export function isOneWayExpedition(params: {
  shipRole: string | null | undefined;
  isColonizer?: boolean;
  hasTargetPlanet?: boolean;
  routeMode?: ExpeditionRouteMode;
}): boolean {
  if (
    isOneWayShipRole(params.shipRole) &&
    (params.hasTargetPlanet || params.routeMode === "jump_gate")
  ) {
    return true;
  }
  if (!params.hasTargetPlanet) return false;
  if (params.isColonizer) return true;
  return false;
}

export function calculateJumpGateJumpFuelRequired(returnTrip = true): number {
  return JUMP_GATE_JUMP_FUEL_COST * (returnTrip ? 2 : 1);
}

export function calculateSectorRouteDistance(
  origin: { x: number; y: number },
  target: { x: number; y: number },
): number {
  return Math.hypot(target.x - origin.x, target.y - origin.y);
}

export function calculateExpeditionRequiredFuel(
  distance: number,
  fuelConsumption: number,
  returnTrip = true,
): number {
  const perLy =
    Number.isFinite(fuelConsumption) && fuelConsumption > 0
      ? fuelConsumption
      : 1;
  const tripMultiplier = returnTrip ? 2 : 1;
  return Math.max(1, Math.ceil(distance * tripMultiplier * perLy));
}

export function calculateExpeditionEtaSeconds(
  distance: number,
  speed: number,
  engineFactor = 1,
): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  const factor =
    Number.isFinite(engineFactor) && engineFactor > 0 ? engineFactor : 1;
  return Math.max(0, Math.ceil(((distance * 60) / speed) * factor));
}
