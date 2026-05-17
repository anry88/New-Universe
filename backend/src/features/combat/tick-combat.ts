/**
 * Server-authoritative combat tick for ship-vs-ship engagements.
 *
 * Loads the current snapshot of alive ships (with positions either from their
 * docked planet/system or from an in-flight expedition), runs the pure engine
 * in `engine.ts` to figure out who is shooting whom this tick, then applies
 * elapsed-time damage idempotently using each defender's `lastCombatTickAt`.
 *
 * Idempotency: running this tick twice in quick succession produces near-zero
 * additional damage on the second call (dt ≈ 0 against the just-stamped
 * `lastCombatTickAt`). `COMBAT_TICK_MAX_DT_SEC` caps burst damage when a
 * defender re-enters range after a long gap.
 *
 * Used both by the periodic combat worker (`workers/tick-combat.ts`) and by
 * the per-user online sync (`features/me/online-sync.ts`).
 */
import { and, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import {
  ships,
  shipTypes,
  planets,
  systems,
  expeditions,
  notifications,
  buildings,
  buildingTypes,
  colonies,
} from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import {
  calculateExpeditionPosition,
  EXPEDITION_STATUS_STATIONED,
} from '../../workers/tick-expeditions.js';
import { SHIP_STATUS_DESTROYED, type CombatStats } from '@shared/types/combat.js';
import { COMMAND_CENTER_TYPE_ID } from '@shared/config/buildingUpgradeEconomy.js';
import {
  type BomberActor,
  type BuildingTarget,
  type CombatActor,
  type AttackerHit,
  computeTickDamage,
  resolveAttackerHits,
  resolveBomberHits,
  sumDpsPerBuilding,
} from './engine.js';
import { resolveShieldedDamage } from './shields.js';

export interface ProcessDueCombatOptions {
  /** When set, the tick still runs globally; userId only scopes notifications. */
  userId?: string;
  skipNotifications?: boolean;
  /** Override the wall clock — used by tests to control elapsed-time math. */
  now?: Date;
}

interface ShipRow {
  id: string;
  ownerId: string;
  typeId: string;
  status: string;
  hp: number;
  locationPlanetId: string | null;
  combatStats: CombatStats;
  lastCombatTickAt: Date | null;
  destroyedAt: Date | null;
  typeArmor: number;
  typeCombatStats: CombatStats;
  hostSystem: {
    id: string;
    name: string | null;
    isHome: boolean;
    ownerId: string | null;
    sectorX: number;
    sectorY: number;
  } | null;
}

interface ExpeditionRow {
  id: string;
  shipId: string;
  status: string;
  targetX: string | null;
  targetY: string | null;
  eta: Date;
  result: unknown;
  originSectorX: number;
  originSectorY: number;
  originSectorZ: number;
}

export async function processDueCombat(
  options: ProcessDueCombatOptions = {},
): Promise<{
  defendersDamaged: number;
  destroyed: string[];
  shieldsDamaged: number;
  shieldsBroken: string[];
  buildingsDamaged: number;
  buildingsDestroyed: string[];
  coloniesAbandoned: string[];
}> {
  const now = options.now ?? new Date();

  const aliveShips = await loadAliveShips(defaultDb);
  if (aliveShips.length === 0) {
    return {
      defendersDamaged: 0,
      destroyed: [],
      shieldsDamaged: 0,
      shieldsBroken: [],
      buildingsDamaged: 0,
      buildingsDestroyed: [],
      coloniesAbandoned: [],
    };
  }

  const inFlightShipIds = aliveShips
    .filter((s) => s.status === 'moving')
    .map((s) => s.id);
  const inFlightExpeditions = inFlightShipIds.length === 0
    ? []
    : await loadInFlightExpeditions(defaultDb, inFlightShipIds);
  const expeditionByShipId = new Map<string, ExpeditionRow>();
  for (const exp of inFlightExpeditions) {
    expeditionByShipId.set(exp.shipId, exp);
  }

  const actors: CombatActor[] = aliveShips.map((ship) => {
    const position = computePosition(ship, expeditionByShipId, now);
    const mergedStats = mergeCombatStats(ship.typeCombatStats, ship.combatStats);
    return {
      id: ship.id,
      ownerId: ship.ownerId,
      status: ship.status,
      hp: ship.hp,
      combatStats: mergedStats,
      defenderArmor: Math.max(0, mergedStats.armor ?? ship.typeArmor ?? 0),
      position,
      hostSystem: ship.hostSystem,
      lastCombatTickAtMs: ship.lastCombatTickAt ? ship.lastCombatTickAt.getTime() : null,
    };
  });

  const hits = resolveAttackerHits(actors);
  const shieldResult = resolveShieldedDamage(actors, hits, now.getTime());
  const damageByDefender = shieldResult.directDamageByDefender;

  const bombingResult = await runBombingPass(aliveShips, now, options);

  if (
    damageByDefender.size === 0 &&
    shieldResult.touchedDefenderIds.size === 0 &&
    shieldResult.shieldUpdates.size === 0
  ) {
    return {
      defendersDamaged: 0,
      destroyed: [],
      shieldsDamaged: 0,
      shieldsBroken: [],
      ...bombingResult,
    };
  }

  const actorById = new Map(actors.map((a) => [a.id, a]));
  const shipRowById = new Map(aliveShips.map((ship) => [ship.id, ship]));
  const destroyed: string[] = [];
  const updates: Array<{
    shipId: string;
    ownerId: string;
    newHp: number;
    destroyed: boolean;
    typeId: string;
  }> = [];

  for (const [defenderId, damage] of damageByDefender) {
    const defender = actorById.get(defenderId);
    if (!defender) continue;
    const damageApplied = Math.max(0, Math.round(damage));
    const newHp = Math.max(0, defender.hp - damageApplied);
    const wasFirstTouch = defender.lastCombatTickAtMs == null;
    const shipRow = aliveShips.find((s) => s.id === defenderId)!;

    if (damageApplied <= 0 && !wasFirstTouch && newHp === defender.hp) {
      continue;
    }

    updates.push({
      shipId: defenderId,
      ownerId: defender.ownerId,
      newHp,
      destroyed: newHp === 0,
      typeId: shipRow.typeId,
    });
    if (newHp === 0) destroyed.push(defenderId);
  }

  const touchedOnlyIds = Array.from(shieldResult.touchedDefenderIds).filter((id) => {
    const actor = actorById.get(id);
    const updated = updates.some((u) => u.shipId === id);
    return actor && !updated;
  });

  if (
    updates.length === 0 &&
    touchedOnlyIds.length === 0 &&
    shieldResult.shieldUpdates.size === 0
  ) {
    return {
      defendersDamaged: 0,
      destroyed: [],
      shieldsDamaged: shieldResult.shieldsDamaged.size,
      shieldsBroken: Array.from(shieldResult.shieldsBroken),
      ...bombingResult,
    };
  }

  await defaultDb.transaction(async (tx) => {
    if (!options.skipNotifications) {
      await insertCombatStartedNotifications(tx, {
        hits,
        actorById,
        shipRowById,
        now,
      });
    }

    for (const [shipId, shieldHooks] of shieldResult.shieldUpdates) {
      const actor = actorById.get(shipId);
      if (!actor) continue;
      await tx
        .update(ships)
        .set({
          combatStats: {
            ...actor.combatStats,
            shields: shieldHooks,
          },
        })
        .where(eq(ships.id, shipId));
    }

    for (const upd of updates) {
      if (upd.destroyed) {
        await tx
          .update(ships)
          .set({
            hp: 0,
            status: SHIP_STATUS_DESTROYED,
            destroyedAt: now,
            lastCombatTickAt: now,
          })
          .where(eq(ships.id, upd.shipId));
        await tx.delete(expeditions).where(eq(expeditions.shipId, upd.shipId));
      } else {
        await tx
          .update(ships)
          .set({ hp: upd.newHp, lastCombatTickAt: now })
          .where(eq(ships.id, upd.shipId));
      }
    }

    // Stamp shielded defenders too, so repeated ticks at the same instant do
    // not reapply the same incoming damage to their covering shield.
    if (touchedOnlyIds.length > 0) {
      await tx
        .update(ships)
        .set({ lastCombatTickAt: now })
        .where(inArray(ships.id, touchedOnlyIds));
    }

    if (!options.skipNotifications) {
      const notifs = updates
        .filter((u) => u.destroyed)
        .map((u) => ({
          userId: u.ownerId,
          type: 'ship_destroyed',
          payload: { shipId: u.shipId, typeId: u.typeId, destroyedAt: now.toISOString() },
        }));
      if (notifs.length > 0) {
        await tx.insert(notifications).values(notifs);
      }
    }
  });

  if (destroyed.length > 0) {
    logger.info({ destroyed }, 'Combat tick: ships destroyed');
  }

  return {
    defendersDamaged: updates.length,
    destroyed,
    shieldsDamaged: shieldResult.shieldsDamaged.size,
    shieldsBroken: Array.from(shieldResult.shieldsBroken),
    ...bombingResult,
  };
}

async function insertCombatStartedNotifications(
  tx: any,
  input: {
    hits: AttackerHit[];
    actorById: Map<string, CombatActor>;
    shipRowById: Map<string, ShipRow>;
    now: Date;
  },
): Promise<void> {
  const cutoff = new Date(input.now.getTime() - 30 * 60 * 1000);
  const notificationsByOwnerAndSpace = new Map<
    string,
    {
      userId: string;
      combatSpaceKey: string;
      locationName: string;
      shipId: string;
      typeId: string;
    }
  >();

  for (const hit of input.hits) {
    const attacker = input.actorById.get(hit.attackerId);
    const defender = input.actorById.get(hit.defenderId);
    if (!attacker || !defender || defender.lastCombatTickAtMs != null) continue;

    const combatSpaceKey = combatSpaceKeyForActors(attacker, defender);
    const locationName = combatLocationName(attacker, defender);
    for (const participantId of [hit.attackerId, hit.defenderId]) {
      const ship = input.shipRowById.get(participantId);
      if (!ship) continue;
      const key = `${ship.ownerId}:${combatSpaceKey}`;
      if (notificationsByOwnerAndSpace.has(key)) continue;
      notificationsByOwnerAndSpace.set(key, {
        userId: ship.ownerId,
        combatSpaceKey,
        locationName,
        shipId: ship.id,
        typeId: ship.typeId,
      });
    }
  }

  for (const item of notificationsByOwnerAndSpace.values()) {
    const [recent] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, item.userId),
          eq(notifications.type, 'combat_started'),
          gte(notifications.createdAt, cutoff),
          sql`${notifications.payload} ->> 'combatSpaceKey' = ${item.combatSpaceKey}`,
        ),
      )
      .limit(1);
    if (recent) continue;

    await tx.insert(notifications).values({
      userId: item.userId,
      type: 'combat_started',
      payload: {
        combatSpaceKey: item.combatSpaceKey,
        locationName: item.locationName,
        shipId: item.shipId,
        typeId: item.typeId,
        startedAt: input.now.toISOString(),
      },
    });
  }
}

