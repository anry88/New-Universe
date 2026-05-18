import { and, eq, ne, sql } from 'drizzle-orm';
import type {
  SystemTacticalFleetContact,
  SystemTacticalStateResponse,
} from '@shared/types/system-tactical.js';
import { SHIP_STATUS_DESTROYED } from '@shared/types/combat.js';
import {
  systemMapJumpGatePoint,
  type SystemMapPoint,
} from '@shared/format/systemMapLayout.js';
import { db as defaultDb } from '../../db/index.js';
import {
  colonies,
  discoveredSystems,
  expeditions,
  planets,
  ships,
  systems,
  users,
} from '../../db/schema.js';

type SystemsDatabase = typeof defaultDb;

interface GetSystemTacticalStateOptions {
  database?: SystemsDatabase;
  now?: Date;
}

const TACTICAL_EXPEDITION_STATUSES = ['in_flight', 'returning', 'stationed'] as const;
type TacticalExpeditionStatus = typeof TACTICAL_EXPEDITION_STATUSES[number];

function serializeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function maskPublicAlias(user: { tgUsername: string | null; tgFirstName: string | null }): string | null {
  if (user.tgUsername) return `@${user.tgUsername.slice(0, 12)}`;
  if (user.tgFirstName) return `${user.tgFirstName.slice(0, 1)}...`;
  return null;
}

function pointFromUnknown(value: unknown): SystemMapPoint | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  return typeof point.x === 'number' && typeof point.y === 'number'
    ? { x: point.x, y: point.y }
    : null;
}

function expeditionTravelled(
  result: Record<string, unknown>,
  eta: Date,
  now: Date,
): number | null {
  const distance = Number(result.distance);
  const speed = Number(result.speed);
  const engineFactor = Number(result.engineFactor ?? 1);
  if (!Number.isFinite(distance) || !Number.isFinite(speed) || speed <= 0) {
    return null;
  }
  const durationMs = ((distance * 60) / speed) * engineFactor * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const startMs = eta.getTime() - durationMs;
  const progress = (now.getTime() - startMs) / durationMs;
  return Math.max(0, Math.min(1, progress)) * distance;
}

function interpolatePoint(
  start: SystemMapPoint,
  end: SystemMapPoint,
  progress: number,
): SystemMapPoint {
  const p = Math.max(0, Math.min(1, progress));
  return {
    x: start.x + (end.x - start.x) * p,
    y: start.y + (end.y - start.y) * p,
  };
}

function pointForTacticalExpedition(
  row: { status: TacticalExpeditionStatus; result: unknown; eta: Date },
  systemId: string,
  now: Date,
): SystemMapPoint | null {
  const result = row.result && typeof row.result === 'object'
    ? row.result as Record<string, unknown>
    : null;
  if (!result || result.routeMode !== 'jump_gate') return null;

  const destinationSystemId =
    typeof result.destinationSystemId === 'string' ? result.destinationSystemId : null;
  const originSystemId =
    typeof result.originSystemId === 'string' ? result.originSystemId : null;
  const targetPoint = pointFromUnknown(result.targetSystemPoint);
  const originPoint = pointFromUnknown(result.originSystemPoint);
  const gatePoint = systemMapJumpGatePoint();

  if (row.status === 'stationed') {
    return destinationSystemId === systemId ? targetPoint : null;
  }

  const travelled = expeditionTravelled(result, row.eta, now);
  if (travelled === null) return null;

  if (destinationSystemId === systemId && targetPoint) {
    const start = originSystemId === systemId && originPoint ? originPoint : gatePoint;
    const originLegDistance = Number(result.originGateDistance ?? 0);
    const targetLegDistance = Number(result.targetGateDistance ?? result.distance ?? 0);
    if (!Number.isFinite(targetLegDistance) || targetLegDistance <= 0) return null;
    const targetLegProgress =
      row.status === 'returning'
        ? 1 - (travelled - originLegDistance) / targetLegDistance
        : (travelled - originLegDistance) / targetLegDistance;
    if (targetLegProgress < 0 || targetLegProgress > 1) return null;
    return interpolatePoint(start, targetPoint, targetLegProgress);
  }

  if (originSystemId === systemId && originPoint) {
    const end = gatePoint;
    const originLegDistance = Number(result.originGateDistance ?? result.distance ?? 0);
    if (!Number.isFinite(originLegDistance) || originLegDistance <= 0) return null;
    const originLegProgress =
      row.status === 'returning'
        ? 1 - travelled / originLegDistance
        : travelled / originLegDistance;
    if (originLegProgress < 0 || originLegProgress > 1) return null;
    return interpolatePoint(originPoint, end, originLegProgress);
  }

  return null;
}

