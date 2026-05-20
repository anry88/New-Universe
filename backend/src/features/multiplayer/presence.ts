import { db } from "../../db/index.js";
import {
  systems,
  planets,
  colonies,
  ships,
  users,
  discoveredSystems,
  expeditions,
} from "../../db/schema.js";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import { SHIP_STATUS_DESTROYED } from "@shared/types/combat.js";
import {
  SYSTEM_MAP_WORLD_UNITS_PER_LY,
  systemMapJumpGatePoint,
  type SystemMapPoint,
} from "@shared/format/systemMapLayout.js";
import type {
  PresenceEntityMotion,
  PresenceEntityRelation,
  PresenceEntityType,
  SectorPresencePayload,
  SectorPresenceEntity,
  SectorSystemAnchor,
  SectorSystemAnchorsPayload,
  SectorSystemAnchorTag,
  WorldPosition,
} from "@shared/types/multiplayer.js";

export type {
  PresenceEntityKind,
  PresenceEntityRelation,
  PresenceEntityType,
  SectorPresenceEntity,
  SectorPresencePayload,
  SectorSystemAnchor,
  SectorSystemAnchorsPayload,
  WorldPosition,
} from "@shared/types/multiplayer.js";

const RECENT_SYSTEM_LIMIT = 5;
const ANCHOR_TAG_ORDER: SectorSystemAnchorTag[] = [
  "home",
  "colony",
  "fleet",
  "recent",
  "discovered",
];
const SECTOR_WORLD_SIZE = 500;
const MOTION_SAMPLE_MS = 5_000;

interface GetSectorPresenceOptions {
  now?: Date;
}

interface MovingFleetProjection {
  systemId: string;
  planetId?: string;
  worldPosition: WorldPosition;
  logicalSector: [number, number, number];
  motion?: PresenceEntityMotion;
}

interface MovingFleetRow {
  shipId: string;
  ownerId: string;
  typeId: string;
  shipLastCombatTickAt: Date | null;
  expeditionStatus: string;
  targetPlanetId: string | null;
  targetX: string | null;
  targetY: string | null;
  targetZ: string | null;
  eta: Date;
  result: unknown;
  originSystemId: string;
  originSystemIsHome: boolean;
  originSystemOwnerId: string | null;
  originSectorX: number;
  originSectorY: number;
  originSectorZ: number;
  originWorldX: unknown;
  originWorldY: unknown;
  originWorldZ: unknown;
}

interface PresenceSystemPoint {
  id: string;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  worldPosition: WorldPosition;
  isHome: boolean;
  ownerId: string | null;
}

function numericToFloat(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number.parseFloat(v);
  return Number(v);
}

function maskPublicAlias(u: {
  tgUsername: string | null;
  tgFirstName: string | null;
}): string {
  if (u.tgUsername) return `@${u.tgUsername.slice(0, 12)}`;
  if (u.tgFirstName) return `${u.tgFirstName.slice(0, 1)}•••`;
  return "Player";
}

function toWorldPosition(row: {
  x: unknown;
  y: unknown;
  z: unknown;
}): WorldPosition {
  return {
    x: numericToFloat(row.x),
    y: numericToFloat(row.y),
    z: numericToFloat(row.z),
  };
}

function sectorFromWorldPosition(
  position: WorldPosition,
): [number, number, number] {
  return [
    Math.floor(position.x / SECTOR_WORLD_SIZE),
    Math.floor(position.y / SECTOR_WORLD_SIZE),
    Math.floor(position.z / SECTOR_WORLD_SIZE),
  ];
}

function sectorEquals(
  a: [number, number, number],
  sx: number,
  sy: number,
  sz: number,
): boolean {
  return a[0] === sx && a[1] === sy && a[2] === sz;
}

function pointFromUnknown(value: unknown): SystemMapPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function expeditionProgress(
  row: { result: unknown; eta: Date; expeditionStatus: string },
  now: Date,
): number | null {
  const result =
    row.result && typeof row.result === "object"
      ? (row.result as Record<string, unknown>)
      : null;
  if (!result) return null;

  const distance = Number(result.distance);
  const speed = Number(result.speed);
  const engineFactor = Number(result.engineFactor ?? 1);
  if (!Number.isFinite(distance) || !Number.isFinite(speed) || speed <= 0) {
    return null;
  }

  const durationMs = ((distance * 60) / speed) * engineFactor * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

  const startMs = row.eta.getTime() - durationMs;
  const rawProgress = (now.getTime() - startMs) / durationMs;
  return Math.max(0, Math.min(1, rawProgress));
}

