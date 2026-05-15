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
