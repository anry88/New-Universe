import type { Expedition } from "@shared/types/expeditions";
import type { Ship } from "@shared/types/ships";
import type { HomeSystem, Planet } from "@shared/types/world";

export type FleetPlanetSummary = Pick<Planet, "id" | "name" | "systemId">;

export type FleetSystemSummary = Pick<
  HomeSystem,
  "id" | "name" | "sectorX" | "sectorY" | "sectorZ"
>;

export interface FleetLocationAnchorInput {
  ship: Pick<Ship, "locationPlanetId">;
  activeExpedition?: Expedition | null;
  planetsById: Map<string, FleetPlanetSummary>;
  systemsById: Map<string, FleetSystemSummary>;
  homeSystem?: FleetSystemSummary | null;
  systemLabel: string;
}

function sectorLabel(
  systemLabel: string,
  sector: { x?: number | null; y?: number | null; z?: number | null },
): string {
  return `${systemLabel} · ${sector.x ?? 0}:${sector.y ?? 0}:${sector.z ?? 0}`;
}

function systemSummaryLabel(
  system: FleetSystemSummary | null | undefined,
  systemLabel: string,
): string | null {
  if (!system) return null;
  if (system.name) return system.name;
  return sectorLabel(systemLabel, {
    x: system.sectorX,
    y: system.sectorY,
    z: system.sectorZ,
  });
}

function expeditionDestinationSystemId(expedition: Expedition | null | undefined): string | null {
  const resultDestination = expedition?.result?.destinationSystemId;
  if (typeof resultDestination === "string" && resultDestination.length > 0) {
    return resultDestination;
  }

  const resultOrigin = expedition?.result?.originSystemId;
  if (typeof resultOrigin === "string" && resultOrigin.length > 0) {
    return resultOrigin;
  }

  return null;
}

export function fleetLocationAnchorLabel({
  ship,
  activeExpedition,
  planetsById,
  systemsById,
  homeSystem,
  systemLabel,
}: FleetLocationAnchorInput): string {
  const dockedPlanet = ship.locationPlanetId
    ? planetsById.get(ship.locationPlanetId)
    : null;
  if (dockedPlanet) return dockedPlanet.name;

  const targetPlanet = activeExpedition?.targetPlanetId
    ? planetsById.get(activeExpedition.targetPlanetId)
    : null;
  if (targetPlanet) return targetPlanet.name;

  const originPlanet = activeExpedition?.originPlanetId
    ? planetsById.get(activeExpedition.originPlanetId)
    : null;
  const systemId =
    expeditionDestinationSystemId(activeExpedition) ?? originPlanet?.systemId ?? null;
  const systemFromMap = systemId ? systemsById.get(systemId) : null;
  const mappedLabel = systemSummaryLabel(systemFromMap, systemLabel);
  if (mappedLabel) return mappedLabel;

  const homeLabel = systemSummaryLabel(homeSystem, systemLabel);
  if (homeLabel) return homeLabel;

  if (activeExpedition) {
    return sectorLabel(systemLabel, {
      x: activeExpedition.targetX,
      y: activeExpedition.targetY,
      z: activeExpedition.targetZ,
    });
  }

  return systemLabel;
}
