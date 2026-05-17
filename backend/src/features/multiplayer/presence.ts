import { db } from '../../db/index.js';
import { systems, planets, colonies, ships, users, discoveredSystems, expeditions } from '../../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type {
  PresenceEntityRelation,
  PresenceEntityType,
  SectorPresencePayload,
  SectorPresenceEntity,
  SectorSystemAnchor,
  SectorSystemAnchorsPayload,
  SectorSystemAnchorTag,
  WorldPosition,
} from '@shared/types/multiplayer.js';

export type {
  PresenceEntityKind,
  PresenceEntityRelation,
  PresenceEntityType,
  SectorPresenceEntity,
  SectorPresencePayload,
  SectorSystemAnchor,
  SectorSystemAnchorsPayload,
  WorldPosition,
} from '@shared/types/multiplayer.js';

const RECENT_SYSTEM_LIMIT = 5;
const ANCHOR_TAG_ORDER: SectorSystemAnchorTag[] = ['home', 'colony', 'fleet', 'recent', 'discovered'];

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

function toWorldPosition(row: { x: unknown; y: unknown; z: unknown }): WorldPosition {
  return {
    x: numericToFloat(row.x),
    y: numericToFloat(row.y),
    z: numericToFloat(row.z),
  };
}

function isProtectedForeignHomeSystem(
  system: { isHome: boolean; ownerId: string | null },
  viewerId: string,
): boolean {
  return Boolean(system.isHome && system.ownerId && system.ownerId !== viewerId);
}

function presenceMeta(entityType: PresenceEntityType, relation: PresenceEntityRelation) {
  return { entityType, relation };
}

async function loadPublicMasks(ownerIds: Set<string>): Promise<Map<string, string>> {
  if (ownerIds.size === 0) return new Map();

  const profiles = await db
    .select({
      id: users.id,
      tgUsername: users.tgUsername,
      tgFirstName: users.tgFirstName,
    })
    .from(users)
    .where(inArray(users.id, [...ownerIds]));

  return new Map(profiles.map((p) => [p.id, maskPublicAlias(p)]));
}

