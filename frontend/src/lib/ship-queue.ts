import type { Ship, ShipQueueItem } from '@shared/types/ships';

export function isShipReadyForOrders(ship: Ship): boolean {
  return ship.status === 'idle';
}

export function queueItemFromBuildingShip(ship: Ship): ShipQueueItem | null {
  if (ship.status !== 'building' || !ship.queueCompletesAt) return null;
  return {
    id: ship.id,
    planetId: ship.locationPlanetId,
    typeId: ship.typeId,
    status: 'building',
    queueCompletesAt: ship.queueCompletesAt,
    queueStartedAt: ship.queueStartedAt ?? null,
  };
}

export function mergeShipBuildQueue(
  queue: ShipQueueItem[],
  ships: Ship[],
): ShipQueueItem[] {
  const byId = new Map(queue.map((item) => [item.id, item]));
  for (const ship of ships) {
    const fallback = queueItemFromBuildingShip(ship);
    if (fallback && !byId.has(fallback.id)) {
      byId.set(fallback.id, fallback);
    }
  }
  return [...byId.values()].sort(
    (left, right) =>
      new Date(left.queueCompletesAt).getTime() -
      new Date(right.queueCompletesAt).getTime(),
  );
}
