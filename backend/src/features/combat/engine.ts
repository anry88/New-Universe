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
  effectiveDpsAgainst,
  engagementRangeToSectorDistance,
  isShipTargetClass,
} from '@shared/types/combat.js';

/**
 * Upper bound on the elapsed-time window applied to a single combat tick.
 * Caps damage when a defender re-engages after a gap, so re-engagement bursts
 * cannot one-shot anyone that drifted in and out of the combat scope.
 */
export const COMBAT_TICK_MAX_DT_SEC = 30;

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
  /** ms epoch of the last combat tick that touched this defender, or null on first contact. */
  lastCombatTickAtMs: number | null;
}

export interface AttackerHit {
  attackerId: string;
  defenderId: string;
  /** Effective DPS this attacker deals to this defender (post-armor). */
  effectiveDps: number;
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
  attacker: Pick<CombatActor, 'ownerId' | 'hostSystem'>,
  defender: Pick<CombatActor, 'hostSystem'>,
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
    const range = engagementRangeToSectorDistance(
      attacker.combatStats.engagementRange as EngagementRange | undefined,
    );
    if (range <= 0) continue;

    for (const defender of actors) {
      if (defender.id === attacker.id) continue;
      if (defender.ownerId === attacker.ownerId) continue;
      if (!isDefenderTargetable(defender)) continue;
      if (isDefenderProtectedFromAttacker(attacker, defender)) continue;

      const dist = planarDistance(attacker.position, defender.position);
      if (dist === null || dist > range) continue;

      const eff = effectiveDpsAgainst(
        attacker.combatStats.damageProfile,
        defender.defenderArmor,
      );
      if (eff <= 0) continue;

      hits.push({ attackerId: attacker.id, defenderId: defender.id, effectiveDps: eff });
    }
  }

  return hits;
}

function isAttackerActive(actor: CombatActor): boolean {
  if (actor.status === 'destroyed' || actor.status === 'building') return false;
  if (actor.hp <= 0) return false;
  if (!actor.position) return false;
  return canTargetShips(actor.combatStats);
}

function isDefenderTargetable(actor: CombatActor): boolean {
  if (actor.status === 'destroyed' || actor.status === 'building') return false;
  if (actor.hp <= 0) return false;
  if (!actor.position) return false;
  return isShipTargetClass(actor.combatStats.targetClass);
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
  defender: Pick<CombatActor, 'lastCombatTickAtMs'>,
  totalDps: number,
  nowMs: number,
): number {
  if (totalDps <= 0) return 0;
  if (defender.lastCombatTickAtMs == null) return 0;
  const dtMs = Math.max(0, nowMs - defender.lastCombatTickAtMs);
  const dtSec = Math.min(COMBAT_TICK_MAX_DT_SEC, dtMs / 1000);
  return totalDps * dtSec;
}

export function sumDpsPerDefender(hits: AttackerHit[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const hit of hits) {
    totals.set(hit.defenderId, (totals.get(hit.defenderId) ?? 0) + hit.effectiveDps);
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
  /** System the bomber is currently docked at; orbital bombers must be in-system to bomb. */
  hostSystemId: string | null;
}

export interface BuildingTarget {
  id: string;
  planetId: string;
  systemId: string;
  ownerId: string | null;
  /** `command_center` is a special last-resort target; everything else is a non-CC priority target. */
  targetClass: 'building' | 'command_center';
  armor: number;
  hp: number;
  destroyed: boolean;
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
  const nonCc = sorted.find((b) => b.targetClass !== 'command_center');
  if (nonCc) return nonCc;
  return sorted.find((b) => b.targetClass === 'command_center') ?? null;
}

/**
 * Resolve every (bomber, building) hit for the current tick.
 *
 * - Bomber must be a non-destroyed military hull with an `orbital` damage
 *   profile and a known host system (in-flight bombers cannot drop ordnance).
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

      const eff = effectiveDpsAgainst(bomber.combatStats.damageProfile, target.armor);
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
    totals.set(hit.buildingId, (totals.get(hit.buildingId) ?? 0) + hit.effectiveDps);
  }
  return totals;
}

function isBomberActive(actor: BomberActor): boolean {
  if (actor.status === 'destroyed' || actor.status === 'building') return false;
  if (actor.hp <= 0) return false;
  const stats = actor.combatStats;
  if (!stats?.damageProfile || stats.engagementRange !== 'orbital') return false;
  return true;
}