function interpolateWorldPosition(
  start: WorldPosition,
  end: WorldPosition,
  progress: number,
): WorldPosition {
  const p = Math.max(0, Math.min(1, progress));
  return {
    x: start.x + (end.x - start.x) * p,
    y: start.y + (end.y - start.y) * p,
    z: start.z + (end.z - start.z) * p,
  };
}

function interpolateSystemPoint(
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

function systemPointToPresenceWorldPosition(
  system: PresenceSystemPoint,
  point: SystemMapPoint,
): WorldPosition {
  return {
    x: system.worldPosition.x + point.x / SYSTEM_MAP_WORLD_UNITS_PER_LY,
    y: system.worldPosition.y + point.y / SYSTEM_MAP_WORLD_UNITS_PER_LY,
    z: system.worldPosition.z,
  };
}

function destinationSystemIdFromResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const id = (result as Record<string, unknown>).destinationSystemId;
  return typeof id === "string" ? id : null;
}

function originSystemIdFromResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const id = (result as Record<string, unknown>).originSystemId;
  return typeof id === "string" ? id : null;
}

function projectionMotion(
  row: MovingFleetRow,
  originSystem: PresenceSystemPoint,
  destinationSystem: PresenceSystemPoint | null,
  now: Date,
  current: Omit<MovingFleetProjection, "motion">,
): PresenceEntityMotion | undefined {
  const next = movingFleetProjectionAt(
    row,
    originSystem,
    destinationSystem,
    new Date(now.getTime() + MOTION_SAMPLE_MS),
  );
  if (!next) return undefined;

  const dx = next.worldPosition.x - current.worldPosition.x;
  const dy = next.worldPosition.y - current.worldPosition.y;
  if (Math.hypot(dx, dy) < 0.01) return undefined;

  return {
    state: "moving",
    dx,
    dy,
    updatedAt: now.toISOString(),
  };
}

function movingFleetProjectionAt(
  row: MovingFleetRow,
  originSystem: PresenceSystemPoint,
  destinationSystem: PresenceSystemPoint | null,
  now: Date,
): Omit<MovingFleetProjection, "motion"> | null {
  const result =
    row.result && typeof row.result === "object"
      ? (row.result as Record<string, unknown>)
      : null;
  const progress = expeditionProgress(row, now);
  if (progress === null) return null;

  const legProgress =
    row.expeditionStatus === "returning" ? 1 - progress : progress;

  if (result?.routeMode === "jump_gate") {
    const destinationSystemId = destinationSystemIdFromResult(result);
    const originSystemId = originSystemIdFromResult(result);
    const originPoint = pointFromUnknown(result.originSystemPoint);
    const targetPoint = pointFromUnknown(result.targetSystemPoint);
    const gatePoint = systemMapJumpGatePoint();
    const distance = Number(result.distance);
    const travelled =
      Math.max(0, Math.min(1, progress)) *
      (Number.isFinite(distance) ? distance : 0);

    if (destinationSystem && destinationSystemId && targetPoint) {
      const targetLegDistance = Number(
        result.targetGateDistance ?? result.distance ?? 0,
      );
      const originLegDistance = Number(result.originGateDistance ?? 0);
      if (Number.isFinite(targetLegDistance) && targetLegDistance > 0) {
        const targetLegProgress =
          row.expeditionStatus === "returning"
            ? 1 - (travelled - originLegDistance) / targetLegDistance
            : (travelled - originLegDistance) / targetLegDistance;
        if (targetLegProgress >= 0 && targetLegProgress <= 1) {
          const start =
            originSystemId === destinationSystemId && originPoint
              ? originPoint
              : gatePoint;
          const point = interpolateSystemPoint(
            start,
            targetPoint,
            targetLegProgress,
          );
          return {
            systemId: destinationSystem.id,
            planetId: row.targetPlanetId ?? undefined,
            worldPosition: systemPointToPresenceWorldPosition(
              destinationSystem,
              point,
            ),
            logicalSector: [
              destinationSystem.sectorX,
              destinationSystem.sectorY,
              destinationSystem.sectorZ,
            ],
          };
        }
      }
    }

    if (originPoint) {
      const originLegDistance = Number(
        result.originGateDistance ?? result.distance ?? 0,
      );
      if (Number.isFinite(originLegDistance) && originLegDistance > 0) {
        const originLegProgress =
          row.expeditionStatus === "returning"
            ? 1 - travelled / originLegDistance
            : travelled / originLegDistance;
        if (originLegProgress >= 0 && originLegProgress <= 1) {
          const point = interpolateSystemPoint(
            originPoint,
            gatePoint,
            originLegProgress,
          );
          return {
            systemId: originSystem.id,
            worldPosition: systemPointToPresenceWorldPosition(
              originSystem,
              point,
            ),
            logicalSector: [
              originSystem.sectorX,
              originSystem.sectorY,
              originSystem.sectorZ,
            ],
          };
        }
      }
    }
  }

  const destinationWorld = destinationSystem?.worldPosition ?? {
    x:
      Number(row.targetX ?? row.originSectorX) * SECTOR_WORLD_SIZE +
      SECTOR_WORLD_SIZE / 2,
    y:
      Number(row.targetY ?? row.originSectorY) * SECTOR_WORLD_SIZE +
      SECTOR_WORLD_SIZE / 2,
    z:
      Number(row.targetZ ?? row.originSectorZ) * SECTOR_WORLD_SIZE +
      SECTOR_WORLD_SIZE / 2,
  };
  const worldPosition = interpolateWorldPosition(
    originSystem.worldPosition,
    destinationWorld,
    legProgress,
  );

  return {
    systemId: destinationSystem?.id ?? originSystem.id,
    planetId: row.targetPlanetId ?? undefined,
    worldPosition,
    logicalSector: sectorFromWorldPosition(worldPosition),
  };
}

