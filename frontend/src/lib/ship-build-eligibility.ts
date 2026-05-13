import { SHIP_RESEARCH_GATES } from "@shared/config/shipResearchGates";
import type { ResearchProgress } from "@shared/types/research";
import type { ShipType } from "@shared/types/ships";
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
    };

export function resolveShipBuildBlockedReason(
  planet: Planet,
  shipType: ShipType,
  researchRows: ResearchProgress[] | undefined = [],
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

  return null;
}
