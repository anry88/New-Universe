import {
  NUCLEAR_PAYLOAD_PROFILE,
  NUCLEAR_PAYLOAD_RESEARCH_GATE,
  type DamageTargetClass,
  type NuclearPayloadProfile,
} from '@shared/types/combat.js';
import type { ResourceId } from '@shared/types/research.js';
import { meetsResearchRequirement, type ResearchLevelsMap } from '../research/gates.js';
import { isDefenderProtectedFromAttacker } from './engine.js';

export type NuclearPayloadBlockCode =
  | 'target_not_visible'
  | 'target_owned'
  | 'target_neutral'
  | 'target_uncolonized'
  | 'target_protected'
  | 'target_class_blocked'
  | 'missing_research'
  | 'payload_cooldown'
  | 'insufficient_resource';

export interface NuclearPayloadActor {
  id: string;
  ownerId: string;
  researchLevels: ResearchLevelsMap;
  resources: Partial<Record<ResourceId, number>>;
  nextReadyAtMs?: number | null;
  hostSystem: { id: string; isHome: boolean; ownerId: string | null } | null;
}

export interface NuclearPayloadTarget {
  id: string;
  ownerId: string | null;
  targetClass: DamageTargetClass;
  isVisibleToActor: boolean;
  isColonized: boolean;
  activeShieldHp?: number;
  hostSystem: { id: string; isHome: boolean; ownerId: string | null } | null;
}

export interface NuclearPayloadUseContext {
  actor: NuclearPayloadActor;
  target: NuclearPayloadTarget;
  nowMs: number;
  profile?: NuclearPayloadProfile;
}

export interface NuclearPayloadMissingResource {
  resourceId: ResourceId;
  required: number;
  available: number;
}

export type NuclearPayloadUseResult =
  | { allowed: true }
  | {
      allowed: false;
      code: NuclearPayloadBlockCode;
      currentResearchLevel?: number;
      readyAtMs?: number;
      missingResources?: NuclearPayloadMissingResource[];
    };

export interface NuclearPayloadImpact {
  allowed: true;
  directDamage: number;
  shieldDamageApplied: number;
  shieldHpRemaining: number;
}

export type NuclearPayloadImpactResult =
  | NuclearPayloadImpact
  | ({ allowed: false } & Extract<NuclearPayloadUseResult, { allowed: false }>);

export function evaluateNuclearPayloadUse(
  context: NuclearPayloadUseContext,
): NuclearPayloadUseResult {
  const profile: NuclearPayloadProfile = context.profile ?? NUCLEAR_PAYLOAD_PROFILE;
  const { actor, target } = context;

  if (!target.isVisibleToActor) return { allowed: false, code: 'target_not_visible' };
  if (target.ownerId === actor.ownerId) return { allowed: false, code: 'target_owned' };
  if (!target.ownerId) return { allowed: false, code: 'target_neutral' };
  if (isSurfaceTarget(target.targetClass) && !target.isColonized) {
    return { allowed: false, code: 'target_uncolonized' };
  }
  if (isDefenderProtectedFromAttacker(actor, target)) {
    return { allowed: false, code: 'target_protected' };
  }
  if (!profile.validTargetClasses.includes(target.targetClass)) {
    return { allowed: false, code: 'target_class_blocked' };
  }

  if (!meetsResearchRequirement(actor.researchLevels, NUCLEAR_PAYLOAD_RESEARCH_GATE)) {
    return {
      allowed: false,
      code: 'missing_research',
      currentResearchLevel: actor.researchLevels.get(NUCLEAR_PAYLOAD_RESEARCH_GATE.branch) ?? 0,
    };
  }

  const nextReadyAtMs = actor.nextReadyAtMs ?? null;
  if (nextReadyAtMs != null && context.nowMs < nextReadyAtMs) {
    return { allowed: false, code: 'payload_cooldown', readyAtMs: nextReadyAtMs };
  }

  const missingResources = collectMissingResources(profile.resourceCost, actor.resources);
  if (missingResources.length > 0) {
    return { allowed: false, code: 'insufficient_resource', missingResources };
  }

  return { allowed: true };
}

export function resolveNuclearPayloadImpact(
  context: NuclearPayloadUseContext,
): NuclearPayloadImpactResult {
  const allowed = evaluateNuclearPayloadUse(context);
  if (!allowed.allowed) return allowed;

  const profile = context.profile ?? NUCLEAR_PAYLOAD_PROFILE;
  const baseDamage = Math.max(0, profile.baseDamage);
  const shieldHp = Math.max(0, context.target.activeShieldHp ?? 0);
  if (shieldHp <= 0) {
    return {
      allowed: true,
      directDamage: Math.round(baseDamage),
      shieldDamageApplied: 0,
      shieldHpRemaining: 0,
    };
  }

  const shieldDamage = Math.max(0, baseDamage * profile.shieldMultiplier);
  const shieldDamageApplied = Math.min(shieldHp, shieldDamage);
  const shieldHpRemaining = Math.max(0, shieldHp - shieldDamageApplied);
  const spillRatio = shieldDamage <= 0
    ? 1
    : Math.max(0, (shieldDamage - shieldDamageApplied) / shieldDamage);

  return {
    allowed: true,
    directDamage: Math.round(baseDamage * spillRatio),
    shieldDamageApplied: Math.round(shieldDamageApplied),
    shieldHpRemaining: Math.round(shieldHpRemaining),
  };
}

function isSurfaceTarget(targetClass: DamageTargetClass): boolean {
  return targetClass === 'building' || targetClass === 'command_center';
}

function collectMissingResources(
  cost: Partial<Record<ResourceId, number>>,
  available: Partial<Record<ResourceId, number>>,
): NuclearPayloadMissingResource[] {
  const missing: NuclearPayloadMissingResource[] = [];
  for (const [resourceId, required] of Object.entries(cost) as [ResourceId, number][]) {
    const have = Math.floor(Number(available[resourceId] ?? 0));
    if (have < required) {
      missing.push({ resourceId, required, available: have });
    }
  }
  return missing;
}