async function canViewSystemTacticalState(
  userId: string,
  systemId: string,
  database: SystemsDatabase,
): Promise<boolean> {
  const system = await database.query.systems.findFirst({
    where: eq(systems.id, systemId),
  });

  if (!system) return false;
  if (system.isHome && system.ownerId && system.ownerId !== userId) return false;
  if (system.ownerId === userId) return true;

  const discovery = await database.query.discoveredSystems.findFirst({
    where: and(
      eq(discoveredSystems.userId, userId),
      eq(discoveredSystems.systemId, systemId),
    ),
  });
  if (discovery) return true;

  const ownColony = await database
    .select({ id: colonies.id })
    .from(colonies)
    .innerJoin(planets, eq(colonies.planetId, planets.id))
    .where(and(eq(colonies.ownerId, userId), eq(planets.systemId, systemId)))
    .limit(1);
  if (ownColony.length > 0) return true;

  const ownDockedShip = await database
    .select({ id: ships.id })
    .from(ships)
    .innerJoin(planets, eq(ships.locationPlanetId, planets.id))
    .where(and(eq(ships.ownerId, userId), eq(planets.systemId, systemId)))
    .limit(1);
  if (ownDockedShip.length > 0) return true;

  const ownTacticalShip = await database
    .select({ id: ships.id })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .where(
      and(
        eq(ships.ownerId, userId),
        sql`${expeditions.status} in ('in_flight', 'returning', 'stationed')`,
        sql`(
          ${expeditions.result} ->> 'destinationSystemId' = ${systemId}
          or ${expeditions.result} ->> 'originSystemId' = ${systemId}
        )`,
      ),
    )
    .limit(1);

  return ownTacticalShip.length > 0;
}

export async function loadSystemFleetContacts(
  userId: string,
  systemId: string,
  database: SystemsDatabase = defaultDb,
  now: Date = new Date(),
): Promise<SystemTacticalFleetContact[]> {
  const rows = await database
    .select({
      shipId: ships.id,
      shipTypeId: ships.typeId,
      shipHp: ships.hp,
      shipMaxHp: ships.maxHp,
      shipCombatStats: ships.combatStats,
      shipLastCombatTickAt: ships.lastCombatTickAt,
      status: expeditions.status,
      result: expeditions.result,
      eta: expeditions.eta,
      tgUsername: users.tgUsername,
      tgFirstName: users.tgFirstName,
    })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .innerJoin(users, eq(users.id, ships.ownerId))
    .where(
      and(
        sql`${expeditions.status} in ('in_flight', 'returning', 'stationed')`,
        sql`(
          ${expeditions.result} ->> 'destinationSystemId' = ${systemId}
          or ${expeditions.result} ->> 'originSystemId' = ${systemId}
        )`,
        ne(ships.ownerId, userId),
        ne(ships.status, SHIP_STATUS_DESTROYED),
      ),
    );

  return rows.flatMap((row) => {
    const status = TACTICAL_EXPEDITION_STATUSES.includes(row.status as TacticalExpeditionStatus)
      ? row.status as TacticalExpeditionStatus
      : null;
    if (!status) return [];

    const point = pointForTacticalExpedition(
      { status, result: row.result, eta: row.eta },
      systemId,
      now,
    );
    if (!point) return [];

    return [{
      id: row.shipId,
      systemId,
      relation: 'foreign',
      visibility: 'summary',
      status,
      ownerAlias: maskPublicAlias(row),
      shipTypeId: row.shipTypeId,
      hp: row.shipHp,
      maxHp: row.shipMaxHp,
      combatStats: row.shipCombatStats,
      lastCombatTickAt: serializeDate(row.shipLastCombatTickAt),
      point,
      stationedAt: serializeDate(row.eta),
    }];
  });
}

export async function getSystemTacticalState(
  userId: string,
  systemId: string,
  options: GetSystemTacticalStateOptions = {},
): Promise<SystemTacticalStateResponse | null> {
  const database = options.database ?? defaultDb;
  const now = options.now ?? new Date();
  const canView = await canViewSystemTacticalState(userId, systemId, database);
  if (!canView) return null;

  return {
    systemId,
    fleetContacts: await loadSystemFleetContacts(userId, systemId, database, now),
    updatedAt: now.toISOString(),
  };
}
