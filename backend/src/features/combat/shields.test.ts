import { describe, expect, it } from 'vitest';
import type { CombatActor } from './engine.js';
import { normalizeShieldHooks, resolveShieldedDamage } from './shields.js';

const systemA = { id: 'sys-a', isHome: false, ownerId: null };
const systemB = { id: 'sys-b', isHome: false, ownerId: null };

function actor(overrides: Partial<CombatActor>): CombatActor {
  return {
    id: 'actor',
    ownerId: 'owner-a',
    status: 'idle',
    hp: 100,
    combatStats: { targetClass: 'civilian' },
    defenderArmor: 0,
    position: { x: 0, y: 0 },
    hostSystem: systemA,
    lastCombatTickAtMs: 0,
    ...overrides,
  };
}

function shieldActor(overrides: Partial<CombatActor> = {}): CombatActor {
  return actor({
    id: 'shield',
    ownerId: 'owner-b',
    hp: 300,
    combatStats: {
      targetClass: 'military_light',
      shields: {
        capacity: 300,
        currentHp: 300,
        radius: 2,
        rechargeRate: 10,
        delayAfterDamageSec: 5,
        downtimeSec: 20,
        state: 'active',
      },
    },
    ...overrides,
  });
}

describe('combat shields', () => {
  it('absorbs damage before allied hull HP is touched', () => {
    const defender = actor({ id: 'defender', ownerId: 'owner-b' });
    const shield = shieldActor();
    const result = resolveShieldedDamage(
      [actor({ id: 'attacker', ownerId: 'owner-a' }), defender, shield],
      [{ attackerId: 'attacker', defenderId: 'defender', effectiveDps: 100, shieldDps: 100 }],
      1_000,
    );

    expect(result.directDamageByDefender.get('defender') ?? 0).toBe(0);
    expect(result.shieldUpdates.get('shield')?.currentHp).toBe(200);
    expect(result.shieldsDamaged.has('shield')).toBe(true);
  });

  it('uses smallest radius first for overlapping shields, then spills into the next shield', () => {
    const defender = actor({ id: 'defender', ownerId: 'owner-b' });
    const small = shieldActor({
      id: 'small',
      combatStats: {
        targetClass: 'military_light',
        shields: {
          capacity: 50,
          currentHp: 50,
          radius: 1,
          rechargeRate: 10,
          delayAfterDamageSec: 5,
          downtimeSec: 20,
          state: 'active',
        },
      },
    });
    const large = shieldActor({
      id: 'large',
      combatStats: {
        targetClass: 'military_medium',
        shields: {
          capacity: 100,
          currentHp: 100,
          radius: 5,
          rechargeRate: 10,
          delayAfterDamageSec: 5,
          downtimeSec: 20,
          state: 'active',
        },
      },
    });

    const result = resolveShieldedDamage(
      [defender, large, small],
      [{ attackerId: 'attacker', defenderId: 'defender', effectiveDps: 80, shieldDps: 80 }],
      1_000,
    );

    expect(result.shieldUpdates.get('small')?.currentHp).toBe(0);
    expect(result.shieldUpdates.get('small')?.state).toBe('downtime');
    expect(result.shieldUpdates.get('large')?.currentHp).toBe(70);
    expect(result.directDamageByDefender.get('defender') ?? 0).toBe(0);
  });

  it('spills overflow to hull once covering shields are depleted', () => {
    const defender = actor({ id: 'defender', ownerId: 'owner-b' });
    const shield = shieldActor({
      combatStats: {
        targetClass: 'military_light',
        shields: {
          capacity: 50,
          currentHp: 50,
          radius: 2,
          rechargeRate: 10,
          delayAfterDamageSec: 5,
          downtimeSec: 20,
          state: 'active',
        },
      },
    });
    const result = resolveShieldedDamage(
      [defender, shield],
      [{ attackerId: 'attacker', defenderId: 'defender', effectiveDps: 100, shieldDps: 100 }],
      1_000,
    );

    expect(result.shieldUpdates.get('shield')?.currentHp).toBe(0);
    expect(result.directDamageByDefender.get('defender')).toBe(50);
  });

  it('keeps break downtime and recharge idempotent across repeated ticks', () => {
    const broken = {
      capacity: 100,
      currentHp: 0,
      radius: 2,
      rechargeRate: 10,
      delayAfterDamageSec: 5,
      downtimeSec: 20,
      state: 'downtime' as const,
      lastDamagedAt: new Date(0).toISOString(),
      brokenUntil: new Date(20_000).toISOString(),
      lastResolvedAt: new Date(0).toISOString(),
    };

    const duringDowntime = normalizeShieldHooks(broken, 10_000);
    expect(duringDowntime?.currentHp).toBe(0);
    expect(duringDowntime?.state).toBe('downtime');

    const recharged = normalizeShieldHooks(broken, 25_000);
    expect(recharged?.currentHp).toBe(50);
    expect(recharged?.state).toBe('recharging');

    const repeated = normalizeShieldHooks(recharged!, 25_000);
    expect(repeated?.currentHp).toBe(50);
  });

  it('does not protect enemy ships or ships in another combat space', () => {
    const defender = actor({ id: 'defender', ownerId: 'owner-b' });
    const enemyShield = shieldActor({ id: 'enemy-shield', ownerId: 'owner-a' });
    const farFriendlyShield = shieldActor({ id: 'far-shield', hostSystem: systemB });

    const result = resolveShieldedDamage(
      [defender, enemyShield, farFriendlyShield],
      [{ attackerId: 'attacker', defenderId: 'defender', effectiveDps: 100, shieldDps: 100 }],
      1_000,
    );

    expect(result.shieldUpdates.has('enemy-shield')).toBe(false);
    expect(result.shieldUpdates.has('far-shield')).toBe(false);
    expect(result.directDamageByDefender.get('defender')).toBe(100);
  });
});
