import { and, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import { buildings, expeditions, planets, ships } from '../../db/schema.js';

const RESERVED_EXPEDITION_STATUSES = ['queued', 'in_flight'] as const;
const SLOTLESS_EXPEDITION_TYPES = ['colonizer', 'scout', 'recon_probe'] as const;
const SLOT_SHIP_STATUSES = ['idle', 'building'] as const;

export interface LandingSlotUsage {
  capacity: number;
  occupied: number;
  reserved: number;
  used: number;
  available: number;
}

async function lockPlanet(tx: any, planetId: string): Promise<void> {
  await tx
    .select({ id: planets.id })
    .from(planets)
    .where(eq(planets.id, planetId))
    .for('update');
}

async function loadSpaceportCapacity(tx: any, planetId: string): Promise<number> {
  const rows = await tx
    .select({
      capacity: sql<number>`COALESCE(MAX(${buildings.level}), 0)`,
    })
    .from(buildings)
    .where(
      and(
        eq(buildings.planetId, planetId),
        eq(buildings.typeId, 'spaceport'),
        or(isNull(buildings.queueAction), ne(buildings.queueAction, 'build')),
      ),
    );

  return Number(rows[0]?.capacity ?? 0);
}

async function countOccupiedSlots(tx: any, planetId: string): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`COUNT(*)` })
    .from(ships)
    .where(
      and(
        eq(ships.locationPlanetId, planetId),
        inArray(ships.status, [...SLOT_SHIP_STATUSES]),
      ),
    );

  return Number(rows[0]?.count ?? 0);
}

async function countReservedSlots(tx: any, planetId: string): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`COUNT(*)` })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.targetPlanetId, planetId),
        inArray(expeditions.status, [...RESERVED_EXPEDITION_STATUSES]),
        notInArray(expeditions.type, [...SLOTLESS_EXPEDITION_TYPES]),
      ),
    );

  return Number(rows[0]?.count ?? 0);
}

export async function loadLandingSlotUsage(
  tx: any,
  planetId: string,
  options: { lock?: boolean } = {},
): Promise<LandingSlotUsage> {
  if (options.lock) {
    await lockPlanet(tx, planetId);
  }

  const capacity = await loadSpaceportCapacity(tx, planetId);
  const occupied = await countOccupiedSlots(tx, planetId);
  const reserved = await countReservedSlots(tx, planetId);
  const used = occupied + reserved;

  return {
    capacity,
    occupied,
    reserved,
    used,
    available: Math.max(0, capacity - used),
  };
}
