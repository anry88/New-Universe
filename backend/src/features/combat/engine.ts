/**
 * Pure (database-free) helpers for the ship-vs-ship combat tick engine.
 *
 * All position math and target-eligibility rules live here so they can be unit
 * tested without seeding ships/expeditions. Side effects (DB writes,
 * notifications) live in `tick-combat.ts`.
 */
import {
  type CombatStats,
  type EngagementRange,
  canTargetShips,
  bombardmentRangeToSectorDistance,
  effectiveDpsAgainst,
  effectiveShieldDpsAgainst,
  engagementRangeToSectorDistance,
  isShipTargetClass,
  missilePayloadShieldDps,
} from "@shared/types/combat.js";
import { resolveMissilePayloadDps } from "./missiles.js";

/**
 * Upper bound on the elapsed-time window applied to a single combat tick.
 * Caps damage when a defender re-engages after a gap, so re-engagement bursts
 * cannot one-shot anyone that drifted in and out of the combat scope.
 */
export const COMBAT_TICK_MAX_DT_SEC = 3;
export const COMBAT_REENGAGEMENT_RESET_SEC = 15;
export const SHIP_COMBAT_DAMAGE_TIME_SCALE = 0.08;
export const SURFACE_BOMBARDMENT_DAMAGE_TIME_SCALE =
  SHIP_COMBAT_DAMAGE_TIME_SCALE;

export interface CombatActor {
  id: string;
  ownerId: string;
  status: string;
  hp: number;
  combatStats: CombatStats;
  defenderArmor: number;
  /** Current sector-XY position (planar). `null` if the ship has no location yet (e.g. building). */
  position: { x: number; y: number } | null;
  /** System the ship currently sits in (null when in flight between systems). */
  hostSystem: { id: string; isHome: boolean; ownerId: string | null } | null;
  /** Weapons research multiplier for this owner's weapon acquisition range. */
  weaponRangeMultiplier?: number;
  /** ms epoch of the last combat tick that touched this defender, or null on first contact. */
  lastCombatTickAtMs: number | null;
}

export interface AttackerHit {
  attackerId: string;
  defenderId: string;
  /** Effective DPS this attacker deals to this defender (post-armor). */
  effectiveDps: number;
  /** Effective DPS this attacker deals to a covering shield. */
  shieldDps: number;
}

/**
 * Is the defender currently protected from this attacker by foreign-home-system
 * visibility rules?
 *
 * The visibility module (`features/world/visibility.ts`) hides foreign home
 * systems from external scans. Combat mirrors that: an attacker outside a
 * defender's foreign home system simply cannot acquire a target there. If the
 * attacker is *inside* the same home system (e.g. invading the defender's
 * capital), the protection lifts.
 */
export function isDefenderProtectedFromAttacker(
  attacker: Pick<CombatActor, "ownerId" | "hostSystem">,
  defender: Pick<CombatActor, "hostSystem">,
): boolean {
  const sys = defender.hostSystem;
  if (!sys || !sys.isHome) return false;
  if (!sys.ownerId || sys.ownerId === attacker.ownerId) return false;
  return !(attacker.hostSystem && attacker.hostSystem.id === sys.id);
}

/**
 * Resolve every (attacker, defender) hit for the current tick. Pure function:
 * given the snapshot of combat actors, returns the list of damage applications
 * that should occur this tick.
 */
export function resolveAttackerHits(actors: CombatActor[]): AttackerHit[] {
  const hits: AttackerHit[] = [];

  for (const attacker of actors) {
    if (!isAttackerActive(attacker)) continue;
    const target = selectShipTargetForAttacker(attacker, actors);
    if (!target) continue;

    hits.push({
      attackerId: attacker.id,
      defenderId: target.defender.id,
      effectiveDps: target.effectiveDps,
      shieldDps: target.shieldDps,
    });
  }

  return hits;
}

interface ShipTargetCandidate {
  defender: CombatActor;
  distance: number;
  effectiveDps: number;
  shieldDps: number;
}