function combatSpaceKeyForActors(
  attacker: CombatActor,
  defender: CombatActor,
): string {
  const systemId = defender.hostSystem?.id ?? attacker.hostSystem?.id;
  if (systemId) return `system:${systemId}`;
  const point = defender.position ?? attacker.position;
  if (!point) return 'unknown';
  return `point:${Math.round(point.x)}:${Math.round(point.y)}`;
}

function combatLocationName(attacker: CombatActor, defender: CombatActor): string {
  return (
    (defender.hostSystem as any)?.name ??
    (attacker.hostSystem as any)?.name ??
    'your fleet'
  );
}

// ---------------------------------------------------------------------------
// Bomber → building pass.
// ---------------------------------------------------------------------------

interface BombingPassResult {
  buildingsDamaged: number;
  buildingsDestroyed: string[];
  coloniesAbandoned: string[];
}

interface AliveBuildingRow {
  id: string;
  planetId: string;
  planetName: string;
  systemId: string;
  typeId: string;
  level: number;
  hp: number;
  destroyedAt: Date | null;
  lastCombatTickAt: Date | null;
  combatStats: CombatStats;
  typeCombatStats: CombatStats;
  /** Owner of the colony that controls this building (null when planet is uncolonized). */
  colonyOwnerId: string | null;
  colonyId: string | null;
}

