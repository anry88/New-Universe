import { db } from '../../db/index.js';
import { systems, planets, colonies, ships, users } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import type { SectorPresencePayload, SectorPresenceEntity, WorldPosition } from '@shared/types/multiplayer.js';

export type { PresenceEntityKind, SectorPresenceEntity, SectorPresencePayload, WorldPosition } from '@shared/types/multiplayer.js';

function numericToFloat(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number.parseFloat(v);
  return Number(v);
}

function maskPublicAlias(u: { tgUsername: string | null; tgFirstName: string | null }): string {
  if (u.tgUsername) return `@${u.tgUsername.slice(0, 12)}`;
  if (u.tgFirstName) return `${u.tgFirstName.slice(0, 1)}•••`;
  return 'Player';
}

/**
 * Projects sector-visible markers for the multiplayer map. Foreign **home**
 * systems are omitted entirely so another player's private home never appears
 * on the shared sector canvas (see `docs/multiplayer/visibility.md`).
 */
export async function getSectorPresence(
  viewerId: string,
  sectorX: number,
  sectorY: number,
  sectorZ: number,
): Promise<SectorPresencePayload> {
  const sectorFilter = and(
    eq(systems.sectorX, sectorX),
    eq(systems.sectorY, sectorY),
    eq(systems.sectorZ, sectorZ),
  );

  const sectorSystems = await db.select().from(systems).where(sectorFilter);

  const entities: SectorPresenceEntity[] = [];

  for (const sys of sectorSystems) {
    if (sys.isHome && sys.ownerId && sys.ownerId !== viewerId) {
      continue;
    }

    const worldPosition: WorldPosition = {
      x: numericToFloat(sys.x),
      y: numericToFloat(sys.y),
      z: numericToFloat(sys.z),
    };

    if (sys.ownerId === viewerId && sys.isHome) {
      entities.push({
        kind: 'own_home_system',
        systemId: sys.id,
        title: sys.name,
        visibility: 'full',
        worldPosition,
      });
      continue;
    }

    if (!sys.ownerId) {
      entities.push({
        kind: 'neutral_system',
        systemId: sys.id,
        title: sys.name,
        visibility: 'summary',
        worldPosition,
      });
    }
  }

  const colonyRows = await db
    .select({
      colonyId: colonies.id,
      ownerId: colonies.ownerId,
      planetId: colonies.planetId,
      planetName: planets.name,
      systemId: systems.id,
      systemIsHome: systems.isHome,
      systemOwnerId: systems.ownerId,
      sx: systems.x,
      sy: systems.y,
      sz: systems.z,
    })
    .from(colonies)
    .innerJoin(planets, eq(colonies.planetId, planets.id))
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(sectorFilter);

  const foreignColonyOwners = new Set<string>();
  for (const row of colonyRows) {
    if (row.systemIsHome && row.systemOwnerId && row.systemOwnerId !== viewerId) {
      continue;
    }
    if (row.ownerId !== viewerId) {
      foreignColonyOwners.add(row.ownerId);
    }
  }

  let masks = new Map<string, string>();
  if (foreignColonyOwners.size > 0) {
    const profiles = await db
      .select({
        id: users.id,
        tgUsername: users.tgUsername,
        tgFirstName: users.tgFirstName,
      })
      .from(users)
      .where(inArray(users.id, [...foreignColonyOwners]));

    masks = new Map(profiles.map((p) => [p.id, maskPublicAlias(p)]));
  }

  for (const row of colonyRows) {
    if (row.systemIsHome && row.systemOwnerId && row.systemOwnerId !== viewerId) {
      continue;
    }

    const worldPosition: WorldPosition = {
      x: numericToFloat(row.sx),
      y: numericToFloat(row.sy),
      z: numericToFloat(row.sz),
    };

    if (row.ownerId === viewerId) {
      entities.push({
        kind: 'own_colony',
        systemId: row.systemId,
        planetId: row.planetId,
        title: row.planetName,
        visibility: 'full',
        worldPosition,
      });
    } else {
      entities.push({
        kind: 'foreign_colony',
        systemId: row.systemId,
        planetId: row.planetId,
        title: 'Colony',
        subtitle: masks.get(row.ownerId),
        visibility: 'summary',
        worldPosition,
      });
    }
  }

  const shipRows = await db
    .select({
      shipId: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
      systemId: systems.id,
      planetId: planets.id,
      sx: systems.x,
      sy: systems.y,
      sz: systems.z,
      systemIsHome: systems.isHome,
      systemOwnerId: systems.ownerId,
    })
    .from(ships)
    .innerJoin(planets, eq(ships.locationPlanetId, planets.id))
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(and(sectorFilter, eq(ships.status, 'idle')));

  const foreignShipOwners = new Set<string>();
  for (const row of shipRows) {
    if (row.systemIsHome && row.systemOwnerId && row.systemOwnerId !== viewerId) {
      continue;
    }
    if (row.ownerId !== viewerId) {
      foreignShipOwners.add(row.ownerId);
    }
  }

  let shipMasks = new Map<string, string>();
  if (foreignShipOwners.size > 0) {
    const profiles = await db
      .select({
        id: users.id,
        tgUsername: users.tgUsername,
        tgFirstName: users.tgFirstName,
      })
      .from(users)
      .where(inArray(users.id, [...foreignShipOwners]));

    shipMasks = new Map(profiles.map((p) => [p.id, maskPublicAlias(p)]));
  }

  for (const row of shipRows) {
    if (row.systemIsHome && row.systemOwnerId && row.systemOwnerId !== viewerId) {
      continue;
    }

    const worldPosition: WorldPosition = {
      x: numericToFloat(row.sx),
      y: numericToFloat(row.sy),
      z: numericToFloat(row.sz),
    };

    const label = row.typeId.replace(/_/g, ' ');

    if (row.ownerId === viewerId) {
      entities.push({
        kind: 'own_ship',
        systemId: row.systemId,
        planetId: row.planetId,
        shipId: row.shipId,
        title: `Fleet · ${label}`,
        visibility: 'full',
        worldPosition,
      });
    } else {
      entities.push({
        kind: 'foreign_ship',
        systemId: row.systemId,
        planetId: row.planetId,
        shipId: row.shipId,
        title: `Ship · ${label}`,
        subtitle: shipMasks.get(row.ownerId),
        visibility: 'summary',
        worldPosition,
      });
    }
  }

  return {
    sector: [sectorX, sectorY, sectorZ],
    entities,
  };
}
