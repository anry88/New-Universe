import { applyBuildTimeSeconds, type ResearchEffects } from './research/effects.js';

type BuildingQueueLike = {
  level: number;
  queueAction: string | null;
  queueCompletesAt: Date | null;
};

type BuildingTypeLike = {
  baseTimeSec: number;
};

type ShipQueueLike = {
  queueCompletesAt: Date | null;
};

type ShipTypeLike = {
  buildTimeSec: number;
};

function startedAtIso(completesAt: Date | null, durationSec: number): string | null {
  if (!completesAt || durationSec <= 0) return null;
  return new Date(completesAt.getTime() - durationSec * 1000).toISOString();
}

export function buildingQueueDurationSec(
  building: BuildingQueueLike,
  buildingType: BuildingTypeLike | undefined,
  effects: ResearchEffects,
): number | null {
  if (!buildingType || !building.queueAction || !building.queueCompletesAt) return null;
  const baseDuration =
    building.queueAction === 'upgrade'
      ? Math.floor(buildingType.baseTimeSec * Math.pow(1.8, building.level))
      : buildingType.baseTimeSec;
  return applyBuildTimeSeconds(baseDuration, effects);
}

export function deriveBuildingQueueStartedAt(
  building: BuildingQueueLike,
  buildingType: BuildingTypeLike | undefined,
  effects: ResearchEffects,
): string | null {
  const durationSec = buildingQueueDurationSec(building, buildingType, effects);
  if (durationSec == null) return null;
  return startedAtIso(building.queueCompletesAt, durationSec);
}

export function deriveShipQueueStartedAt(
  ship: ShipQueueLike,
  shipType: ShipTypeLike | undefined,
): string | null {
  if (!shipType || !ship.queueCompletesAt) return null;
  return startedAtIso(ship.queueCompletesAt, shipType.buildTimeSec);
}

export function deriveResearchStartedAt(completesAt: Date | null, durationSec: number | undefined): string | null {
  if (!durationSec) return null;
  return startedAtIso(completesAt, durationSec);
}