async function runBombingPass(
  aliveShips: ShipRow[],
  now: Date,
  options: ProcessDueCombatOptions,
): Promise<BombingPassResult> {
  // Build the bomber list from the same ship snapshot — bombers must be docked
  // at a host system (in-flight orbital strikes are out of scope for the MVP).
  const bombers: BomberActor[] = aliveShips
    .filter((s) => s.status !== 'moving' && s.hostSystem)
    .map((s) => {
      const mergedStats = mergeCombatStats(s.typeCombatStats, s.combatStats);
      return {
        id: s.id,
        ownerId: s.ownerId,
        status: s.status,
        hp: s.hp,
        combatStats: mergedStats,
        hostSystemId: s.hostSystem?.id ?? null,
      };
    })
    .filter((b) => b.combatStats.engagementRange === 'orbital' && b.hp > 0);

  if (bombers.length === 0) {
    return { buildingsDamaged: 0, buildingsDestroyed: [], coloniesAbandoned: [] };
  }

  const bomberSystemIds = Array.from(
    new Set(bombers.map((b) => b.hostSystemId).filter((id): id is string => !!id)),
  );

  const aliveBuildings = await loadAliveBuildingsForSystems(defaultDb, bomberSystemIds);
  if (aliveBuildings.length === 0) {
    return { buildingsDamaged: 0, buildingsDestroyed: [], coloniesAbandoned: [] };
  }

  const buildingsByPlanet = new Map<string, BuildingTarget[]>();
  for (const b of aliveBuildings) {
    const targetClass: 'building' | 'command_center' =
      b.typeId === COMMAND_CENTER_TYPE_ID ? 'command_center' : 'building';
    const armor = Math.max(0, b.combatStats.armor ?? b.typeCombatStats.armor ?? 0);
    const list = buildingsByPlanet.get(b.planetId) ?? [];
    list.push({
      id: b.id,
      planetId: b.planetId,
      systemId: b.systemId,
      ownerId: b.colonyOwnerId,
      targetClass,
      armor,
      hp: b.hp,
      destroyed: b.destroyedAt != null || b.hp <= 0,
      lastCombatTickAtMs: b.lastCombatTickAt ? b.lastCombatTickAt.getTime() : null,
    });
    buildingsByPlanet.set(b.planetId, list);
  }

  const hits = resolveBomberHits(bombers, buildingsByPlanet);
  const dpsByBuilding = sumDpsPerBuilding(hits);
  if (dpsByBuilding.size === 0) {
    return { buildingsDamaged: 0, buildingsDestroyed: [], coloniesAbandoned: [] };
  }

  const buildingById = new Map(aliveBuildings.map((b) => [b.id, b]));
  const buildingsDestroyed: string[] = [];
  const coloniesAbandoned: string[] = [];

  const updates: Array<{
    buildingId: string;
    planetId: string;
    ownerId: string | null;
    typeId: string;
    newHp: number;
    destroyed: boolean;
    isCommandCenter: boolean;
  }> = [];
  const firstTouchOnly: string[] = [];

  for (const [buildingId, totalDps] of dpsByBuilding) {
    const b = buildingById.get(buildingId);
    if (!b) continue;
    const lastMs = b.lastCombatTickAt ? b.lastCombatTickAt.getTime() : null;
    const damage = computeTickDamage({ lastCombatTickAtMs: lastMs }, totalDps, now.getTime());
    const damageApplied = Math.max(0, Math.round(damage));
    const newHp = Math.max(0, b.hp - damageApplied);
    if (damageApplied === 0) {
      if (lastMs == null) firstTouchOnly.push(buildingId);
      continue;
    }
    updates.push({
      buildingId,
      planetId: b.planetId,
      ownerId: b.colonyOwnerId,
      typeId: b.typeId,
      newHp,
      destroyed: newHp === 0,
      isCommandCenter: b.typeId === COMMAND_CENTER_TYPE_ID,
    });
  }

  if (updates.length === 0 && firstTouchOnly.length === 0) {
    return { buildingsDamaged: 0, buildingsDestroyed: [], coloniesAbandoned: [] };
  }

  // Planets whose Command Center is being killed this tick — they get a full
  // cascade cleanup (delete colony + every building on the planet). Done as a
  // separate pass so building-level damage updates inside the same transaction
  // do not collide with the cascading deletes.
  const planetsToWipe = new Set<string>();
  for (const upd of updates) {
    if (upd.destroyed && upd.isCommandCenter) {
      planetsToWipe.add(upd.planetId);
    }
  }

  await defaultDb.transaction(async (tx) => {
    if (firstTouchOnly.length > 0) {
      await tx
        .update(buildings)
        .set({ lastCombatTickAt: now })
        .where(inArray(buildings.id, firstTouchOnly));
    }

    for (const upd of updates) {
      if (planetsToWipe.has(upd.planetId)) continue; // handled below
      if (upd.destroyed) {
        await tx
          .update(buildings)
          .set({
            hp: 0,
            destroyedAt: now,
            lastCombatTickAt: now,
            queueAction: null,
            queueCompletesAt: null,
          })
          .where(eq(buildings.id, upd.buildingId));
        buildingsDestroyed.push(upd.buildingId);
      } else {
        await tx
          .update(buildings)
          .set({ hp: upd.newHp, lastCombatTickAt: now })
          .where(eq(buildings.id, upd.buildingId));
      }
    }

    for (const planetId of planetsToWipe) {
      const planetBuildings = aliveBuildings.filter((b) => b.planetId === planetId);
      const colonyOwnerId =
        planetBuildings.find((b) => b.colonyOwnerId != null)?.colonyOwnerId ?? null;
      const colonyId = planetBuildings.find((b) => b.colonyId != null)?.colonyId ?? null;

      // Delete EVERY row on the planet — including non-CC husks from previous
      // ticks that already had destroyedAt set, plus structures built between
      // ticks. The planet must be a clean slate before re-colonization.
      const planetWipeResult = await tx
        .delete(buildings)
        .where(eq(buildings.planetId, planetId))
        .returning({ id: buildings.id });
      for (const row of planetWipeResult) {
        if (!buildingsDestroyed.includes(row.id)) buildingsDestroyed.push(row.id);
      }
      if (colonyId) {
        await tx.delete(colonies).where(eq(colonies.id, colonyId));
        coloniesAbandoned.push(colonyId);

        if (!options.skipNotifications && colonyOwnerId) {
          await tx.insert(notifications).values({
            userId: colonyOwnerId,
            type: 'colony_destroyed',
            payload: {
              planetId,
              planetName: planetBuildings[0]?.planetName,
              colonyId,
              destroyedAt: now.toISOString(),
            },
          });
        }
      }
    }

    if (!options.skipNotifications) {
      const notifs = updates
        .filter((u) => u.destroyed && !u.isCommandCenter && u.ownerId)
        .map((u) => ({
          userId: u.ownerId!,
          type: 'building_destroyed',
          payload: {
            buildingId: u.buildingId,
            typeId: u.typeId,
            planetId: u.planetId,
            planetName: aliveBuildings.find((b) => b.id === u.buildingId)?.planetName,
            destroyedAt: now.toISOString(),
          },
        }));
      if (notifs.length > 0) {
        await tx.insert(notifications).values(notifs);
      }
    }
  });

  if (buildingsDestroyed.length > 0) {
    logger.info(
      { buildingsDestroyed, coloniesAbandoned },
      'Combat tick: buildings destroyed by orbital bombing',
    );
  }

  return {
    buildingsDamaged: updates.length,
    buildingsDestroyed,
    coloniesAbandoned,
  };
}

