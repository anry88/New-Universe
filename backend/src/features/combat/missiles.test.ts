import { describe, expect, it } from 'vitest';
import type { CombatStats, MissilePayloadProfile } from '@shared/types/combat.js';
import {
  canMissilePayloadTarget,
  effectiveMissilePayloadDps,
  resolveMissilePayloadDps,
} from './missiles.js';

const payload: MissilePayloadProfile = {
  damageType: 'explosive',
  alphaDamage: 1500,
  reloadSec: 30,
  armorPenetration: 0.35,
  shieldMultiplier: 0.8,
  validTargetClasses: ['military_medium', 'military_heavy'],
  evasionCounterThreshold: 0.3,
  maxRange: 'long',
};

const rocketCarrierStats: CombatStats = {
  targetClass: 'military_medium',
  missilePayload: payload,
};

describe('missile payload rules', () => {
  it('treats payload damage as abstract alpha values averaged through reload for combat ticks', () => {
    expect(effectiveMissilePayloadDps(payload, 0)).toBe(50);
    expect(effectiveMissilePayloadDps(payload, 20)).toBe(37);
  });

  it('can target medium and heavy military hulls', () => {
    expect(canMissilePayloadTarget(payload, {
      combatStats: { targetClass: 'military_medium', evasion: 0.1 },
    })).toBe(true);
    expect(canMissilePayloadTarget(payload, {
      combatStats: { targetClass: 'military_heavy', evasion: 0.05 },
    })).toBe(true);
  });

  it('does not target light, civilian or high-evasion defenders', () => {
    expect(canMissilePayloadTarget(payload, {
      combatStats: { targetClass: 'military_light', evasion: 0.05 },
    })).toBe(false);
    expect(canMissilePayloadTarget(payload, {
      combatStats: { targetClass: 'civilian', evasion: 0 },
    })).toBe(false);
    expect(canMissilePayloadTarget(payload, {
      combatStats: { targetClass: 'military_medium', evasion: 0.3 },
    })).toBe(false);
  });

  it('returns zero DPS when a target is countered by class or evasion', () => {
    expect(resolveMissilePayloadDps(rocketCarrierStats, {
      combatStats: { targetClass: 'military_light', evasion: 0.1 },
      defenderArmor: 0,
    })).toBe(0);
    expect(resolveMissilePayloadDps(rocketCarrierStats, {
      combatStats: { targetClass: 'military_heavy', evasion: 0.35 },
      defenderArmor: 0,
    })).toBe(0);
  });
});
