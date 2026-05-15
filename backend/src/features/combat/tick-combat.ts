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
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import {
  ships,
  shipTypes,
  planets,
  systems,
  expeditions,
  notifications,
} from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { calculateExpeditionPosition } from '../../workers/tick-expeditions.js';
import { SHIP_STATUS_DESTROYED, type CombatStats } from '@shared/types/combat.js';
import {
  type CombatActor,
  computeTickDamage,
  resolveAttackerHits,
  sumDpsPerDefender,
} from './engine.js';

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
): Promise<{ defendersDamaged: number; destroyed: string[] }> {
  const now = options.now ?? new Date();

  const aliveShips = await loadAliveShips(defaultDb);
  if (aliveShips.length === 0) {
    return { defendersDamaged: 0, destroyed: [] };
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
  const dpsByDefender = sumDpsPerDefender(hits);

  if (dpsByDefender.size === 0) {
    return { defendersDamaged: 0, destroyed: [] };
  }

  const actorById = new Map(actors.map((a) => [a.id, a]));
  const destroyed: string[] = [];
  const updates: Array<{
    shipId: string;
    ownerId: string;
    newHp: number;
    destroyed: boolean;
    typeId: string;
  }> = [];

  for (const [defenderId, totalDps] of dpsByDefender) {
    const defender = actorById.get(defenderId);
    if (!defender) continue;
    const damage = computeTickDamage(defender, totalDps, now.getTime());
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

  if (updates.length === 0) {
    // First-touch only: just stamp lastCombatTickAt so the next tick has a baseline.
    const firstTouchIds = Array.from(dpsByDefender.keys()).filter((id) => {
      const actor = actorById.get(id);
      return actor && actor.lastCombatTickAtMs == null;
    });
    if (firstTouchIds.length > 0) {
      await defaultDb
        .update(ships)
        .set({ lastCombatTickAt: now })
        .where(inArray(ships.id, firstTouchIds));
    }
    return { defendersDamaged: 0, destroyed: [] };
  }

  await defaultDb.transaction(async (tx) => {
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

    // Also stamp first-touch defenders that took zero damage so the next tick measures elapsed time.
    const firstTouchOnlyIds = Array.from(dpsByDefender.keys()).filter((id) => {
      const actor = actorById.get(id);
      const updated = updates.some((u) => u.shipId === id);
      return actor && actor.lastCombatTickAtMs == null && !updated;
    });
    if (firstTouchOnlyIds.length > 0) {
      await tx
        .update(ships)
        .set({ lastCombatTickAt: now })
        .where(inArray(ships.id, firstTouchOnlyIds));
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

  return { defendersDamaged: updates.length, destroyed };
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
        inArray(expeditions.status, ['in_flight', 'returning']),
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
    engagementRange: instanceStats.engagementRange ?? typeStats.engagementRange,
    targetClass: typeStats.targetClass,
  };
}
