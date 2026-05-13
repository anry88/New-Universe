import type { ExpeditionRouteMode } from "@shared/config/expeditionRouting";
import {
  calculateExpeditionEtaSeconds,
  calculateExpeditionRequiredFuel,
  calculateSectorRouteDistance,
  JUMP_GATE_SHIP_FUEL_COST,
} from "@shared/config/expeditionRouting";

export interface ExpeditionPreviewInput {
  routeMode: ExpeditionRouteMode;
  originSector: { x: number; y: number };
  targetSector: { x: number; y: number };
  sameSystemPlanetDistance?: number | null;
  hasTargetPlanet: boolean;
  isColonizer: boolean;
  fuelConsumption: number;
  speed: number;
}

export interface ExpeditionPreview {
  distance: number;
  etaSeconds: number;
  fuelRequired: number;
  jumpFuelRequired: number;
  returnTrip: boolean;
}

export function buildExpeditionPreview(
  input: ExpeditionPreviewInput,
): ExpeditionPreview {
  const sectorDistance = calculateSectorRouteDistance(
    input.originSector,
    input.targetSector,
  );
  const requestedDistance =
    input.routeMode === "jump_gate"
      ? sectorDistance
      : input.sameSystemPlanetDistance ?? sectorDistance;
  const distance =
    input.routeMode === "jump_gate" || input.hasTargetPlanet
      ? Math.max(1, requestedDistance)
      : requestedDistance;
  const returnTrip = !(input.isColonizer && input.hasTargetPlanet);

  return {
    distance,
    etaSeconds: calculateExpeditionEtaSeconds(distance, input.speed, 1),
    fuelRequired: calculateExpeditionRequiredFuel(
      distance,
      input.fuelConsumption,
      returnTrip,
    ),
    jumpFuelRequired:
      input.routeMode === "jump_gate" ? JUMP_GATE_SHIP_FUEL_COST : 0,
    returnTrip,
  };
}
