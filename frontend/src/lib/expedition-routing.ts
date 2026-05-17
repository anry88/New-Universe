import type { ExpeditionRouteMode } from "@shared/config/expeditionRouting";
import {
  calculateJumpGateJumpFuelRequired,
  calculateExpeditionEtaSeconds,
  calculateExpeditionRequiredFuel,
  calculateSectorRouteDistance,
  isOneWayExpedition,
} from "@shared/config/expeditionRouting";

export interface ExpeditionPreviewInput {
  routeMode: ExpeditionRouteMode;
  originSector: { x: number; y: number };
  targetSector: { x: number; y: number };
  sameSystemPlanetDistance?: number | null;
  jumpGateRouteDistance?: number | null;
  hasTargetPlanet: boolean;
  isColonizer: boolean;
  /** Role of the launching ship type — drives one-way deployment for combat/support hulls. */
  shipRole?: string | null;
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
      ? input.jumpGateRouteDistance ?? sectorDistance
      : input.sameSystemPlanetDistance ?? sectorDistance;
  const distance =
    input.routeMode === "jump_gate" || input.hasTargetPlanet
      ? Math.max(1, requestedDistance)
      : requestedDistance;
  const returnTrip = !isOneWayExpedition({
    shipRole: input.shipRole,
    isColonizer: input.isColonizer,
    hasTargetPlanet: input.hasTargetPlanet,
    routeMode: input.routeMode,
  });

  return {
    distance,
    etaSeconds: calculateExpeditionEtaSeconds(distance, input.speed, 1),
    fuelRequired: calculateExpeditionRequiredFuel(
      distance,
      input.fuelConsumption,
      returnTrip,
    ),
    jumpFuelRequired:
      input.routeMode === "jump_gate"
        ? calculateJumpGateJumpFuelRequired(returnTrip)
        : 0,
    returnTrip,
  };
}
