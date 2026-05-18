import type { ShieldHooks } from '@shared/types/combat.js';
import {
  computeTickDamage,
  type AttackerHit,
  type CombatActor,
} from './engine.js';

export interface ShieldDamageResolution {
  directDamageByDefender: Map<string, number>;
  shieldUpdates: Map<string, ShieldHooks>;
  touchedDefenderIds: Set<string>;
  shieldsDamaged: Set<string>;
  shieldsBroken: Set<string>;
}

export interface ShieldDamageResolutionOptions {
  damageTimeScale?: number;
}

interface ShieldRuntime {
  actor: CombatActor;
  hooks: ShieldHooks;
  currentHp: number;
}

interface CoveringShield {
  runtime: ShieldRuntime;
  distance: number;
}

const SHIELD_HP_PRECISION = 100;

/**
 * Runtime shield rules:
 * - only same-owner ships in the same combat space can project coverage;
 * - active shields protect hulls while currentHp is above zero;
 * - overlapping shields absorb in smallest-radius order, then nearest
 *   projected center, then ship id for deterministic replay;
 * - overflow spills to the next covering shield, then to hull damage.
 */
export function resolveShieldedDamage(
  actors: CombatActor[],
  hits: AttackerHit[],
  nowMs: number,
  options: ShieldDamageResolutionOptions = {},
): ShieldDamageResolution {
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const runtimeById = new Map<string, ShieldRuntime>();
  const shieldUpdates = new Map<string, ShieldHooks>();

  for (const actor of actors) {
    const normalized = normalizeShieldHooks(actor.combatStats.shields, nowMs);
    if (!normalized) continue;
    runtimeById.set(actor.id, {
      actor,
      hooks: normalized,
      currentHp: normalized.currentHp ?? normalized.capacity,
    });
    if (shieldHooksChanged(actor.combatStats.shields, normalized)) {
      shieldUpdates.set(actor.id, normalized);
    }
  }

  const directDamageByDefender = new Map<string, number>();
  const touchedDefenderIds = new Set<string>();
  const shieldsDamaged = new Set<string>();
  const shieldsBroken = new Set<string>();

  for (const hit of hits) {
    const defender = actorById.get(hit.defenderId);
    if (!defender) continue;
    touchedDefenderIds.add(defender.id);

    const directDamage = computeTickDamage(defender, hit.effectiveDps, nowMs, {
      timeScale: options.damageTimeScale,
    });
    const shieldDamage = computeTickDamage(defender, hit.shieldDps, nowMs, {
      timeScale: options.damageTimeScale,
    });
    if (directDamage <= 0 && shieldDamage <= 0) continue;

    const covering = findCoveringShields(actors, runtimeById, defender);
    if (covering.length === 0 || shieldDamage <= 0) {
      addDamage(directDamageByDefender, defender.id, directDamage);
      continue;
    }

    let remainingShieldDamage = shieldDamage;
    for (const shield of covering) {
      if (remainingShieldDamage <= 0) break;
      const hpBefore = shield.runtime.currentHp;
      if (hpBefore <= 0) continue;

      const absorbed = Math.min(hpBefore, remainingShieldDamage);
      remainingShieldDamage -= absorbed;
      shield.runtime.currentHp = roundShieldHp(hpBefore - absorbed);
      shieldsDamaged.add(shield.runtime.actor.id);

      const nextHooks = applyShieldDamage(
        shield.runtime.hooks,
        shield.runtime.currentHp,
        nowMs,
      );
      shield.runtime.hooks = nextHooks;
      shieldUpdates.set(shield.runtime.actor.id, nextHooks);
      if (nextHooks.state === 'downtime') {
        shieldsBroken.add(shield.runtime.actor.id);
      }
    }

    if (remainingShieldDamage > 0) {
      const overflowRatio = Math.min(1, remainingShieldDamage / shieldDamage);
      addDamage(directDamageByDefender, defender.id, directDamage * overflowRatio);
    }
  }

  return {
    directDamageByDefender,
    shieldUpdates,
    touchedDefenderIds,
    shieldsDamaged,
    shieldsBroken,
  };
}