function selectShipTargetForAttacker(
  attacker: CombatActor,
  actors: CombatActor[],
): ShipTargetCandidate | null {
  const candidates: ShipTargetCandidate[] = [];

  const sustainedRange =
    engagementRangeToSectorDistance(
      attacker.combatStats.engagementRange as EngagementRange | undefined,
    ) * weaponRangeMultiplierFor(attacker);

  for (const defender of actors) {
    if (defender.id === attacker.id) continue;
    if (defender.ownerId === attacker.ownerId) continue;
    if (!isDefenderTargetable(defender)) continue;
    if (!sameCombatSystem(attacker, defender)) continue;
    if (isDefenderProtectedFromAttacker(attacker, defender)) continue;

    const dist = planarDistance(attacker.position, defender.position);
    if (dist === null) continue;

    const sustainedEff = resolveSustainedShipWeaponDps(
      attacker,
      defender,
      dist,
      sustainedRange,
    );
    const missileEff = resolveMissileShipWeaponDps(attacker, defender, dist);
    const effectiveDps = sustainedEff + missileEff;
    if (effectiveDps <= 0) continue;

    candidates.push({
      defender,
      distance: dist,
      effectiveDps,
      shieldDps:
        (sustainedEff > 0
          ? effectiveShieldDpsAgainst(attacker.combatStats.damageProfile)
          : 0) +
        (missileEff > 0
          ? missilePayloadShieldDps(attacker.combatStats.missilePayload)
          : 0),
    });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const distanceDelta = a.distance - b.distance;
    if (distanceDelta !== 0) return distanceDelta;
    const hpDelta = a.defender.hp - b.defender.hp;
    if (hpDelta !== 0) return hpDelta;
    return a.defender.id.localeCompare(b.defender.id);
  })[0];
}

function resolveSustainedShipWeaponDps(
  attacker: CombatActor,
  defender: CombatActor,
  dist: number,
  range: number,
): number {
  if (range <= 0 || dist > range) return 0;
  if (!attacker.combatStats.damageProfile) return 0;
  if (attacker.combatStats.engagementRange === "orbital") return 0;
  return effectiveDpsAgainst(
    attacker.combatStats.damageProfile,
    defender.defenderArmor,
  );
}

function resolveMissileShipWeaponDps(
  attacker: CombatActor,
  defender: CombatActor,
  dist: number,
): number {
  const payload = attacker.combatStats.missilePayload;
  if (!payload) return 0;
  const range =
    engagementRangeToSectorDistance(payload.maxRange) *
    weaponRangeMultiplierFor(attacker);
  if (range <= 0 || dist > range) return 0;
  return resolveMissilePayloadDps(attacker.combatStats, {
    combatStats: defender.combatStats,
    defenderArmor: defender.defenderArmor,
  });
}

function isAttackerActive(actor: CombatActor): boolean {
  if (actor.status === "destroyed" || actor.status === "building") return false;
  if (actor.hp <= 0) return false;
  if (!actor.position) return false;
  return canTargetShips(actor.combatStats);
}

function isDefenderTargetable(actor: CombatActor): boolean {
  if (actor.status === "destroyed" || actor.status === "building") return false;
  if (actor.hp <= 0) return false;
  if (!actor.position) return false;
  return isShipTargetClass(actor.combatStats.targetClass);
}

