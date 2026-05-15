export type DamageTargetClass = 
  | 'civilian'
  | 'military_light'
  | 'military_medium'
  | 'military_heavy'
  | 'building'
  | 'command_center';

export type DamageType = 'kinetic' | 'energy' | 'explosive' | 'thermal';

export interface DamageProfile {
  damageType: DamageType;
  dps: number;
  armorPenetration: number;
  shieldMultiplier: number;
}

export type EngagementRange = 'close' | 'medium' | 'long' | 'orbital';

export interface ShieldHooks {
  capacity: number;
  rechargeRate: number;
  delayAfterDamageSec: number;
}

export type DestructionState = 'intact' | 'damaged' | 'disabled' | 'destroyed';

export interface CombatStats {
  targetClass: DamageTargetClass;
  damageProfile?: DamageProfile;
  engagementRange?: EngagementRange;
  shields?: ShieldHooks;
  armor?: number;
  evasion?: number;
}

/** Persistent `ships.status` value applied when HP drops to zero in combat. */
export const SHIP_STATUS_DESTROYED = 'destroyed';

/**
 * Engagement range mapped to a planar sector-grid radius. Numbers are tuning
 * constants for the combat tick engine — keep deterministic for tests.
 * - `close`:    short-range kinetic gunnery, brawl distance.
 * - `medium`:   standard ship-to-ship cannons.
 * - `long`:     beam weapons that can reach across nearby systems.
 * - `orbital`:  planet-bombing range, used for surface targets only.
 */
export const ENGAGEMENT_RANGE_SECTOR_DISTANCE: Record<EngagementRange, number> = {
  close: 1,
  medium: 3,
  long: 8,
  orbital: 0,
};

export function engagementRangeToSectorDistance(range: EngagementRange | undefined): number {
  if (!range) return 0;
  return ENGAGEMENT_RANGE_SECTOR_DISTANCE[range];
}

/**
 * Effective damage-per-second after armor mitigation.
 * armorPenetration ∈ [0,1]: 0 → full armor reduction, 1 → ignores armor entirely.
 * Result is clamped to a small positive floor so even heavy armor leaks chip damage.
 */
export function effectiveDpsAgainst(
  profile: DamageProfile | undefined,
  defenderArmor: number,
): number {
  if (!profile) return 0;
  const armorReduction = Math.max(0, defenderArmor) * (1 - profile.armorPenetration);
  return Math.max(1, profile.dps - armorReduction);
}

/** True when the unit can engage another ship (i.e. its weapon is not surface-only). */
export function canTargetShips(stats: CombatStats | undefined): boolean {
  if (!stats?.damageProfile || !stats.engagementRange) return false;
  return stats.engagementRange !== 'orbital';
}

/** True when the unit is a valid ship target (any military or civilian ship hull class). */
export function isShipTargetClass(targetClass: DamageTargetClass): boolean {
  return (
    targetClass === 'civilian' ||
    targetClass === 'military_light' ||
    targetClass === 'military_medium' ||
    targetClass === 'military_heavy'
  );
}