export function normalizeShieldHooks(
  hooks: ShieldHooks | undefined,
  nowMs: number,
): ShieldHooks | null {
  if (!hooks) return null;
  const capacity = finitePositive(hooks.capacity);
  if (capacity <= 0) return null;

  const radius = Math.max(0, finiteNumber(hooks.radius));
  const rechargeRate = Math.max(0, finiteNumber(hooks.rechargeRate));
  const delayAfterDamageSec = Math.max(0, finiteNumber(hooks.delayAfterDamageSec));
  const downtimeSec = Math.max(0, finiteNumber(hooks.downtimeSec));
  const brokenUntilMs = parseTimeMs(hooks.brokenUntil);
  const lastDamagedMs = parseTimeMs(hooks.lastDamagedAt);
  const lastResolvedMs = parseTimeMs(hooks.lastResolvedAt);

  let currentHp = clamp(
    finiteNumber(hooks.currentHp ?? capacity),
    0,
    capacity,
  );
  let state: ShieldHooks['state'] = hooks.state;
  let brokenUntil = hooks.brokenUntil ?? null;
  let lastResolvedAt = hooks.lastResolvedAt ?? null;

  if (brokenUntilMs != null && nowMs < brokenUntilMs) {
    currentHp = 0;
    state = 'downtime';
  } else {
    const rechargeDelayUntil = lastDamagedMs == null
      ? 0
      : lastDamagedMs + delayAfterDamageSec * 1000;
    const rechargeAvailableFrom = Math.max(
      lastResolvedMs ?? 0,
      brokenUntilMs ?? 0,
      rechargeDelayUntil,
    );

    if (currentHp < capacity && rechargeRate > 0 && nowMs > rechargeAvailableFrom) {
      currentHp = clamp(
        currentHp + rechargeRate * ((nowMs - rechargeAvailableFrom) / 1000),
        0,
        capacity,
      );
      lastResolvedAt = new Date(nowMs).toISOString();
    }

    brokenUntil = null;
    state = currentHp >= capacity
      ? 'active'
      : currentHp > 0
        ? 'recharging'
        : 'recharging';
  }

  return {
    ...hooks,
    capacity,
    radius,
    rechargeRate,
    delayAfterDamageSec,
    downtimeSec,
    currentHp: roundShieldHp(currentHp),
    state,
    lastDamagedAt: hooks.lastDamagedAt ?? null,
    brokenUntil,
    lastResolvedAt,
  };
}

function findCoveringShields(
  actors: CombatActor[],
  runtimeById: Map<string, ShieldRuntime>,
  defender: CombatActor,
): CoveringShield[] {
  if (!defender.position) return [];
  return actors
    .map((actor): CoveringShield | null => {
      const runtime = runtimeById.get(actor.id);
      if (!runtime) return null;
      if (!canProjectShield(actor, runtime, defender)) return null;
      const distance = planarDistance(actor.position, defender.position);
      if (distance == null || distance > runtime.hooks.radius) return null;
      return { runtime, distance };
    })
    .filter((shield): shield is CoveringShield => shield != null)
    .sort((a, b) => {
      const radiusDelta = a.runtime.hooks.radius - b.runtime.hooks.radius;
      if (radiusDelta !== 0) return radiusDelta;
      const distanceDelta = a.distance - b.distance;
      if (distanceDelta !== 0) return distanceDelta;
      return a.runtime.actor.id.localeCompare(b.runtime.actor.id);
    });
}

function canProjectShield(
  actor: CombatActor,
  runtime: ShieldRuntime,
  defender: CombatActor,
): boolean {
  if (actor.ownerId !== defender.ownerId) return false;
  if (actor.status === 'destroyed' || actor.status === 'building') return false;
  if (actor.hp <= 0 || !actor.position) return false;
  if (runtime.currentHp <= 0) return false;
  if (!sameCombatSpace(actor, defender)) return false;
  return true;
}

function sameCombatSpace(a: CombatActor, b: CombatActor): boolean {
  const aSystemId = a.hostSystem?.id ?? null;
  const bSystemId = b.hostSystem?.id ?? null;
  if (aSystemId || bSystemId) return aSystemId === bSystemId;
  return true;
}

function applyShieldDamage(
  hooks: ShieldHooks,
  currentHp: number,
  nowMs: number,
): ShieldHooks {
  const nowIso = new Date(nowMs).toISOString();
  const nextHp = roundShieldHp(currentHp);
  const broken = nextHp <= 0;
  return {
    ...hooks,
    currentHp: nextHp,
    state: broken ? 'downtime' : nextHp >= hooks.capacity ? 'active' : 'recharging',
    lastDamagedAt: nowIso,
    brokenUntil: broken
      ? new Date(nowMs + hooks.downtimeSec * 1000).toISOString()
      : null,
    lastResolvedAt: nowIso,
  };
}

function addDamage(map: Map<string, number>, key: string, damage: number): void {
  if (damage <= 0) return;
  map.set(key, (map.get(key) ?? 0) + damage);
}

function shieldHooksChanged(
  before: ShieldHooks | undefined,
  after: ShieldHooks,
): boolean {
  if (!before) return true;
  return (
    finiteNumber(before.capacity) !== after.capacity ||
    finiteNumber(before.radius) !== after.radius ||
    finiteNumber(before.rechargeRate) !== after.rechargeRate ||
    finiteNumber(before.delayAfterDamageSec) !== after.delayAfterDamageSec ||
    finiteNumber(before.downtimeSec) !== after.downtimeSec ||
    roundShieldHp(finiteNumber(before.currentHp ?? after.capacity)) !== after.currentHp ||
    (before.state ?? null) !== (after.state ?? null) ||
    (before.lastDamagedAt ?? null) !== (after.lastDamagedAt ?? null) ||
    (before.brokenUntil ?? null) !== (after.brokenUntil ?? null) ||
    (before.lastResolvedAt ?? null) !== (after.lastResolvedAt ?? null)
  );
}

function planarDistance(
  a: { x: number; y: number } | null,
  b: { x: number; y: number } | null,
): number | null {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function parseTimeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finitePositive(value: number): number {
  return Math.max(0, finiteNumber(value));
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundShieldHp(value: number): number {
  return Math.round(value * SHIELD_HP_PRECISION) / SHIELD_HP_PRECISION;
}
