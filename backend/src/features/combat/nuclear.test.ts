import { describe, expect, it } from 'vitest';
import {
  NUCLEAR_PAYLOAD_COOLDOWN_SEC,
  NUCLEAR_PAYLOAD_PROFILE,
  NUCLEAR_PAYLOAD_RESOURCE_COST,
} from '@shared/types/combat.js';
import type { ResourceId } from '@shared/types/research.js';
import { levelsMapFromRows } from '../research/gates.js';
import {
  evaluateNuclearPayloadUse,
  resolveNuclearPayloadImpact,
  type NuclearPayloadActor,
  type NuclearPayloadTarget,
} from './nuclear.js';

const neutralSystem = { id: 'sys-common', isHome: false, ownerId: null };
const foreignHomeSystem = { id: 'sys-home-b', isHome: true, ownerId: 'owner-b' };

const fullCost = Object.fromEntries(
  Object.entries(NUCLEAR_PAYLOAD_RESOURCE_COST).map(([resourceId, amount]) => [
    resourceId,
    Number(amount) * 2,
  ]),
) as Partial<Record<ResourceId, number>>;

function actor(overrides: Partial<NuclearPayloadActor> = {}): NuclearPayloadActor {
  return {
    id: 'actor-a',
    ownerId: 'owner-a',
    researchLevels: levelsMapFromRows([{ branch: 'weapons', level: 5 }]),
    resources: fullCost,
    hostSystem: neutralSystem,
    ...overrides,
  };
}

function target(overrides: Partial<NuclearPayloadTarget> = {}): NuclearPayloadTarget {
  return {
    id: 'target-b',
    ownerId: 'owner-b',
    targetClass: 'military_heavy',
    isVisibleToActor: true,
    isColonized: true,
    hostSystem: neutralSystem,
    ...overrides,
  };
}

describe('nuclear payload rules', () => {
  it('blocks use until Weapons V is complete', () => {
    const result = evaluateNuclearPayloadUse({
      actor: actor({ researchLevels: levelsMapFromRows([{ branch: 'weapons', level: 4 }]) }),
      target: target(),
      nowMs: 10_000,
    });

    expect(result).toEqual({
      allowed: false,
      code: 'missing_research',
      currentResearchLevel: 4,
    });
  });

  it('allows visible hostile late-tier targets only when cost and cooldown gates pass', () => {
    const result = evaluateNuclearPayloadUse({
      actor: actor(),
      target: target(),
      nowMs: 10_000,
    });

    expect(result).toEqual({ allowed: true });
    expect(NUCLEAR_PAYLOAD_RESOURCE_COST.uranium).toBeGreaterThan(0);
    expect(NUCLEAR_PAYLOAD_RESOURCE_COST.tritium).toBeGreaterThan(0);
    expect(NUCLEAR_PAYLOAD_RESOURCE_COST.antimatter).toBeGreaterThan(0);
    expect(NUCLEAR_PAYLOAD_COOLDOWN_SEC).toBeGreaterThanOrEqual(6 * 60 * 60);
  });

  it('blocks use while the abstract payload cooldown is active', () => {
    const result = evaluateNuclearPayloadUse({
      actor: actor({ nextReadyAtMs: 30_000 }),
      target: target(),
      nowMs: 10_000,
    });

    expect(result).toEqual({
      allowed: false,
      code: 'payload_cooldown',
      readyAtMs: 30_000,
    });
  });

  it('spends shield coverage before direct target damage can spill through', () => {
    const fullShield = resolveNuclearPayloadImpact({
      actor: actor(),
      target: target({
        activeShieldHp: NUCLEAR_PAYLOAD_PROFILE.baseDamage * NUCLEAR_PAYLOAD_PROFILE.shieldMultiplier,
      }),
      nowMs: 10_000,
    });
    expect(fullShield).toMatchObject({
      allowed: true,
      directDamage: 0,
      shieldHpRemaining: 0,
    });

    const halfShield = resolveNuclearPayloadImpact({
      actor: actor(),
      target: target({
        activeShieldHp: (NUCLEAR_PAYLOAD_PROFILE.baseDamage * NUCLEAR_PAYLOAD_PROFILE.shieldMultiplier) / 2,
      }),
      nowMs: 10_000,
    });
    expect(halfShield).toMatchObject({
      allowed: true,
      directDamage: Math.round(NUCLEAR_PAYLOAD_PROFILE.baseDamage / 2),
    });
  });

  it('does not bypass visibility, ownership, neutral, protected-home or surface settlement rules', () => {
    expect(evaluateNuclearPayloadUse({
      actor: actor(),
      target: target({ isVisibleToActor: false }),
      nowMs: 10_000,
    })).toMatchObject({ allowed: false, code: 'target_not_visible' });

    expect(evaluateNuclearPayloadUse({
      actor: actor(),
      target: target({ ownerId: 'owner-a' }),
      nowMs: 10_000,
    })).toMatchObject({ allowed: false, code: 'target_owned' });

    expect(evaluateNuclearPayloadUse({
      actor: actor(),
      target: target({ ownerId: null }),
      nowMs: 10_000,
    })).toMatchObject({ allowed: false, code: 'target_neutral' });

    expect(evaluateNuclearPayloadUse({
      actor: actor({ hostSystem: neutralSystem }),
      target: target({ hostSystem: foreignHomeSystem }),
      nowMs: 10_000,
    })).toMatchObject({ allowed: false, code: 'target_protected' });

    expect(evaluateNuclearPayloadUse({
      actor: actor(),
      target: target({ targetClass: 'building', isColonized: false }),
      nowMs: 10_000,
    })).toMatchObject({ allowed: false, code: 'target_uncolonized' });
  });
});