function weaponRangeMultiplierFor(actor: {
  weaponRangeMultiplier?: number;
}): number {
  const multiplier = actor.weaponRangeMultiplier ?? 1;
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

function sameCombatSystem(
  attacker: Pick<CombatActor, "hostSystem">,
  defender: Pick<CombatActor, "hostSystem">,
): boolean {
  if (!attacker.hostSystem || !defender.hostSystem) return false;
  return attacker.hostSystem.id === defender.hostSystem.id;
}

function planarDistance(
  a: { x: number; y: number } | null,
  b: { x: number; y: number } | null,
): number | null {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Compute elapsed-time damage for one defender from the set of hits targeting it.
 *
 * Idempotent: if invoked twice in succession (small dt on the second call), the
 * second invocation applies near-zero additional damage. The MAX-DT cap absorbs
 * gaps when a defender re-enters combat after drifting out of range.
 */
export function computeTickDamage(
  defender: Pick<CombatActor, "lastCombatTickAtMs">,
  totalDps: number,
  nowMs: number,
  options: { timeScale?: number } = {},
): number {
  if (totalDps <= 0) return 0;
  if (isFreshCombatTouch(defender, nowMs)) return 0;
  const lastCombatTickAtMs = defender.lastCombatTickAtMs;
  if (lastCombatTickAtMs == null) return 0;
  const dtMs = Math.max(0, nowMs - lastCombatTickAtMs);
  const dtSec = Math.min(COMBAT_TICK_MAX_DT_SEC, dtMs / 1000);
  const timeScale = finitePositiveScale(options.timeScale);
  return totalDps * dtSec * timeScale;
}

function finitePositiveScale(value: number | undefined): number {
  if (value === undefined) return 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function isFreshCombatTouch(
  defender: Pick<CombatActor, "lastCombatTickAtMs">,
  nowMs: number,
): boolean {
  if (defender.lastCombatTickAtMs == null) return true;
  const dtMs = Math.max(0, nowMs - defender.lastCombatTickAtMs);
  return dtMs > COMBAT_REENGAGEMENT_RESET_SEC * 1000;
}

export function sumDpsPerDefender(hits: AttackerHit[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const hit of hits) {
    totals.set(
      hit.defenderId,
      (totals.get(hit.defenderId) ?? 0) + hit.effectiveDps,
    );
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Bomber → building targeting (orbital range, surface targets).
// ---------------------------------------------------------------------------

export interface BomberActor {
  id: string;
  ownerId: string;
  status: string;
  hp: number;
  combatStats: CombatStats;
  /** System the bomber currently occupies; orbital bombers must be in-system to bomb. */
  hostSystemId: string | null;
  /** Current planar light-year position inside the combat space. */
  position: { x: number; y: number } | null;
  /** Weapons research multiplier for this owner's orbital acquisition range. */
  weaponRangeMultiplier?: number;
}

export interface BuildingTarget {
  id: string;
  planetId: string;
  systemId: string;
  ownerId: string | null;
  /** `command_center` is a special last-resort target; everything else is a non-CC priority target. */
  targetClass: "building" | "command_center";
  armor: number;
  hp: number;
  destroyed: boolean;
  /** Current planar light-year position of the surface target. */
  position: { x: number; y: number } | null;
  lastCombatTickAtMs: number | null;
}

export interface BomberHit {
  bomberId: string;
  buildingId: string;
  planetId: string;
  effectiveDps: number;
}

/**
 * Pick the single building a bomber targets this tick. Non-Command-Center
 * structures take priority — Command Centers are only attacked when every
 * other valid target on the planet is already down. Order within each tier
 * is deterministic by building id for reproducible tests.
 */
export function selectBomberTargetForPlanet(
  buildings: BuildingTarget[],
): BuildingTarget | null {
  const alive = buildings.filter((b) => !b.destroyed && b.hp > 0);
  if (alive.length === 0) return null;
  const sorted = alive.slice().sort((a, b) => a.id.localeCompare(b.id));
  const nonCc = sorted.find((b) => b.targetClass !== "command_center");
  if (nonCc) return nonCc;
  return sorted.find((b) => b.targetClass === "command_center") ?? null;
}

/**
 * Resolve every (bomber, building) hit for the current tick.
 *
 * - Bomber must be a non-destroyed military hull with an `orbital` damage
 *   profile, a known host system, and a resolved tactical position.
 * - The bomber engages every enemy-owned planet inside that system,
 *   targeting one building per planet (priority: non-CC, then CC).
 * - Pure function: no DB I/O; the orchestrator collects targets and applies
 *   damage idempotently against `lastCombatTickAt`.
 */
export function resolveBomberHits(
  bombers: BomberActor[],
  buildingsByPlanet: Map<string, BuildingTarget[]>,
): BomberHit[] {
  const hits: BomberHit[] = [];

  for (const bomber of bombers) {
    if (!isBomberActive(bomber)) continue;
    if (!bomber.hostSystemId) continue;
    if (!bomber.position) continue;
    const range =
      bombardmentRangeToSectorDistance(bomber.combatStats) *
      weaponRangeMultiplierFor(bomber);
    if (range <= 0) continue;

    for (const [planetId, planetBuildings] of buildingsByPlanet) {
      if (planetBuildings.length === 0) continue;
      const planetSystemId = planetBuildings[0].systemId;
      if (planetSystemId !== bomber.hostSystemId) continue;

      const hostileBuildings = planetBuildings.filter(
        (b) => b.ownerId && b.ownerId !== bomber.ownerId,
      );
      if (hostileBuildings.length === 0) continue;

      const target = selectBomberTargetForPlanet(hostileBuildings);
      if (!target) continue;
      const dist = planarDistance(bomber.position, target.position);
      if (dist === null || dist > range) continue;

      const eff = effectiveDpsAgainst(
        bomber.combatStats.damageProfile,
        target.armor,
      );
      if (eff <= 0) continue;

      hits.push({
        bomberId: bomber.id,
        buildingId: target.id,
        planetId,
        effectiveDps: eff,
      });
    }
  }

  return hits;
}

export function sumDpsPerBuilding(hits: BomberHit[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const hit of hits) {
    totals.set(
      hit.buildingId,
      (totals.get(hit.buildingId) ?? 0) + hit.effectiveDps,
    );
  }
  return totals;
}

function isBomberActive(actor: BomberActor): boolean {
  if (actor.status === "destroyed" || actor.status === "building") return false;
  if (actor.hp <= 0) return false;
  const stats = actor.combatStats;
  if (!stats?.damageProfile || stats.engagementRange !== "orbital")
    return false;
  return true;
}
