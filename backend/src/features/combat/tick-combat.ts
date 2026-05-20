/**
 * Server-authoritative combat tick for ship-vs-ship engagements.
 *
 * Discovers candidate combat systems, processes each system in its own
 * transaction with a system-scoped advisory lock, loads only that system's
 * alive ships/buildings plus moving ships currently in that system, then runs
 * the pure engine in `engine.ts` and applies elapsed-time damage idempotently
 * using each defender's `lastCombatTickAt`.
 *
 * Idempotency: running this tick twice in quick succession produces near-zero
 * additional damage on the second call (dt ≈ 0 against the just-stamped
 * `lastCombatTickAt`). `COMBAT_TICK_MAX_DT_SEC` caps burst damage when a
 * defender re-enters range after a long gap.
 *
 * Used by the periodic combat worker (`workers/tick-combat.ts`). Browser
 * session syncs only read combat state; they do not mutate HP.
 */
import { and, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db as defaultDb } from "../../db/index.js";
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
} from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import {
  calculateExpeditionPosition,
  EXPEDITION_STATUS_STATIONED,
} from "../../workers/tick-expeditions.js";
import {
  SHIP_STATUS_DESTROYED,
  type CombatStats,
} from "@shared/types/combat.js";
import { COMMAND_CENTER_TYPE_ID } from "@shared/config/buildingUpgradeEconomy.js";
import {
  buildSystemMapLayouts,
  SYSTEM_MAP_WORLD_UNITS_PER_LY,
  systemMapJumpGatePoint,
  type SystemMapPoint,
} from "@shared/format/systemMapLayout.js";
import { getResearchEffectsForUser } from "../research/effects.js";
import {
  type BomberActor,
  type BuildingTarget,
  type CombatActor,
  type AttackerHit,
  computeTickDamage,
  isFreshCombatTouch,
  resolveAttackerHits,
  resolveBomberHits,
  SHIP_COMBAT_DAMAGE_TIME_SCALE,
  SURFACE_BOMBARDMENT_DAMAGE_TIME_SCALE,
  sumDpsPerBuilding,
} from "./engine.js";
import { resolveShieldedDamage } from "./shields.js";

export interface ProcessDueCombatOptions {
  /** Retained for legacy callers; combat mutation is worker-authoritative. */
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
    seed: number;
  } | null;
}

interface ExpeditionRow {
  id: string;
  shipId: string;
  originSystemId: string;
  originPlanetId: string;
  targetPlanetId: string | null;
  status: string;
  targetX: string | null;
  targetY: string | null;
  eta: Date;
  result: unknown;
  originSectorX: number;
  originSectorY: number;
  originSectorZ: number;
}

interface CombatHostSystem {
  id: string;
  name: string | null;
  isHome: boolean;
  ownerId: string | null;
  sectorX: number;
  sectorY: number;
  seed: number;
}

interface CombatSystemLayouts {
  planetPositions: Map<string, { x: number; y: number }>;
}

interface CombatCandidates {
  systemIds: string[];
  movingShipIdsBySystemId: Map<string, string[]>;
}

interface ShipRowSelection {
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
  sysId: string | null;
  sysName: string | null;
  sysIsHome: boolean | null;
  sysOwnerId: string | null;
  sysSectorX: number | null;
  sysSectorY: number | null;
  sysSeed: number | null;
}

type CombatDatabase = typeof defaultDb;
type CombatTransaction = Parameters<
  Parameters<CombatDatabase["transaction"]>[0]
>[0];
type CombatDbOrTx = CombatDatabase | CombatTransaction;

export interface ProcessDueCombatResult {
  defendersDamaged: number;
  destroyed: string[];
  shieldsDamaged: number;
  shieldsBroken: string[];
  buildingsDamaged: number;
  buildingsDestroyed: string[];
  coloniesAbandoned: string[];
}

const COMBAT_ADVISORY_LOCK_NAMESPACE = 20260518;