async function loadAliveBuildingsForSystems(
  database: typeof defaultDb,
  systemIds: string[],
): Promise<AliveBuildingRow[]> {
  if (systemIds.length === 0) return [];
  const rows = await database
    .select({
      id: buildings.id,
      planetId: buildings.planetId,
      typeId: buildings.typeId,
      level: buildings.level,
      hp: buildings.hp,
      destroyedAt: buildings.destroyedAt,
      lastCombatTickAt: buildings.lastCombatTickAt,
      planetSystemId: planets.systemId,
      planetName: planets.name,
      typeCombatStats: buildingTypes.combatStats,
      colonyOwnerId: colonies.ownerId,
      colonyId: colonies.id,
    })
    .from(buildings)
    .innerJoin(planets, eq(planets.id, buildings.planetId))
    .innerJoin(buildingTypes, eq(buildingTypes.id, buildings.typeId))
    .leftJoin(colonies, eq(colonies.planetId, buildings.planetId))
    .where(
      and(
        inArray(planets.systemId, systemIds),
        // Skip already-destroyed buildings; also skip those still under
        // initial construction (no level yet), since they have no defensible
        // structure to bomb.
        isNull(buildings.destroyedAt),
        sql`${buildings.hp} > 0`,
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    planetId: r.planetId,
    planetName: r.planetName,
    systemId: r.planetSystemId,
    typeId: r.typeId,
    level: r.level,
    hp: r.hp,
    destroyedAt: r.destroyedAt,
    lastCombatTickAt: r.lastCombatTickAt,
    // The building row does not currently store its own combatStats; we fall
    // back to the type-level stats (armor/targetClass) for damage math.
    combatStats: { targetClass: 'building' } as CombatStats,
    typeCombatStats: r.typeCombatStats,
    colonyOwnerId: r.colonyOwnerId,
    colonyId: r.colonyId,
  }));
}