function movingFleetProjection(
  row: MovingFleetRow,
  destinationSystemById: Map<string, PresenceSystemPoint>,
  now: Date,
): MovingFleetProjection | null {
  const originSystem: PresenceSystemPoint = {
    id: row.originSystemId,
    sectorX: row.originSectorX,
    sectorY: row.originSectorY,
    sectorZ: row.originSectorZ,
    worldPosition: toWorldPosition({
      x: row.originWorldX,
      y: row.originWorldY,
      z: row.originWorldZ,
    }),
    isHome: row.originSystemIsHome,
    ownerId: row.originSystemOwnerId,
  };
  const destinationId = destinationSystemIdFromResult(row.result);
  const destinationSystem = destinationId
    ? (destinationSystemById.get(destinationId) ?? null)
    : null;
  const current = movingFleetProjectionAt(
    row,
    originSystem,
    destinationSystem,
    now,
  );
  if (!current) return null;
  return {
    ...current,
    motion: projectionMotion(
      row,
      originSystem,
      destinationSystem,
      now,
      current,
    ),
  };
}

function isProtectedForeignHomeSystem(
  system: { isHome: boolean; ownerId: string | null },
  viewerId: string,
): boolean {
  return Boolean(
    system.isHome && system.ownerId && system.ownerId !== viewerId,
  );
}

function presenceMeta(
  entityType: PresenceEntityType,
  relation: PresenceEntityRelation,
) {
  return { entityType, relation };
}

