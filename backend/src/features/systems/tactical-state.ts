import { and, eq, ne, sql } from 'drizzle-orm';
import type {
  SystemTacticalFleetContact,
  SystemTacticalStateResponse,
} from '@shared/types/system-tactical.js';
import { SHIP_STATUS_DESTROYED } from '@shared/types/combat.js';
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

function serializeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function maskPublicAlias(user: { tgUsername: string | null; tgFirstName: string | null }): string | null {
  if (user.tgUsername) return `@${user.tgUsername.slice(0, 12)}`;
  if (user.tgFirstName) return `${user.tgFirstName.slice(0, 1)}...`;
  return null;
}

function pointFromUnknown(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  return typeof point.x === 'number' && typeof point.y === 'number'
    ? { x: point.x, y: point.y }
    : null;
}

function targetSystemPointFromResult(result: unknown): { x: number; y: number } | null {
  if (!result || typeof result !== 'object') return null;
  return pointFromUnknown((result as Record<string, unknown>).targetSystemPoint);
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

  const ownStationedShip = await database
    .select({ id: ships.id })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .where(
      and(
        eq(ships.ownerId, userId),
        eq(expeditions.status, 'stationed'),
        sql`${expeditions.result} ->> 'destinationSystemId' = ${systemId}`,
      ),
    )
    .limit(1);

  return ownStationedShip.length > 0;
}

export async function loadSystemFleetContacts(
  userId: string,
  systemId: string,
  database: SystemsDatabase = defaultDb,
): Promise<SystemTacticalFleetContact[]> {
  const rows = await database
    .select({
      shipId: ships.id,
      shipTypeId: ships.typeId,
      shipHp: ships.hp,
      shipMaxHp: ships.maxHp,
      shipCombatStats: ships.combatStats,
      shipLastCombatTickAt: ships.lastCombatTickAt,
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
        eq(expeditions.status, 'stationed'),
        sql`${expeditions.result} ->> 'destinationSystemId' = ${systemId}`,
        ne(ships.ownerId, userId),
        ne(ships.status, SHIP_STATUS_DESTROYED),
      ),
    );

  return rows.flatMap((row) => {
    const point = targetSystemPointFromResult(row.result);
    if (!point) return [];

    return [{
      id: row.shipId,
      systemId,
      relation: 'foreign',
      visibility: 'summary',
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
  const canView = await canViewSystemTacticalState(userId, systemId, database);
  if (!canView) return null;

  return {
    systemId,
    fleetContacts: await loadSystemFleetContacts(userId, systemId, database),
    updatedAt: (options.now ?? new Date()).toISOString(),
  };
}
