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