function emptyCombatResult(): ProcessDueCombatResult {
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

async function tryAcquireCombatSystemLock(
  tx: CombatTransaction,
  systemId: string,
): Promise<boolean> {
  const result = await tx.execute(sql`
    select pg_try_advisory_xact_lock(
      ${COMBAT_ADVISORY_LOCK_NAMESPACE},
      hashtext(${systemId})
    ) as locked
  `);
  const rawResult = result as unknown;
  const rows = Array.isArray(rawResult)
    ? rawResult
    : Array.isArray((rawResult as { rows?: unknown }).rows)
      ? (rawResult as { rows: unknown[] }).rows
      : [];
  return rows.some((row: any) => row.locked === true || row.locked === "t");
}

function pointFromResult(value: unknown): SystemMapPoint | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as { x?: unknown; y?: unknown };
  const x = Number(maybe.x);
  const y = Number(maybe.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function systemPointToCombatPosition(
  system: { sectorX: number; sectorY: number },
  point: SystemMapPoint,
): { x: number; y: number } {
  return {
    x: Number(system.sectorX) + point.x / SYSTEM_MAP_WORLD_UNITS_PER_LY,
    y: Number(system.sectorY) + point.y / SYSTEM_MAP_WORLD_UNITS_PER_LY,
  };
}

async function loadWeaponRangeMultipliers(
  aliveShips: ShipRow[],
  database: CombatDbOrTx,
): Promise<Map<string, number>> {
  const ownerIds = Array.from(new Set(aliveShips.map((ship) => ship.ownerId)));
  const entries = await Promise.all(
    ownerIds.map(async (ownerId) => {
      const effects = await getResearchEffectsForUser(ownerId, database);
      return [ownerId, effects.weaponRangeMultiplier] as const;
    }),
  );
  return new Map(entries);
}

async function loadSystemCombatLayouts(
  database: CombatDbOrTx,
  aliveShips: ShipRow[],
  extraSystems: Iterable<CombatHostSystem> = [],
): Promise<CombatSystemLayouts> {
  const systemsById = new Map<
    string,
    { id: string; sectorX: number; sectorY: number; seed: number }
  >();
  for (const ship of aliveShips) {
    if (!ship.hostSystem) continue;
    systemsById.set(ship.hostSystem.id, {
      id: ship.hostSystem.id,
      sectorX: ship.hostSystem.sectorX,
      sectorY: ship.hostSystem.sectorY,
      seed: ship.hostSystem.seed,
    });
  }
  for (const system of extraSystems) {
    systemsById.set(system.id, {
      id: system.id,
      sectorX: system.sectorX,
      sectorY: system.sectorY,
      seed: system.seed,
    });
  }

  if (systemsById.size === 0) {
    return { planetPositions: new Map() };
  }

  const planetRows = await database
    .select({
      id: planets.id,
      systemId: planets.systemId,
      name: planets.name,
      biome: planets.biome,
      size: planets.size,
    })
    .from(planets)
    .where(inArray(planets.systemId, [...systemsById.keys()]));

  const planetsBySystemId = new Map<string, typeof planetRows>();
  for (const planet of planetRows) {
    const list = planetsBySystemId.get(planet.systemId) ?? [];
    list.push(planet);
    planetsBySystemId.set(planet.systemId, list);
  }

  const planetPositions = new Map<string, { x: number; y: number }>();
  for (const [systemId, system] of systemsById) {
    const systemPlanets = planetsBySystemId.get(systemId) ?? [];
    const layouts = buildSystemMapLayouts(systemPlanets, system.seed);
    for (const layout of layouts) {
      planetPositions.set(
        layout.id,
        systemPointToCombatPosition(system, layout),
      );
    }
  }

  return { planetPositions };
}

export async function processDueCombat(
  options: ProcessDueCombatOptions = {},
): Promise<ProcessDueCombatResult> {
  const now = options.now ?? new Date();
  const candidates = await loadCombatCandidates(defaultDb, now);
  if (candidates.systemIds.length === 0) {
    return emptyCombatResult();
  }

  const aggregate = emptyCombatResult();
  for (const systemId of candidates.systemIds) {
    const movingShipIds =
      candidates.movingShipIdsBySystemId.get(systemId) ?? [];
    const result = await defaultDb.transaction(async (tx) => {
      const locked = await tryAcquireCombatSystemLock(tx, systemId);
      if (!locked) return emptyCombatResult();
      return processCombatSystemLocked(
        tx,
        systemId,
        movingShipIds,
        now,
        options,
      );
    });
    mergeCombatResult(aggregate, result);
  }

  return aggregate;
}

async function processCombatSystemLocked(
  database: CombatTransaction,
  systemId: string,
  movingShipIds: string[],
  now: Date,
  options: ProcessDueCombatOptions,
): Promise<ProcessDueCombatResult> {
  const aliveShips = [
    ...(await loadAliveShipsForSystems(database, [systemId])),
    ...(await loadAliveShipsByIds(database, movingShipIds)),
  ];
  if (aliveShips.length === 0) {
    return emptyCombatResult();
  }

  const inFlightShipIds = aliveShips
    .filter((s) => s.status === "moving")
    .map((s) => s.id);
  const inFlightExpeditions =
    inFlightShipIds.length === 0
      ? []
      : await loadInFlightExpeditions(database, inFlightShipIds);
  const expeditionByShipId = new Map<string, ExpeditionRow>();
  for (const exp of inFlightExpeditions) {
    expeditionByShipId.set(exp.shipId, exp);
  }
  const combatSystems = await loadCombatSystemsForExpeditions(
    database,
    inFlightExpeditions,
  );
  const combatLayouts = await loadSystemCombatLayouts(
    database,
    aliveShips,
    combatSystems.values(),
  );
  const weaponRangeMultiplierByOwner = await loadWeaponRangeMultipliers(
    aliveShips,
    database,
  );

  const actors: CombatActor[] = aliveShips.map((ship) => {
    const exp = expeditionByShipId.get(ship.id) ?? null;
    const hostSystem =
      ship.hostSystem ?? computeExpeditionHostSystem(exp, now, combatSystems);
    const position = computePosition(
      ship,
      expeditionByShipId,
      now,
      combatLayouts,
    );
    const mergedStats = mergeCombatStats(
      ship.typeCombatStats,
      ship.combatStats,
    );
    return {
      id: ship.id,
      ownerId: ship.ownerId,
      status: ship.status,
      hp: ship.hp,
      combatStats: mergedStats,
      defenderArmor: Math.max(0, mergedStats.armor ?? ship.typeArmor ?? 0),
      position,
      hostSystem,
      weaponRangeMultiplier:
        weaponRangeMultiplierByOwner.get(ship.ownerId) ?? 1,
      lastCombatTickAtMs: ship.lastCombatTickAt
        ? ship.lastCombatTickAt.getTime()
        : null,
    };
  });

  const actorById = new Map(actors.map((a) => [a.id, a]));
  const actorsBySystem = groupCombatActorsBySystem(actors);
  const systemActors = actorsBySystem.get(systemId) ?? [];
  const hits = resolveAttackerHits(systemActors);
  const shieldResult = resolveShieldedDamage(
    systemActors,
    hits,
    now.getTime(),
    {
      damageTimeScale: SHIP_COMBAT_DAMAGE_TIME_SCALE,
    },
  );
  const damageByDefender = shieldResult.directDamageByDefender;

  const bombingResult = await runBombingPass(
    database,
    actors,
    now,
    options,
    combatLayouts,
  );

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
    const damageApplied = damage > 0 ? Math.max(1, Math.round(damage)) : 0;
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

  const touchedOnlyIds = Array.from(shieldResult.touchedDefenderIds).filter(
    (id) => {
      const actor = actorById.get(id);
      const updated = updates.some((u) => u.shipId === id);
      return (
        actor &&
        !updated &&
        (isFreshCombatTouch(actor, now.getTime()) ||
          shieldResult.shieldedDefenderIds.has(id))
      );
    },
  );

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

  if (!options.skipNotifications) {
    await insertCombatStartedNotifications(database, {
      hits,
      actorById,
      shipRowById,
      now,
    });
  }

  for (const [shipId, shieldHooks] of shieldResult.shieldUpdates) {
    const actor = actorById.get(shipId);
    if (!actor) continue;
    await database
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
      await database
        .update(ships)
        .set({
          hp: 0,
          status: SHIP_STATUS_DESTROYED,
          destroyedAt: now,
          lastCombatTickAt: now,
        })
        .where(eq(ships.id, upd.shipId));
      await database
        .delete(expeditions)
        .where(eq(expeditions.shipId, upd.shipId));
    } else {
      await database
        .update(ships)
        .set({ hp: upd.newHp, lastCombatTickAt: now })
        .where(eq(ships.id, upd.shipId));
    }
  }

  // Stamp shielded defenders too, so repeated ticks at the same instant do
  // not reapply the same incoming damage to their covering shield.
  if (touchedOnlyIds.length > 0) {
    await database
      .update(ships)
      .set({ lastCombatTickAt: now })
      .where(inArray(ships.id, touchedOnlyIds));
  }

  if (!options.skipNotifications) {
    const notifs = updates
      .filter((u) => u.destroyed)
      .map((u) => ({
        userId: u.ownerId,
        type: "ship_destroyed",
        payload: {
          shipId: u.shipId,
          typeId: u.typeId,
          destroyedAt: now.toISOString(),
        },
      }));
    if (notifs.length > 0) {
      await database.insert(notifications).values(notifs);
    }
  }

  if (destroyed.length > 0) {
    logger.info({ destroyed }, "Combat tick: ships destroyed");
  }

  return {
    defendersDamaged: updates.length,
    destroyed,
    shieldsDamaged: shieldResult.shieldsDamaged.size,
    shieldsBroken: Array.from(shieldResult.shieldsBroken),
    ...bombingResult,
  };
}

function groupCombatActorsBySystem(
  actors: CombatActor[],
): Map<string, CombatActor[]> {
  const bySystem = new Map<string, CombatActor[]>();
  for (const actor of actors) {
    const systemId = actor.hostSystem?.id;
    if (!systemId) continue;
    const list = bySystem.get(systemId) ?? [];
    list.push(actor);
    bySystem.set(systemId, list);
  }
  return bySystem;
}

function mergeCombatResult(
  target: ProcessDueCombatResult,
  source: ProcessDueCombatResult,
): void {
  target.defendersDamaged += source.defendersDamaged;
  target.destroyed.push(...source.destroyed);
  target.shieldsDamaged += source.shieldsDamaged;
  target.shieldsBroken.push(...source.shieldsBroken);
  target.buildingsDamaged += source.buildingsDamaged;
  target.buildingsDestroyed.push(...source.buildingsDestroyed);
  target.coloniesAbandoned.push(...source.coloniesAbandoned);
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
          eq(notifications.type, "combat_started"),
          gte(notifications.createdAt, cutoff),
          sql`${notifications.payload} ->> 'combatSpaceKey' = ${item.combatSpaceKey}`,
        ),
      )
      .limit(1);
    if (recent) continue;

    await tx.insert(notifications).values({
      userId: item.userId,
      type: "combat_started",
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

async function insertBombingStartedNotifications(
  tx: any,
  input: {
    buildingIds: Set<string>;
    buildingById: Map<string, AliveBuildingRow>;
    now: Date;
  },
): Promise<void> {
  const cutoff = new Date(input.now.getTime() - 30 * 60 * 1000);
  const notificationsByOwnerAndPlanet = new Map<
    string,
    {
      userId: string;
      combatSpaceKey: string;
      planetId: string;
      planetName: string;
      buildingId: string;
      typeId: string;
    }
  >();

  for (const buildingId of input.buildingIds) {
    const building = input.buildingById.get(buildingId);
    if (!building?.colonyOwnerId) continue;
    const combatSpaceKey = `planet:${building.planetId}`;
    const key = `${building.colonyOwnerId}:${combatSpaceKey}`;
    if (notificationsByOwnerAndPlanet.has(key)) continue;
    notificationsByOwnerAndPlanet.set(key, {
      userId: building.colonyOwnerId,
      combatSpaceKey,
      planetId: building.planetId,
      planetName: building.planetName,
      buildingId: building.id,
      typeId: building.typeId,
    });
  }

  for (const item of notificationsByOwnerAndPlanet.values()) {
    const [recent] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, item.userId),
          eq(notifications.type, "combat_started"),
          gte(notifications.createdAt, cutoff),
          sql`${notifications.payload} ->> 'combatSpaceKey' = ${item.combatSpaceKey}`,
        ),
      )
      .limit(1);
    if (recent) continue;

    await tx.insert(notifications).values({
      userId: item.userId,
      type: "combat_started",
      payload: {
        combatSpaceKey: item.combatSpaceKey,
        locationName: item.planetName,
        planetId: item.planetId,
        planetName: item.planetName,
        buildingId: item.buildingId,
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
  if (!point) return "unknown";
  return `point:${Math.round(point.x)}:${Math.round(point.y)}`;
}

function combatLocationName(
  attacker: CombatActor,
  defender: CombatActor,
): string {
  return (
    (defender.hostSystem as any)?.name ??
    (attacker.hostSystem as any)?.name ??
    "your fleet"
  );
}

function collectExpeditionSystemIds(
  expeditionsRows: ExpeditionRow[],
): string[] {
  const ids = new Set<string>();
  for (const exp of expeditionsRows) {
    ids.add(exp.originSystemId);
    const result = exp.result as Record<string, unknown> | null;
    if (!result || typeof result !== "object") continue;
    if (typeof result.originSystemId === "string") {
      ids.add(result.originSystemId);
    }
    if (typeof result.destinationSystemId === "string") {
      ids.add(result.destinationSystemId);
    }
  }
  return [...ids];
}

async function loadCombatSystemsForExpeditions(
  database: CombatDbOrTx,
  expeditionsRows: ExpeditionRow[],
): Promise<Map<string, CombatHostSystem>> {
  const ids = collectExpeditionSystemIds(expeditionsRows);
  if (ids.length === 0) return new Map();

  const rows = await database
    .select({
      id: systems.id,
      name: systems.name,
      isHome: systems.isHome,
      ownerId: systems.ownerId,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      seed: systems.seed,
    })
    .from(systems)
    .where(inArray(systems.id, ids));

  return new Map(
    rows.map((system) => [
      system.id,
      {
        id: system.id,
        name: system.name,
        isHome: !!system.isHome,
        ownerId: system.ownerId,
        sectorX: Number(system.sectorX),
        sectorY: Number(system.sectorY),
        seed: Number(system.seed),
      },
    ]),
  );
}

function computeExpeditionHostSystem(
  exp: ExpeditionRow | null,
  now: Date,
  systemById: Map<string, CombatHostSystem>,
): CombatHostSystem | null {
  if (!exp) return null;
  const result = exp.result as Record<string, unknown> | null;
  if (result?.routeMode === "jump_gate") {
    const systemId = computeJumpGateCombatSystemId(exp, result, now);
    return systemId ? (systemById.get(systemId) ?? null) : null;
  }

  return systemById.get(exp.originSystemId) ?? null;
}

function computeJumpGateCombatSystemId(
  exp: ExpeditionRow,
  result: Record<string, unknown>,
  now: Date,
): string | null {
  const targetPoint = pointFromResult(result.targetSystemPoint);
  const originPoint = pointFromResult(result.originSystemPoint);
  const destinationSystemId =
    typeof result.destinationSystemId === "string"
      ? result.destinationSystemId
      : null;
  const originSystemId =
    typeof result.originSystemId === "string" ? result.originSystemId : null;

  if (exp.status === EXPEDITION_STATUS_STATIONED) {
    return targetPoint ? destinationSystemId : null;
  }

  const progress = expeditionProgress(exp, now);
  if (progress === null) return null;

  const distance = Number(result.distance);
  const travelled =
    Math.max(0, Math.min(1, progress)) *
    (Number.isFinite(distance) ? distance : 0);

  if (destinationSystemId && targetPoint) {
    const targetLegDistance = Number(
      result.targetGateDistance ?? result.distance ?? 0,
    );
    const originLegDistance = Number(result.originGateDistance ?? 0);
    if (Number.isFinite(targetLegDistance) && targetLegDistance > 0) {
      const targetLegProgress =
        exp.status === "returning"
          ? 1 - (travelled - originLegDistance) / targetLegDistance
          : (travelled - originLegDistance) / targetLegDistance;
      if (targetLegProgress >= 0 && targetLegProgress <= 1) {
        return destinationSystemId;
      }
    }
  }

  if (originSystemId && originPoint) {
    const originLegDistance = Number(
      result.originGateDistance ?? result.distance ?? 0,
    );
    if (Number.isFinite(originLegDistance) && originLegDistance > 0) {
      const originLegProgress =
        exp.status === "returning"
          ? 1 - travelled / originLegDistance
          : travelled / originLegDistance;
      if (originLegProgress >= 0 && originLegProgress <= 1) {
        return originSystemId;
      }
    }
  }

  return null;
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
  database: CombatTransaction,
  combatActors: CombatActor[],
  now: Date,
  options: ProcessDueCombatOptions,
  combatLayouts: CombatSystemLayouts,
): Promise<BombingPassResult> {
  // Build the bomber list from the resolved combat actors so tactical point
  // deployments (`stationed` expeditions with `ships.status='moving'`) can
  // attack surface targets once they are inside orbital range.
  const bombers: BomberActor[] = combatActors
    .filter((actor) => actor.hostSystem && actor.position)
    .map((actor) => ({
      id: actor.id,
      ownerId: actor.ownerId,
      status: actor.status,
      hp: actor.hp,
      combatStats: actor.combatStats,
      hostSystemId: actor.hostSystem?.id ?? null,
      position: actor.position,
      weaponRangeMultiplier: actor.weaponRangeMultiplier ?? 1,
    }))
    .filter((b) => b.combatStats.engagementRange === "orbital" && b.hp > 0);

  if (bombers.length === 0) {
    return {
      buildingsDamaged: 0,
      buildingsDestroyed: [],
      coloniesAbandoned: [],
    };
  }

  const bomberSystemIds = Array.from(
    new Set(
      bombers.map((b) => b.hostSystemId).filter((id): id is string => !!id),
    ),
  );

  const aliveBuildings = await loadAliveBuildingsForSystems(
    database,
    bomberSystemIds,
  );
  if (aliveBuildings.length === 0) {
    return {
      buildingsDamaged: 0,
      buildingsDestroyed: [],
      coloniesAbandoned: [],
    };
  }

  const buildingsByPlanet = new Map<string, BuildingTarget[]>();
  for (const b of aliveBuildings) {
    const targetClass: "building" | "command_center" =
      b.typeId === COMMAND_CENTER_TYPE_ID ? "command_center" : "building";
    const armor = Math.max(
      0,
      b.combatStats.armor ?? b.typeCombatStats.armor ?? 0,
    );
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
      position: combatLayouts.planetPositions.get(b.planetId) ?? null,
      lastCombatTickAtMs: b.lastCombatTickAt
        ? b.lastCombatTickAt.getTime()
        : null,
    });
    buildingsByPlanet.set(b.planetId, list);
  }

  const hits = resolveBomberHits(bombers, buildingsByPlanet);
  const buildingById = new Map(aliveBuildings.map((b) => [b.id, b]));
  const dpsByBuilding = sumDpsPerBuilding(hits);
  if (dpsByBuilding.size === 0) {
    return {
      buildingsDamaged: 0,
      buildingsDestroyed: [],
      coloniesAbandoned: [],
    };
  }

  const buildingsDestroyed: string[] = [];
  const coloniesAbandoned: string[] = [];
  const firstTouchedBuildingIds = new Set<string>();
  const bombingShipIds = Array.from(new Set(hits.map((hit) => hit.bomberId)));

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
    const wasFirstTouch = lastMs == null;
    const damage = computeTickDamage(
      { lastCombatTickAtMs: lastMs },
      totalDps,
      now.getTime(),
      { timeScale: SURFACE_BOMBARDMENT_DAMAGE_TIME_SCALE },
    );
    const damageApplied = Math.max(0, Math.round(damage));
    const newHp = Math.max(0, b.hp - damageApplied);
    if (damageApplied === 0) {
      if (isFreshCombatTouch({ lastCombatTickAtMs: lastMs }, now.getTime())) {
        firstTouchOnly.push(buildingId);
        firstTouchedBuildingIds.add(buildingId);
      }
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
    if (wasFirstTouch) firstTouchedBuildingIds.add(buildingId);
  }

  if (updates.length === 0 && firstTouchOnly.length === 0) {
    return {
      buildingsDamaged: 0,
      buildingsDestroyed: [],
      coloniesAbandoned: [],
    };
  }

  if (bombingShipIds.length > 0) {
    await database
      .update(ships)
      .set({ lastCombatTickAt: now })
      .where(inArray(ships.id, bombingShipIds));
  }

  if (!options.skipNotifications && firstTouchedBuildingIds.size > 0) {
    await insertBombingStartedNotifications(database, {
      buildingIds: firstTouchedBuildingIds,
      buildingById,
      now,
    });
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

  if (firstTouchOnly.length > 0) {
    await database
      .update(buildings)
      .set({ lastCombatTickAt: now })
      .where(inArray(buildings.id, firstTouchOnly));
  }

  for (const upd of updates) {
    if (planetsToWipe.has(upd.planetId)) continue; // handled below
    if (upd.destroyed) {
      await database
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
      await database
        .update(buildings)
        .set({ hp: upd.newHp, lastCombatTickAt: now })
        .where(eq(buildings.id, upd.buildingId));
    }
  }

  for (const planetId of planetsToWipe) {
    const planetBuildings = aliveBuildings.filter(
      (b) => b.planetId === planetId,
    );
    const colonyOwnerId =
      planetBuildings.find((b) => b.colonyOwnerId != null)?.colonyOwnerId ??
      null;
    const colonyId =
      planetBuildings.find((b) => b.colonyId != null)?.colonyId ?? null;

    // Delete EVERY row on the planet — including non-CC husks from previous
    // ticks that already had destroyedAt set, plus structures built between
    // ticks. The planet must be a clean slate before re-colonization.
    const planetWipeResult = await database
      .delete(buildings)
      .where(eq(buildings.planetId, planetId))
      .returning({ id: buildings.id });
    for (const row of planetWipeResult) {
      if (!buildingsDestroyed.includes(row.id)) buildingsDestroyed.push(row.id);
    }
    if (colonyId) {
      await database.delete(colonies).where(eq(colonies.id, colonyId));
      coloniesAbandoned.push(colonyId);

      if (!options.skipNotifications && colonyOwnerId) {
        await database.insert(notifications).values({
          userId: colonyOwnerId,
          type: "colony_destroyed",
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
        type: "building_destroyed",
        payload: {
          buildingId: u.buildingId,
          typeId: u.typeId,
          planetId: u.planetId,
          planetName: aliveBuildings.find((b) => b.id === u.buildingId)
            ?.planetName,
          destroyedAt: now.toISOString(),
        },
      }));
    if (notifs.length > 0) {
      await database.insert(notifications).values(notifs);
    }
  }

  if (buildingsDestroyed.length > 0) {
    logger.info(
      { buildingsDestroyed, coloniesAbandoned },
      "Combat tick: buildings destroyed by orbital bombing",
    );
  }

  return {
    buildingsDamaged: updates.length,
    buildingsDestroyed,
    coloniesAbandoned,
  };
}

async function loadAliveBuildingsForSystems(
  database: CombatDbOrTx,
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
    combatStats: { targetClass: "building" } as CombatStats,
    typeCombatStats: r.typeCombatStats,
    colonyOwnerId: r.colonyOwnerId,
    colonyId: r.colonyId,
  }));
}

