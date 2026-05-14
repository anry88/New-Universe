import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { buildings, expeditions, planets, ships } from '../../db/schema.js';

const TARGET_RESERVATION_STATUSES = ['queued', 'in_flight'] as const;
const ORIGIN_RETURN_RESERVATION_STATUSES = ['queued', 'in_flight', 'returning'] as const;
const SLOT_SHIP_STATUSES = ['idle', 'building'] as const;

export interface LandingSlotUsage {
  capacity: number;
  occupied: number;
  reservedArrivals: number;
  reservedReturns: number;
  reserved: number;
  used: number;
  available: number;
}

export interface ExpeditionSpaceportReservation {
  originPlanetId?: string;
  targetPlanetId?: string;
}

export function shipRoleRequiresTargetLandingSlot(role: string): boolean {
  return role !== 'colonization' && role !== 'recon' && role !== 'exploration';
}

export function buildExpeditionSpaceportReservation(params: {
  originPlanetId: string;
  targetPlanetId: string | null;
  returnTrip: boolean;
  targetLandingSlotRequired: boolean;
}): ExpeditionSpaceportReservation | undefined {
  const reservation: ExpeditionSpaceportReservation = {};

  if (params.returnTrip) {
    reservation.originPlanetId = params.originPlanetId;
  }

  if (params.targetLandingSlotRequired && params.targetPlanetId) {
    reservation.targetPlanetId = params.targetPlanetId;
  }

  return reservation.originPlanetId || reservation.targetPlanetId
    ? reservation
    : undefined;
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

async function countReservedArrivalSlots(tx: any, planetId: string): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`COUNT(*)` })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.targetPlanetId, planetId),
        inArray(expeditions.status, [...TARGET_RESERVATION_STATUSES]),
        sql`${expeditions.result} #>> '{spaceportReservation,targetPlanetId}' = ${planetId}`,
      ),
    );

  return Number(rows[0]?.count ?? 0);
}

async function countReservedReturnSlots(tx: any, planetId: string): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`COUNT(*)` })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.originPlanetId, planetId),
        inArray(expeditions.status, [...ORIGIN_RETURN_RESERVATION_STATUSES]),
        sql`${expeditions.result} ->> 'returnTrip' = 'true'`,
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
  const reservedArrivals = await countReservedArrivalSlots(tx, planetId);
  const reservedReturns = await countReservedReturnSlots(tx, planetId);
  const reserved = reservedArrivals + reservedReturns;
  const used = occupied + reserved;

  return {
    capacity,
    occupied,
    reservedArrivals,
    reservedReturns,
    reserved,
    used,
    available: Math.max(0, capacity - used),
  };
}
