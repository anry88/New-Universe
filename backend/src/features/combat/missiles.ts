import {
  type CombatStats,
  type MissilePayloadProfile,
  effectiveDpsAgainst,
  isShipTargetClass,
  missilePayloadSustainedDps,
} from '@shared/types/combat.js';

export interface MissileTargetContext {
  combatStats: CombatStats;
  defenderArmor: number;
}

export function canMissilePayloadTarget(
  payload: MissilePayloadProfile | undefined,
  defender: Pick<MissileTargetContext, 'combatStats'>,
): boolean {
  if (!payload) return false;
  const targetClass = defender.combatStats.targetClass;
  if (!isShipTargetClass(targetClass)) return false;
  if (!payload.validTargetClasses.includes(targetClass)) return false;

  const defenderEvasion = defender.combatStats.evasion ?? 0;
  return defenderEvasion < payload.evasionCounterThreshold;
}

export function effectiveMissilePayloadDps(
  payload: MissilePayloadProfile | undefined,
  defenderArmor: number,
): number {
  if (!payload) return 0;
  const averageProfile = {
    damageType: payload.damageType,
    dps: missilePayloadSustainedDps(payload),
    armorPenetration: payload.armorPenetration,
    shieldMultiplier: payload.shieldMultiplier,
  };
  return effectiveDpsAgainst(averageProfile, defenderArmor);
}

export function resolveMissilePayloadDps(
  attackerStats: CombatStats,
  defender: MissileTargetContext,
): number {
  const payload = attackerStats.missilePayload;
  if (!canMissilePayloadTarget(payload, defender)) return 0;
  return effectiveMissilePayloadDps(payload, defender.defenderArmor);
}
