export type ExpeditionRouteMode = 'local' | 'jump_gate';

export const JUMP_GATE_SHIP_FUEL_COST = 50;

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