async function loadPublicMasks(
  ownerIds: Set<string>,
): Promise<Map<string, string>> {
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

function maxDate(
  a: Date | undefined,
  b: Date | null | undefined,
): Date | undefined {
  if (!b) return a;
  if (!a || b.getTime() > a.getTime()) return b;
  return a;
}

type AnchorAccumulator = Omit<
  SectorSystemAnchor,
  "tags" | "discoveredAt" | "lastActivityAt"
> & {
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
    renameCount?: number;
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
    renameCount: row.renameCount ?? 0,
    ownColonyCount: 0,
    foreignColonyCount: 0,
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
    renameCount: anchor.renameCount,
    ownColonyCount: anchor.ownColonyCount,
    foreignColonyCount: anchor.foreignColonyCount,
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
  options: GetSectorPresenceOptions = {},
): Promise<SectorPresencePayload> {
  const now = options.now ?? new Date();
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
        kind: "own_home_system",
        ...presenceMeta("home", "self"),
        systemId: sys.id,
        title: sys.name,
        visibility: "full",
        worldPosition,
      });
      continue;
    }

    if (!sys.ownerId) {
      entities.push({
        kind: "neutral_system",
        ...presenceMeta("public_sector", "public"),
        systemId: sys.id,
        title: sys.name,
        visibility: "summary",
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
    if (
      isProtectedForeignHomeSystem(
        { isHome: row.systemIsHome, ownerId: row.systemOwnerId },
        viewerId,
      )
    ) {
      continue;
    }
    if (row.ownerId !== viewerId) {
      foreignColonyOwners.add(row.ownerId);
    }
  }

  const masks = await loadPublicMasks(foreignColonyOwners);

  for (const row of colonyRows) {
    if (
      isProtectedForeignHomeSystem(
        { isHome: row.systemIsHome, ownerId: row.systemOwnerId },
        viewerId,
      )
    ) {
      continue;
    }

    const worldPosition: WorldPosition = toWorldPosition({
      x: row.sx,
      y: row.sy,
      z: row.sz,
    });

    if (row.ownerId === viewerId) {
      entities.push({
        kind: "own_colony",
        ...presenceMeta("colony", "self"),
        systemId: row.systemId,
        planetId: row.planetId,
        title: row.planetName,
        visibility: "full",
        worldPosition,
      });
    } else {
      entities.push({
        kind: "foreign_colony",
        ...presenceMeta("colony", "foreign"),
        systemId: row.systemId,
        planetId: row.planetId,
        title: "Colony",
        subtitle: masks.get(row.ownerId),
        visibility: "summary",
        worldPosition,
      });
    }
  }

  const dockedShipRows = await db
    .select({
      shipId: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
      lastCombatTickAt: ships.lastCombatTickAt,
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
    .where(and(sectorFilter, eq(ships.status, "idle")));

  const stationedShipRows = await db
    .select({
      shipId: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
      lastCombatTickAt: ships.lastCombatTickAt,
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
    .innerJoin(
      systems,
      sql`${expeditions.result} ->> 'destinationSystemId' = ${systems.id}::text`,
    )
    .where(
      and(
        sectorFilter,
        eq(expeditions.status, "stationed"),
        ne(ships.status, SHIP_STATUS_DESTROYED),
      ),
    );

  const movingShipRows = await db
    .select({
      shipId: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
      shipLastCombatTickAt: ships.lastCombatTickAt,
      expeditionStatus: expeditions.status,
      targetPlanetId: expeditions.targetPlanetId,
      targetX: expeditions.targetX,
      targetY: expeditions.targetY,
      targetZ: expeditions.targetZ,
      eta: expeditions.eta,
      result: expeditions.result,
      originSystemId: systems.id,
      originSystemIsHome: systems.isHome,
      originSystemOwnerId: systems.ownerId,
      originSectorX: systems.sectorX,
      originSectorY: systems.sectorY,
      originSectorZ: systems.sectorZ,
      originWorldX: systems.x,
      originWorldY: systems.y,
      originWorldZ: systems.z,
    })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .innerJoin(planets, eq(planets.id, expeditions.originPlanetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(
      and(
        inArray(expeditions.status, ["in_flight", "returning"]),
        ne(ships.status, SHIP_STATUS_DESTROYED),
        sql`(
          (${systems.sectorX} = ${sectorX} and ${systems.sectorY} = ${sectorY} and ${systems.sectorZ} = ${sectorZ})
          or (${expeditions.targetX} = ${String(sectorX)} and ${expeditions.targetY} = ${String(sectorY)} and ${expeditions.targetZ} = ${String(sectorZ)})
        )`,
      ),
    );

  const destinationSystemIds = new Set<string>();
  for (const row of movingShipRows) {
    const id = destinationSystemIdFromResult(row.result);
    if (id) destinationSystemIds.add(id);
  }
  const destinationSystemRows = destinationSystemIds.size
    ? await db
        .select({
          id: systems.id,
          sectorX: systems.sectorX,
          sectorY: systems.sectorY,
          sectorZ: systems.sectorZ,
          x: systems.x,
          y: systems.y,
          z: systems.z,
          isHome: systems.isHome,
          ownerId: systems.ownerId,
        })
        .from(systems)
        .where(inArray(systems.id, [...destinationSystemIds]))
    : [];
  const destinationSystemById = new Map<string, PresenceSystemPoint>(
    destinationSystemRows.map((row) => [
      row.id,
      {
        id: row.id,
        sectorX: row.sectorX,
        sectorY: row.sectorY,
        sectorZ: row.sectorZ,
        worldPosition: toWorldPosition(row),
        isHome: row.isHome,
        ownerId: row.ownerId,
      },
    ]),
  );

  const movingShipProjections: Array<{
    row: (typeof movingShipRows)[number];
    projection: MovingFleetProjection;
  }> = [];
  for (const row of movingShipRows) {
    const projection = movingFleetProjection(row, destinationSystemById, now);
    if (!projection) continue;
    if (!sectorEquals(projection.logicalSector, sectorX, sectorY, sectorZ))
      continue;
    movingShipProjections.push({ row, projection });
  }

  const shipRows = [...dockedShipRows, ...stationedShipRows];

  const foreignShipOwners = new Set<string>();
  for (const row of shipRows) {
    if (
      isProtectedForeignHomeSystem(
        { isHome: row.systemIsHome, ownerId: row.systemOwnerId },
        viewerId,
      )
    ) {
      continue;
    }
    if (row.ownerId !== viewerId) {
      foreignShipOwners.add(row.ownerId);
    }
  }
  for (const { row, projection } of movingShipProjections) {
    const destinationSystem = destinationSystemIdFromResult(row.result)
      ? destinationSystemById.get(destinationSystemIdFromResult(row.result)!)
      : null;
    const protectedSystem =
      projection.systemId === row.originSystemId
        ? { isHome: row.originSystemIsHome, ownerId: row.originSystemOwnerId }
        : destinationSystem
          ? {
              isHome: destinationSystem.isHome,
              ownerId: destinationSystem.ownerId,
            }
          : { isHome: false, ownerId: null };
    if (isProtectedForeignHomeSystem(protectedSystem, viewerId)) {
      continue;
    }
    if (row.ownerId !== viewerId) {
      foreignShipOwners.add(row.ownerId);
    }
  }

  const shipMasks = await loadPublicMasks(foreignShipOwners);

  for (const row of shipRows) {
    if (
      isProtectedForeignHomeSystem(
        { isHome: row.systemIsHome, ownerId: row.systemOwnerId },
        viewerId,
      )
    ) {
      continue;
    }

    const worldPosition: WorldPosition = toWorldPosition({
      x: row.sx,
      y: row.sy,
      z: row.sz,
    });

    const label = row.typeId.replace(/_/g, " ");

    if (row.ownerId === viewerId) {
      entities.push({
        kind: "own_ship",
        ...presenceMeta("fleet", "self"),
        systemId: row.systemId,
        planetId: row.planetId ?? undefined,
        shipId: row.shipId,
        title: `Fleet · ${label}`,
        visibility: "full",
        worldPosition,
        lastCombatTickAt: isoOrUndefined(row.lastCombatTickAt) ?? null,
      });
    } else {
      entities.push({
        kind: "foreign_ship",
        ...presenceMeta("fleet", "foreign"),
        systemId: row.systemId,
        planetId: row.planetId ?? undefined,
        shipId: row.shipId,
        title: `Ship · ${label}`,
        subtitle: shipMasks.get(row.ownerId),
        visibility: "summary",
        worldPosition,
        lastCombatTickAt: isoOrUndefined(row.lastCombatTickAt) ?? null,
      });
    }
  }

  for (const { row, projection } of movingShipProjections) {
    const destinationSystem = destinationSystemIdFromResult(row.result)
      ? destinationSystemById.get(destinationSystemIdFromResult(row.result)!)
      : null;
    const protectedSystem =
      projection.systemId === row.originSystemId
        ? { isHome: row.originSystemIsHome, ownerId: row.originSystemOwnerId }
        : destinationSystem
          ? {
              isHome: destinationSystem.isHome,
              ownerId: destinationSystem.ownerId,
            }
          : { isHome: false, ownerId: null };
    if (isProtectedForeignHomeSystem(protectedSystem, viewerId)) {
      continue;
    }

    const label = row.typeId.replace(/_/g, " ");
    if (row.ownerId === viewerId) {
      entities.push({
        kind: "own_ship",
        ...presenceMeta("fleet", "self"),
        systemId: projection.systemId,
        planetId: projection.planetId,
        shipId: row.shipId,
        title: `Fleet · ${label}`,
        visibility: "full",
        worldPosition: projection.worldPosition,
        motion: projection.motion,
        lastCombatTickAt: isoOrUndefined(row.shipLastCombatTickAt) ?? null,
      });
    } else {
      entities.push({
        kind: "foreign_ship",
        ...presenceMeta("fleet", "foreign"),
        systemId: projection.systemId,
        planetId: projection.planetId,
        shipId: row.shipId,
        title: `Ship · ${label}`,
        subtitle: shipMasks.get(row.ownerId),
        visibility: "summary",
        worldPosition: projection.worldPosition,
        motion: projection.motion,
        lastCombatTickAt: isoOrUndefined(row.shipLastCombatTickAt) ?? null,
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
export async function getSectorSystemAnchors(
  viewerId: string,
): Promise<SectorSystemAnchorsPayload> {
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
      renameCount: systems.renameCount,
    })
    .from(systems)
    .where(and(eq(systems.ownerId, viewerId), eq(systems.isHome, true)));

  for (const row of homeRows) {
    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add("home");
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
      renameCount: systems.renameCount,
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
    anchor.tags.add("discovered");
    if (recentDiscoveredIds.has(row.systemId)) {
      anchor.tags.add("recent");
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
      renameCount: systems.renameCount,
      foundedAt: colonies.foundedAt,
    })
    .from(colonies)
    .innerJoin(planets, eq(colonies.planetId, planets.id))
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(and(eq(colonies.ownerId, viewerId), eq(colonies.status, "active")));

  for (const row of colonyRows) {
    if (isProtectedForeignHomeSystem(row, viewerId)) {
      continue;
    }

    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add("colony");
    anchor.colonyCount += 1;
    anchor.ownColonyCount += 1;
    anchor.lastActivityAt = maxDate(anchor.lastActivityAt, row.foundedAt);
  }

  // Foreign colonies in any system that the viewer currently anchors block
  // the rename action. Loaded only for anchored systems so we don't leak
  // foreign colony presence in unrelated sectors.
  if (anchors.size > 0) {
    const anchoredSystemIds = [...anchors.keys()];
    const foreignColonyRows = await db
      .select({
        systemId: planets.systemId,
        count: sql<number>`count(*)::int`,
      })
      .from(colonies)
      .innerJoin(planets, eq(colonies.planetId, planets.id))
      .where(
        and(
          inArray(planets.systemId, anchoredSystemIds),
          ne(colonies.ownerId, viewerId),
          eq(colonies.status, "active"),
        ),
      )
      .groupBy(planets.systemId);

    for (const row of foreignColonyRows) {
      const anchor = anchors.get(row.systemId);
      if (anchor) {
        anchor.foreignColonyCount += Number(row.count);
      }
    }
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
      renameCount: systems.renameCount,
    })
    .from(ships)
    .innerJoin(planets, eq(ships.locationPlanetId, planets.id))
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(
      and(eq(ships.ownerId, viewerId), ne(ships.status, SHIP_STATUS_DESTROYED)),
    );

  for (const row of shipRows) {
    if (isProtectedForeignHomeSystem(row, viewerId)) {
      continue;
    }

    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add("fleet");
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
      renameCount: systems.renameCount,
      stationedAt: expeditions.eta,
    })
    .from(expeditions)
    .innerJoin(ships, eq(ships.id, expeditions.shipId))
    .innerJoin(
      systems,
      sql`${expeditions.result} ->> 'destinationSystemId' = ${systems.id}::text`,
    )
    .where(
      and(
        eq(ships.ownerId, viewerId),
        eq(expeditions.status, "stationed"),
        ne(ships.status, SHIP_STATUS_DESTROYED),
      ),
    );

  for (const row of stationedRows) {
    if (isProtectedForeignHomeSystem(row, viewerId)) {
      continue;
    }

    const anchor = ensureAnchor(anchors, row);
    anchor.tags.add("fleet");
    anchor.shipCount += 1;
    anchor.lastActivityAt = maxDate(anchor.lastActivityAt, row.stationedAt);
  }

  const serialized = [...anchors.values()].map(serializeAnchor).sort((a, b) => {
    if (a.tags.includes("home") !== b.tags.includes("home")) {
      return a.tags.includes("home") ? -1 : 1;
    }
    const aAssetScore =
      Number(a.tags.includes("colony")) + Number(a.tags.includes("fleet"));
    const bAssetScore =
      Number(b.tags.includes("colony")) + Number(b.tags.includes("fleet"));
    if (aAssetScore !== bAssetScore) return bAssetScore - aAssetScore;

    const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    if (aTime !== bTime) return bTime - aTime;

    return a.title.localeCompare(b.title);
  });

  return { systems: serialized };
}