async function loadCombatCandidates(
  database: CombatDbOrTx,
  now: Date,
): Promise<CombatCandidates> {
  const ownerIdsBySystemId = new Map<string, Set<string>>();
  const bombingSystemIds = new Set<string>();
  const shieldRuntimeSystemIds = new Set<string>();
  const movingShipIdsBySystemId = new Map<string, string[]>();

  const dockedRows = await database
    .select({
      shipId: ships.id,
      ownerId: ships.ownerId,
      combatStats: ships.combatStats,
      typeCombatStats: shipTypes.combatStats,
      systemId: systems.id,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .innerJoin(planets, eq(planets.id, ships.locationPlanetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(
      and(ne(ships.status, SHIP_STATUS_DESTROYED), ne(ships.status, "moving")),
    );

  for (const row of dockedRows) {
    registerSystemOwner(ownerIdsBySystemId, row.systemId, row.ownerId);
    const stats = mergeCombatStats(row.typeCombatStats, row.combatStats);
    if (stats.engagementRange === "orbital" && stats.damageProfile) {
      bombingSystemIds.add(row.systemId);
    }
    if (needsShieldRuntimeResolution(stats)) {
      shieldRuntimeSystemIds.add(row.systemId);
    }
  }

  const movingShips = await loadAliveMovingShips(database);
  const movingShipIds = movingShips.map((ship) => ship.id);
  const movingExpeditions =
    movingShipIds.length === 0
      ? []
      : await loadInFlightExpeditions(database, movingShipIds);
  const movingExpeditionByShipId = new Map<string, ExpeditionRow>();
  for (const exp of movingExpeditions) {
    movingExpeditionByShipId.set(exp.shipId, exp);
  }
  const movingSystems = await loadCombatSystemsForExpeditions(
    database,
    movingExpeditions,
  );

  for (const ship of movingShips) {
    const exp = movingExpeditionByShipId.get(ship.id) ?? null;
    const hostSystem = computeExpeditionHostSystem(exp, now, movingSystems);
    if (!hostSystem) continue;

    registerSystemOwner(ownerIdsBySystemId, hostSystem.id, ship.ownerId);
    const stats = mergeCombatStats(ship.typeCombatStats, ship.combatStats);
    if (stats.engagementRange === "orbital" && stats.damageProfile) {
      bombingSystemIds.add(hostSystem.id);
    }
    if (needsShieldRuntimeResolution(stats)) {
      shieldRuntimeSystemIds.add(hostSystem.id);
    }
    const list = movingShipIdsBySystemId.get(hostSystem.id) ?? [];
    list.push(ship.id);
    movingShipIdsBySystemId.set(hostSystem.id, list);
  }

  const systemIds = new Set<string>();
  for (const [systemId, ownerIds] of ownerIdsBySystemId) {
    if (ownerIds.size > 1 || bombingSystemIds.has(systemId)) {
      systemIds.add(systemId);
    }
  }
  for (const systemId of bombingSystemIds) {
    systemIds.add(systemId);
  }
  for (const systemId of shieldRuntimeSystemIds) {
    systemIds.add(systemId);
  }

  return {
    systemIds: [...systemIds].sort(),
    movingShipIdsBySystemId,
  };
}

function registerSystemOwner(
  ownerIdsBySystemId: Map<string, Set<string>>,
  systemId: string,
  ownerId: string,
): void {
  const ownerIds = ownerIdsBySystemId.get(systemId) ?? new Set<string>();
  ownerIds.add(ownerId);
  ownerIdsBySystemId.set(systemId, ownerIds);
}

function needsShieldRuntimeResolution(stats: CombatStats): boolean {
  const shields = stats.shields;
  if (!shields) return false;
  const capacity = Number(shields.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) return false;
  const currentHp = Number(shields.currentHp ?? capacity);
  if (Number.isFinite(currentHp) && currentHp < capacity) return true;
  return (
    shields.state === "downtime" ||
    shields.state === "recharging" ||
    shields.brokenUntil != null
  );
}

async function loadAliveShipsForSystems(
  database: CombatDbOrTx,
  systemIds: string[],
): Promise<ShipRow[]> {
  if (systemIds.length === 0) return [];
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
      sysSeed: systems.seed,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .innerJoin(planets, eq(planets.id, ships.locationPlanetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(
      and(
        ne(ships.status, SHIP_STATUS_DESTROYED),
        ne(ships.status, "moving"),
        inArray(systems.id, systemIds),
      ),
    );

  return rows.map(mapShipRow);
}

async function loadAliveMovingShips(
  database: CombatDbOrTx,
): Promise<ShipRow[]> {
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
      sysSeed: systems.seed,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .leftJoin(planets, eq(planets.id, ships.locationPlanetId))
    .leftJoin(systems, eq(systems.id, planets.systemId))
    .where(
      and(ne(ships.status, SHIP_STATUS_DESTROYED), eq(ships.status, "moving")),
    );

  return rows.map(mapShipRow);
}

async function loadAliveShipsByIds(
  database: CombatDbOrTx,
  shipIds: string[],
): Promise<ShipRow[]> {
  if (shipIds.length === 0) return [];
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
      sysSeed: systems.seed,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .leftJoin(planets, eq(planets.id, ships.locationPlanetId))
    .leftJoin(systems, eq(systems.id, planets.systemId))
    .where(
      and(inArray(ships.id, shipIds), ne(ships.status, SHIP_STATUS_DESTROYED)),
    );

  return rows.map(mapShipRow);
}

function mapShipRow(r: ShipRowSelection): ShipRow {
  return {
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
          seed: Number(r.sysSeed),
        }
      : null,
  };
}

async function loadInFlightExpeditions(
  database: CombatDbOrTx,
  shipIds: string[],
): Promise<ExpeditionRow[]> {
  const rows = await database
    .select({
      id: expeditions.id,
      shipId: expeditions.shipId,
      originSystemId: systems.id,
      originPlanetId: expeditions.originPlanetId,
      targetPlanetId: expeditions.targetPlanetId,
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
        inArray(expeditions.status, [
          "in_flight",
          "returning",
          EXPEDITION_STATUS_STATIONED,
        ]),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    shipId: r.shipId,
    originSystemId: r.originSystemId,
    originPlanetId: r.originPlanetId,
    targetPlanetId: r.targetPlanetId,
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
  combatLayouts: CombatSystemLayouts,
): { x: number; y: number } | null {
  if (ship.status === "moving") {
    const exp = expeditionByShipId.get(ship.id);
    if (!exp) return null;
    if (exp.status === EXPEDITION_STATUS_STATIONED) {
      const result = exp.result as Record<string, unknown> | null;
      const stationedPoint = pointFromResult(result?.targetSystemPoint);
      if (stationedPoint) {
        return systemPointToCombatPosition(
          { sectorX: Number(exp.targetX), sectorY: Number(exp.targetY) },
          stationedPoint,
        );
      }
      return { x: Number(exp.targetX), y: Number(exp.targetY) };
    }

    const result = exp.result as Record<string, unknown> | null;
    if (result?.routeMode === "jump_gate") {
      const gatePosition = computeJumpGatePointPosition(exp, result, now);
      if (gatePosition) return gatePosition;
    }

    if (result?.routeMode !== "jump_gate") {
      const origin = combatLayouts.planetPositions.get(exp.originPlanetId);
      if (origin) {
        const targetPlanet = exp.targetPlanetId
          ? combatLayouts.planetPositions.get(exp.targetPlanetId)
          : null;
        const target = targetPlanet ?? {
          x: origin.x + Number(exp.targetX) - exp.originSectorX,
          y: origin.y + Number(exp.targetY) - exp.originSectorY,
        };
        const t = expeditionProgress(exp, now);
        if (t !== null) {
          const progress = exp.status === "returning" ? 1 - t : t;
          return {
            x: origin.x + (target.x - origin.x) * progress,
            y: origin.y + (target.y - origin.y) * progress,
          };
        }
      }
    }

    const pos = calculateExpeditionPosition(
      {
        targetX: exp.targetX,
        targetY: exp.targetY,
        eta: exp.eta,
        result: exp.result,
        status: exp.status,
      } as Parameters<typeof calculateExpeditionPosition>[0],
      {
        sectorX: exp.originSectorX,
        sectorY: exp.originSectorY,
        sectorZ: exp.originSectorZ,
      },
      now,
    );
    return { x: pos.x, y: pos.y };
  }
  if (!ship.hostSystem) return null;
  if (ship.locationPlanetId) {
    const planetPosition = combatLayouts.planetPositions.get(
      ship.locationPlanetId,
    );
    if (planetPosition) return planetPosition;
  }
  return { x: ship.hostSystem.sectorX, y: ship.hostSystem.sectorY };
}

function computeJumpGatePointPosition(
  exp: ExpeditionRow,
  result: Record<string, unknown>,
  now: Date,
): { x: number; y: number } | null {
  const targetPoint = pointFromResult(result.targetSystemPoint);
  const originPoint = pointFromResult(result.originSystemPoint);
  const gatePoint = systemMapJumpGatePoint();

  const destinationSystemId =
    typeof result.destinationSystemId === "string"
      ? result.destinationSystemId
      : null;
  const originSystemId =
    typeof result.originSystemId === "string" ? result.originSystemId : null;

  const progress = expeditionProgress(exp, now);
  if (progress === null) return null;

  const distance = Number(result.distance);
  const travelled =
    Math.max(0, Math.min(1, progress)) *
    (Number.isFinite(distance) ? distance : 0);

  if (destinationSystemId && targetPoint) {
    const targetLegDistance = Number(
      result.targetGateDistance ?? result.distance ?? 0,
    );
    const originLegDistance = Number(result.originGateDistance ?? 0);
    if (Number.isFinite(targetLegDistance) && targetLegDistance > 0) {
      const targetLegProgress =
        exp.status === "returning"
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
        return systemPointToCombatPosition(
          { sectorX: Number(exp.targetX), sectorY: Number(exp.targetY) },
          point,
        );
      }
    }
  }

  if (originSystemId && originPoint) {
    const originLegDistance = Number(
      result.originGateDistance ?? result.distance ?? 0,
    );
    if (Number.isFinite(originLegDistance) && originLegDistance > 0) {
      const originLegProgress =
        exp.status === "returning"
          ? 1 - travelled / originLegDistance
          : travelled / originLegDistance;
      if (originLegProgress >= 0 && originLegProgress <= 1) {
        const point = interpolateSystemPoint(
          originPoint,
          gatePoint,
          originLegProgress,
        );
        return systemPointToCombatPosition(
          { sectorX: exp.originSectorX, sectorY: exp.originSectorY },
          point,
        );
      }
    }
  }

  return null;
}

function interpolateSystemPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  const p = Math.max(0, Math.min(1, progress));
  return {
    x: start.x + (end.x - start.x) * p,
    y: start.y + (end.y - start.y) * p,
  };
}

function expeditionProgress(exp: ExpeditionRow, now: Date): number | null {
  const result = exp.result as Record<string, unknown> | null;
  const distance = Number(result?.distance);
  const speed = Number(result?.speed);
  const engineFactor = Number(result?.engineFactor ?? 1);
  if (!Number.isFinite(distance) || !Number.isFinite(speed) || speed <= 0) {
    return null;
  }
  const durationMs = ((distance * 60) / speed) * engineFactor * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const etaMs = exp.eta.getTime();
  const startMs = etaMs - durationMs;
  if (now.getTime() <= startMs) return 0;
  if (now.getTime() >= etaMs) return 1;
  return Math.max(0, Math.min(1, (now.getTime() - startMs) / durationMs));
}

// Re-export pure helpers for tests.
export {
  resolveAttackerHits,
  computeTickDamage,
  sumDpsPerDefender,
} from "./engine.js";

function mergeCombatStats(
  typeStats: CombatStats,
  instanceStats: CombatStats,
): CombatStats {
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