function isoOrUndefined(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function maxDate(a: Date | undefined, b: Date | null | undefined): Date | undefined {
  if (!b) return a;
  if (!a || b.getTime() > a.getTime()) return b;
  return a;
}

type AnchorAccumulator = Omit<SectorSystemAnchor, 'tags' | 'discoveredAt' | 'lastActivityAt'> & {
  tags: Set<SectorSystemAnchorTag>;
  discoveredAt?: Date;
  lastActivityAt?: Date;
};

function ensureAnchor(
  anchors: Map<string, AnchorAccumulator>,
  row: {
    systemId: string;
    title: string;
    sectorX: number;
    sectorY: number;
    sectorZ: number;
    x: unknown;
    y: unknown;
    z: unknown;
  },
): AnchorAccumulator {
  const existing = anchors.get(row.systemId);
  if (existing) return existing;

  const anchor: AnchorAccumulator = {
    systemId: row.systemId,
    title: row.title,
    sector: [row.sectorX, row.sectorY, row.sectorZ],
    worldPosition: toWorldPosition(row),
    tags: new Set(),
    colonyCount: 0,
    shipCount: 0,
  };
  anchors.set(row.systemId, anchor);
  return anchor;
}

function serializeAnchor(anchor: AnchorAccumulator): SectorSystemAnchor {
  const tags = ANCHOR_TAG_ORDER.filter((tag) => anchor.tags.has(tag));
  return {
    systemId: anchor.systemId,
    title: anchor.title,
    sector: anchor.sector,
    worldPosition: anchor.worldPosition,
    tags,
    discoveredAt: isoOrUndefined(anchor.discoveredAt),
    lastActivityAt: isoOrUndefined(anchor.lastActivityAt),
    colonyCount: anchor.colonyCount,
    shipCount: anchor.shipCount,
  };
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
    if (isProtectedForeignHomeSystem(sys, viewerId)) {
      continue;
    }

    const worldPosition = toWorldPosition(sys);

    if (sys.ownerId === viewerId && sys.isHome) {
      entities.push({
        kind: 'own_home_system',
        ...presenceMeta('home', 'self'),
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
        ...presenceMeta('public_sector', 'public'),
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
    if (isProtectedForeignHomeSystem({ isHome: row.systemIsHome, ownerId: row.systemOwnerId }, viewerId)) {
      continue;
    }
    if (row.ownerId !== viewerId) {
      foreignColonyOwners.add(row.ownerId);
    }
  }

  const masks = await loadPublicMasks(foreignColonyOwners);

  for (const row of colonyRows) {
    if (isProtectedForeignHomeSystem({ isHome: row.systemIsHome, ownerId: row.systemOwnerId }, viewerId)) {
      continue;
    }

    const worldPosition: WorldPosition = toWorldPosition({ x: row.sx, y: row.sy, z: row.sz });

    if (row.ownerId === viewerId) {
      entities.push({
        kind: 'own_colony',
        ...presenceMeta('colony', 'self'),
        systemId: row.systemId,
        planetId: row.planetId,
        title: row.planetName,
        visibility: 'full',
        worldPosition,
      });
    } else {
      entities.push({
        kind: 'foreign_colony',
        ...presenceMeta('colony', 'foreign'),
        systemId: row.systemId,
        planetId: row.planetId,
        title: 'Colony',
        subtitle: masks.get(row.ownerId),
        visibility: 'summary',
        worldPosition,
      });
    }
  }

  const dockedShipRows = await db
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

  const stationedShipRows = await db
    .select({
      shipId: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
      systemId: systems.id,
      planetId: sql<string | null>`NULL`,
      sx: systems.x,
      sy: systems.y,
      sz: systems.z,
      systemIsHome: systems.isHome,
      systemOwnerId: systems.ownerId,
    })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .innerJoin(systems, sql`${expeditions.result} ->> 'destinationSystemId' = ${systems.id}::text`)
    .where(and(sectorFilter, eq(expeditions.status, 'stationed')));

  const shipRows = [...dockedShipRows, ...stationedShipRows];

  const foreignShipOwners = new Set<string>();
  for (const row of shipRows) {
    if (isProtectedForeignHomeSystem({ isHome: row.systemIsHome, ownerId: row.systemOwnerId }, viewerId)) {
      continue;
    }
    if (row.ownerId !== viewerId) {
      foreignShipOwners.add(row.ownerId);
    }
  }

  const shipMasks = await loadPublicMasks(foreignShipOwners);

  for (const row of shipRows) {
    if (isProtectedForeignHomeSystem({ isHome: row.systemIsHome, ownerId: row.systemOwnerId }, viewerId)) {
      continue;
    }

    const worldPosition: WorldPosition = toWorldPosition({ x: row.sx, y: row.sy, z: row.sz });

    const label = row.typeId.replace(/_/g, ' ');

    if (row.ownerId === viewerId) {
      entities.push({
        kind: 'own_ship',
        ...presenceMeta('fleet', 'self'),
        systemId: row.systemId,
        planetId: row.planetId ?? undefined,
        shipId: row.shipId,
        title: `Fleet · ${label}`,
        visibility: 'full',
        worldPosition,
      });
    } else {
      entities.push({
        kind: 'foreign_ship',
        ...presenceMeta('fleet', 'foreign'),
        systemId: row.systemId,
        planetId: row.planetId ?? undefined,
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

/**
 * Returns systems that can anchor the sector map selector: the viewer's home,
 * discovered public systems, and systems containing the viewer's colonies or
 * docked fleets. Foreign home systems are filtered even if a stale discovery
 * row exists.
 */
export async function getSectorSystemAnchors(viewerId: string): Promise<SectorSystemAnchorsPayload> {
  const anchors = new Map<string, AnchorAccumulator>();

  const homeRows = await db
    .select({
      systemId: systems.id,
      title: systems.name,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      x: systems.x,
      y: systems.y,
      z: systems.z,
    })
    .from(systems)
    .where(and(eq(systems.ownerId, viewerId), eq(systems.isHome, true)));

  for (const row of homeRows) {
    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add('home');
  }

  const discoveredRows = await db
    .select({
      systemId: systems.id,
      ownerId: systems.ownerId,
      isHome: systems.isHome,
      title: systems.name,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      x: systems.x,
      y: systems.y,
      z: systems.z,
      discoveredAt: discoveredSystems.discoveredAt,
    })
    .from(discoveredSystems)
    .innerJoin(systems, eq(discoveredSystems.systemId, systems.id))
    .where(eq(discoveredSystems.userId, viewerId));

  const visibleDiscoveredRows = discoveredRows.filter(
    (row) => !isProtectedForeignHomeSystem(row, viewerId),
  );
  const recentDiscoveredIds = new Set(
    [...visibleDiscoveredRows]
      .sort((a, b) => b.discoveredAt.getTime() - a.discoveredAt.getTime())
      .slice(0, RECENT_SYSTEM_LIMIT)
      .map((row) => row.systemId),
  );

  for (const row of visibleDiscoveredRows) {
    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add('discovered');
    if (recentDiscoveredIds.has(row.systemId)) {
      anchor.tags.add('recent');
    }
    anchor.discoveredAt = maxDate(anchor.discoveredAt, row.discoveredAt);
    anchor.lastActivityAt = maxDate(anchor.lastActivityAt, row.discoveredAt);
  }

  const colonyRows = await db
    .select({
      colonyId: colonies.id,
      systemId: systems.id,
      ownerId: systems.ownerId,
      isHome: systems.isHome,
      title: systems.name,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      x: systems.x,
      y: systems.y,
      z: systems.z,
      foundedAt: colonies.foundedAt,
    })
    .from(colonies)
    .innerJoin(planets, eq(colonies.planetId, planets.id))
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(and(eq(colonies.ownerId, viewerId), eq(colonies.status, 'active')));

  for (const row of colonyRows) {
    if (isProtectedForeignHomeSystem(row, viewerId)) {
      continue;
    }

    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add('colony');
    anchor.colonyCount += 1;
    anchor.lastActivityAt = maxDate(anchor.lastActivityAt, row.foundedAt);
  }

  const shipRows = await db
    .select({
      shipId: ships.id,
      systemId: systems.id,
      ownerId: systems.ownerId,
      isHome: systems.isHome,
      title: systems.name,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      x: systems.x,
      y: systems.y,
      z: systems.z,
    })
    .from(ships)
    .innerJoin(planets, eq(ships.locationPlanetId, planets.id))
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(eq(ships.ownerId, viewerId));

  for (const row of shipRows) {
    if (isProtectedForeignHomeSystem(row, viewerId)) {
      continue;
    }

    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add('fleet');
    anchor.shipCount += 1;
  }

  const stationedRows = await db
    .select({
      shipId: ships.id,
      systemId: systems.id,
      ownerId: systems.ownerId,
      isHome: systems.isHome,
      title: systems.name,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      x: systems.x,
      y: systems.y,
      z: systems.z,
      stationedAt: expeditions.eta,
    })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .innerJoin(systems, sql`${expeditions.result} ->> 'destinationSystemId' = ${systems.id}::text`)
    .where(and(eq(ships.ownerId, viewerId), eq(expeditions.status, 'stationed')));

  for (const row of stationedRows) {
    if (isProtectedForeignHomeSystem(row, viewerId)) {
      continue;
    }

    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add('fleet');
    anchor.shipCount += 1;
    anchor.lastActivityAt = maxDate(anchor.lastActivityAt, row.stationedAt);
  }

  const serialized = [...anchors.values()]
    .map(serializeAnchor)
    .sort((a, b) => {
      if (a.tags.includes('home') !== b.tags.includes('home')) {
        return a.tags.includes('home') ? -1 : 1;
      }
      const aAssetScore = Number(a.tags.includes('colony')) + Number(a.tags.includes('fleet'));
      const bAssetScore = Number(b.tags.includes('colony')) + Number(b.tags.includes('fleet'));
      if (aAssetScore !== bAssetScore) return bAssetScore - aAssetScore;

      const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      if (aTime !== bTime) return bTime - aTime;

      return a.title.localeCompare(b.title);
    });

  return { systems: serialized };
}