async function loadAliveShips(database: typeof defaultDb): Promise<ShipRow[]> {
  const rows = await database
    .select({
      id: ships.id,
      ownerId: ships.ownerId,
      typeId: ships.typeId,
      status: ships.status,
      hp: ships.hp,
      locationPlanetId: ships.locationPlanetId,
      combatStats: ships.combatStats,
      lastCombatTickAt: ships.lastCombatTickAt,
      destroyedAt: ships.destroyedAt,
      typeArmor: shipTypes.armor,
      typeCombatStats: shipTypes.combatStats,
      sysId: systems.id,
      sysName: systems.name,
      sysIsHome: systems.isHome,
      sysOwnerId: systems.ownerId,
      sysSectorX: systems.sectorX,
      sysSectorY: systems.sectorY,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .leftJoin(planets, eq(planets.id, ships.locationPlanetId))
    .leftJoin(systems, eq(systems.id, planets.systemId))
    .where(ne(ships.status, SHIP_STATUS_DESTROYED));

  return rows.map((r) => ({
    id: r.id,
    ownerId: r.ownerId,
    typeId: r.typeId,
    status: r.status,
    hp: r.hp,
    locationPlanetId: r.locationPlanetId,
    combatStats: r.combatStats,
    lastCombatTickAt: r.lastCombatTickAt,
    destroyedAt: r.destroyedAt,
    typeArmor: r.typeArmor,
    typeCombatStats: r.typeCombatStats,
    hostSystem: r.sysId
      ? {
          id: r.sysId,
          name: r.sysName,
          isHome: !!r.sysIsHome,
          ownerId: r.sysOwnerId,
          sectorX: Number(r.sysSectorX),
          sectorY: Number(r.sysSectorY),
        }
      : null,
  }));
}

async function loadInFlightExpeditions(
  database: typeof defaultDb,
  shipIds: string[],
): Promise<ExpeditionRow[]> {
  const rows = await database
    .select({
      id: expeditions.id,
      shipId: expeditions.shipId,
      status: expeditions.status,
      targetX: expeditions.targetX,
      targetY: expeditions.targetY,
      eta: expeditions.eta,
      result: expeditions.result,
      originSectorX: systems.sectorX,
      originSectorY: systems.sectorY,
      originSectorZ: systems.sectorZ,
    })
    .from(expeditions)
    .innerJoin(planets, eq(planets.id, expeditions.originPlanetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(
      and(
        inArray(expeditions.shipId, shipIds),
        inArray(expeditions.status, ['in_flight', 'returning', EXPEDITION_STATUS_STATIONED]),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    shipId: r.shipId,
    status: r.status,
    targetX: r.targetX,
    targetY: r.targetY,
    eta: r.eta,
    result: r.result,
    originSectorX: Number(r.originSectorX),
    originSectorY: Number(r.originSectorY),
    originSectorZ: Number(r.originSectorZ),
  }));
}

function computePosition(
  ship: ShipRow,
  expeditionByShipId: Map<string, ExpeditionRow>,
  now: Date,
): { x: number; y: number } | null {
  if (ship.status === 'moving') {
    const exp = expeditionByShipId.get(ship.id);
    if (!exp) return null;
    if (exp.status === EXPEDITION_STATUS_STATIONED) {
      return { x: Number(exp.targetX), y: Number(exp.targetY) };
    }
    const pos = calculateExpeditionPosition(
      {
        targetX: exp.targetX,
        targetY: exp.targetY,
        eta: exp.eta,
        result: exp.result,
        status: exp.status,
      } as Parameters<typeof calculateExpeditionPosition>[0],
      { sectorX: exp.originSectorX, sectorY: exp.originSectorY, sectorZ: exp.originSectorZ },
      now,
    );
    return { x: pos.x, y: pos.y };
  }
  if (!ship.hostSystem) return null;
  return { x: ship.hostSystem.sectorX, y: ship.hostSystem.sectorY };
}

// Re-export pure helpers for tests.
export { resolveAttackerHits, computeTickDamage, sumDpsPerDefender } from './engine.js';

function mergeCombatStats(typeStats: CombatStats, instanceStats: CombatStats): CombatStats {
  // Ship instance currently stores the same defaults as the type. The type row
  // is authoritative for damageProfile / engagementRange (which are part of the
  // hull definition), while the instance row may override per-ship buffs later.
  return {
    ...typeStats,
    ...instanceStats,
    damageProfile: instanceStats.damageProfile ?? typeStats.damageProfile,
    missilePayload: instanceStats.missilePayload ?? typeStats.missilePayload,
    engagementRange: instanceStats.engagementRange ?? typeStats.engagementRange,
    shields: instanceStats.shields ?? typeStats.shields,
    targetClass: typeStats.targetClass,
  };
}
