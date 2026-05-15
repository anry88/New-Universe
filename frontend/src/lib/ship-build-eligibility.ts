import { SHIP_RESEARCH_GATES } from "@shared/config/shipResearchGates";
import type { ResearchProgress } from "@shared/types/research";
import type { Ship, ShipType } from "@shared/types/ships";
import type { Expedition } from "@shared/types/expeditions";
import type { Planet } from "@shared/types/world";

export type ShipBuildBlockedReason =
  | {
      type: "missingResearch";
      branch: string;
      requiredLevel: number;
      currentLevel: number;
    }
  | {
      type: "missingBuilding";
      typeId: string;
      requiredLevel: number;
      currentLevel: number;
    }
  | {
      type: "insufficientResource";
      resourceId: string;
      required: number;
      available: number;
    }
  | {
      type: "queueFull";
      /** Maximum concurrent ships per planet (mirrors backend MAX_QUEUED_SHIPS). */
      maxQueuedShips: number;
    }
  | {
      type: "spaceportCapacityFull";
      capacity: number;
      occupied: number;
      reserved: number;
    };

const MAX_QUEUED_SHIPS = 1;

/**
 * Mirrors the backend's `loadLandingSlotUsage` for the rows actually present
 * in `/me`. The frontend only sees in-flight/returning expeditions, so this
 * estimate is conservative: any extra `queued` rows on the server would only
 * make the planet busier, which still results in the correct decision (the
 * spaceport remains "full" or busier).
 */
export function estimateLandingSlotUsage(input: {
  planet: Planet;
  ships: Ship[] | undefined;
  expeditions: Expedition[] | undefined;
}): { capacity: number; occupied: number; reserved: number; used: number } {
  const spaceport = (input.planet.buildings ?? []).find(
    (building) =>
      building.typeId === "spaceport" && building.queueAction !== "build",
  );
  const capacity = spaceport?.level ?? 0;

  const occupied = (input.ships ?? []).filter(
    (ship) =>
      ship.locationPlanetId === input.planet.id &&
      (ship.status === "idle" || ship.status === "building"),
  ).length;

  let reserved = 0;
  const planetId = input.planet.id;
  for (const expedition of input.expeditions ?? []) {
    if (expedition.status !== "in_flight" && expedition.status !== "returning") {
      continue;
    }
    const result = (expedition.result ?? {}) as {
      spaceportReservation?: {
        originPlanetId?: string;
        targetPlanetId?: string;
      };
      returnTrip?: boolean;
    };
    const reservation = result.spaceportReservation;
    if (reservation?.targetPlanetId === planetId) reserved += 1;
    if (
      result.returnTrip === true &&
      expedition.originPlanetId === planetId
    ) {
      reserved += 1;
    }
  }

  return {
    capacity,
    occupied,
    reserved,
    used: occupied + reserved,
  };
}

export function resolveShipBuildBlockedReason(
  planet: Planet,
  shipType: ShipType,
  researchRows: ResearchProgress[] | undefined = [],
  context: {
    ships?: Ship[];
    expeditions?: Expedition[];
  } = {},
): ShipBuildBlockedReason | null {
  for (const requirement of shipType.requiredBuildings) {
    const currentLevel =
      planet.buildings?.find((building) => building.typeId === requirement.typeId)
        ?.level ?? 0;
    if (currentLevel < requirement.level) {
      return {
        type: "missingBuilding",
        typeId: requirement.typeId,
        requiredLevel: requirement.level,
        currentLevel,
      };
    }
  }

  const researchGate = SHIP_RESEARCH_GATES[shipType.id];
  if (researchGate) {
    const currentLevel =
      researchRows.find((row) => row.branch === researchGate.branch)?.level ?? 0;
    if (currentLevel < researchGate.level) {
      return {
        type: "missingResearch",
        branch: researchGate.branch,
        requiredLevel: researchGate.level,
        currentLevel,
      };
    }
  }

  const availableByResource = new Map(
    (planet.resources ?? []).map((resource) => [
      resource.resourceId,
      Math.floor(Number(resource.amount)),
    ]),
  );

  for (const [resourceId, amount] of Object.entries(shipType.buildCost)) {
    const available = availableByResource.get(resourceId) ?? 0;
    if (available < amount) {
      return {
        type: "insufficientResource",
        resourceId,
        required: amount,
        available,
      };
    }
  }

  if (context.ships) {
    const queuedAtPlanet = context.ships.filter(
      (ship) =>
        ship.locationPlanetId === planet.id && ship.status === "building",
    ).length;
    if (queuedAtPlanet >= MAX_QUEUED_SHIPS) {
      return { type: "queueFull", maxQueuedShips: MAX_QUEUED_SHIPS };
    }
  }

  if (context.ships) {
    const usage = estimateLandingSlotUsage({
      planet,
      ships: context.ships,
      expeditions: context.expeditions,
    });
    if (usage.capacity > 0 && usage.used >= usage.capacity) {
      return {
        type: "spaceportCapacityFull",
        capacity: usage.capacity,
        occupied: usage.occupied,
        reserved: usage.reserved,
      };
    }
  }

  return null;
}
