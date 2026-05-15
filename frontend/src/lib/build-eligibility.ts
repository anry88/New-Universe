import type { BuildBlockedReason } from '@shared/types/buildings';
import type { Building, PlanetResource } from '@shared/types/world';

interface PlanetResourceLike {
  resourceId: string;
  amount: string | number;
}

/**
 * Returns `building_blocked_queue_full` when this planet already has a build
 * or upgrade in flight. Mirrors the backend's single-lane queue rule so the
 * client never fires a doomed request.
 */
export function resolveQueueFullBlockedReason(input: {
  planetId?: string;
  planetBuildings: Pick<Building, 'queueAction'>[] | undefined;
}): BuildBlockedReason | null {
  const busy = (input.planetBuildings ?? []).some(
    (building) => Boolean(building.queueAction),
  );
  if (!busy) return null;
  return {
    code: 'building_blocked_queue_full',
    details: input.planetId ? { planetId: input.planetId } : {},
  };
}

/**
 * Returns `building_blocked_insufficient_resources` when the planet does not
 * hold every resource required by `costs`. Mirrors `spendResources` on the
 * backend so the UI can grey the action out before submission.
 */
export function resolveInsufficientResourcesBlockedReason(input: {
  costs: Record<string, number>;
  planetResources: PlanetResourceLike[] | PlanetResource[] | undefined;
}): BuildBlockedReason | null {
  const have = new Map<string, number>();
  for (const row of input.planetResources ?? []) {
    have.set(row.resourceId, Math.floor(Number(row.amount)));
  }

  const missing: { resourceId: string; required: number; available: number }[] = [];
  for (const [resourceId, required] of Object.entries(input.costs)) {
    if (required <= 0) continue;
    const available = have.get(resourceId) ?? 0;
    if (available < required) {
      missing.push({ resourceId, required, available });
    }
  }

  if (missing.length === 0) return null;
  return {
    code: 'building_blocked_insufficient_resources',
    details: { missing },
  };
}
