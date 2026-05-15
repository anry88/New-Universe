import { describe, expect, it } from 'vitest';
import {
  COMBAT_TICK_MAX_DT_SEC,
  computeTickDamage,
  isDefenderProtectedFromAttacker,
  resolveAttackerHits,
  resolveBomberHits,
  selectBomberTargetForPlanet,
  sumDpsPerBuilding,
  sumDpsPerDefender,
  type BomberActor,
  type BuildingTarget,
  type CombatActor,
} from './engine.js';
import { engagementRangeToSectorDistance, effectiveDpsAgainst } from '@shared/types/combat.js';

const lightFighterStats = {
  targetClass: 'military_light' as const,
  damageProfile: { damageType: 'kinetic' as const, dps: 30, armorPenetration: 0.2, shieldMultiplier: 1.0 },
  engagementRange: 'close' as const,
};

const lightLaserStats = {
  targetClass: 'military_light' as const,
  damageProfile: { damageType: 'energy' as const, dps: 60, armorPenetration: 0.4, shieldMultiplier: 1.5 },
  engagementRange: 'long' as const,
};

const rocketCarrierStats = {
  targetClass: 'military_medium' as const,
  missilePayload: {
    damageType: 'explosive' as const,
    alphaDamage: 1500,
    reloadSec: 30,
    armorPenetration: 0.35,
    shieldMultiplier: 0.8,
    validTargetClasses: ['military_medium' as const, 'military_heavy' as const],
    evasionCounterThreshold: 0.3,
    maxRange: 'long' as const,
  },
};

const lightBomberStats = {
  targetClass: 'building' as const,
  damageProfile: { damageType: 'explosive' as const, dps: 100, armorPenetration: 0.1, shieldMultiplier: 0.5 },
  engagementRange: 'orbital' as const,
};

const civilianStats = { targetClass: 'civilian' as const };

function makeActor(overrides: Partial<CombatActor>): CombatActor {
  return {
    id: 'ship-' + Math.random().toString(36).slice(2, 8),
    ownerId: 'owner-a',
    status: 'idle',
    hp: 100,
    combatStats: civilianStats,
    defenderArmor: 0,
    position: { x: 0, y: 0 },
    hostSystem: null,
    lastCombatTickAtMs: null,
    ...overrides,
  };
}

describe('combat engine — engagement range', () => {
  it('maps engagement ranges to sector distances', () => {
    expect(engagementRangeToSectorDistance('close')).toBe(1);
    expect(engagementRangeToSectorDistance('medium')).toBe(3);
    expect(engagementRangeToSectorDistance('long')).toBe(8);
    expect(engagementRangeToSectorDistance('orbital')).toBe(0);
    expect(engagementRangeToSectorDistance(undefined)).toBe(0);
  });
});

describe('combat engine — effectiveDpsAgainst', () => {
  it('reduces dps by armor scaled by (1 - armorPenetration)', () => {
    expect(effectiveDpsAgainst(lightFighterStats.damageProfile, 0)).toBe(30);
    // armor=5, armorPenetration=0.2 → reduction = 5*0.8 = 4 → 30-4 = 26
    expect(effectiveDpsAgainst(lightFighterStats.damageProfile, 5)).toBe(26);
    // laser armor=5, ap=0.4 → reduction = 5*0.6 = 3 → 60-3 = 57
    expect(effectiveDpsAgainst(lightLaserStats.damageProfile, 5)).toBe(57);
  });

  it('clamps to a positive floor for heavy armor', () => {
    expect(effectiveDpsAgainst(lightFighterStats.damageProfile, 9999)).toBe(1);
  });

  it('returns 0 when no damage profile', () => {
    expect(effectiveDpsAgainst(undefined, 0)).toBe(0);
  });
});

describe('combat engine — isDefenderProtectedFromAttacker', () => {
  it('protects ships in a foreign home system from outside attackers', () => {
    const attacker = { ownerId: 'A', hostSystem: { id: 'sys1', isHome: false, ownerId: null } };
    const defender = { hostSystem: { id: 'sys-home-B', isHome: true, ownerId: 'B' } };
    expect(isDefenderProtectedFromAttacker(attacker, defender)).toBe(true);
  });

  it('does NOT protect when attacker is inside the same home system', () => {
    const attacker = { ownerId: 'A', hostSystem: { id: 'sys-home-B', isHome: true, ownerId: 'B' } };
    const defender = { hostSystem: { id: 'sys-home-B', isHome: true, ownerId: 'B' } };
    expect(isDefenderProtectedFromAttacker(attacker, defender)).toBe(false);
  });

  it('does NOT protect when defender is in their OWN home (i.e. attacker IS the home owner)', () => {
    const attacker = { ownerId: 'B', hostSystem: null };
    const defender = { hostSystem: { id: 'sys-home-B', isHome: true, ownerId: 'B' } };
    expect(isDefenderProtectedFromAttacker(attacker, defender)).toBe(false);
  });

  it('does NOT protect non-home systems', () => {
    const attacker = { ownerId: 'A', hostSystem: null };
    const defender = { hostSystem: { id: 'sys-neutral', isHome: false, ownerId: null } };
    expect(isDefenderProtectedFromAttacker(attacker, defender)).toBe(false);
  });

  it('does NOT protect in-flight defenders (no host system)', () => {
    const attacker = { ownerId: 'A', hostSystem: null };
    const defender = { hostSystem: null };
    expect(isDefenderProtectedFromAttacker(attacker, defender)).toBe(false);
  });
});

describe('combat engine — resolveAttackerHits', () => {
  it('matches a close-range fighter with an enemy civilian in same system', () => {
    const fighter = makeActor({
      id: 'F', ownerId: 'A', combatStats: lightFighterStats, position: { x: 10, y: 10 },
    });
    const scout = makeActor({
      id: 'S', ownerId: 'B', combatStats: civilianStats, position: { x: 10, y: 10 }, defenderArmor: 0,
    });
    const hits = resolveAttackerHits([fighter, scout]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ attackerId: 'F', defenderId: 'S' });
    expect(hits[0].effectiveDps).toBe(30);
  });

  it('does NOT match attackers and defenders of the same owner', () => {
    const a = makeActor({ id: 'F', ownerId: 'A', combatStats: lightFighterStats, position: { x: 0, y: 0 } });
    const b = makeActor({ id: 'S', ownerId: 'A', combatStats: civilianStats, position: { x: 0, y: 0 } });
    expect(resolveAttackerHits([a, b])).toHaveLength(0);
  });

  it('does NOT match when defender is out of range', () => {
    const a = makeActor({ id: 'F', ownerId: 'A', combatStats: lightFighterStats, position: { x: 0, y: 0 } });
    const b = makeActor({ id: 'S', ownerId: 'B', combatStats: civilianStats, position: { x: 5, y: 0 } });
    // close range = 1 sector, defender at 5 sectors
    expect(resolveAttackerHits([a, b])).toHaveLength(0);
  });

  it('a light laser reaches further than a fighter (long > close)', () => {
    const laser = makeActor({ id: 'L', ownerId: 'A', combatStats: lightLaserStats, position: { x: 0, y: 0 } });
    const defender = makeActor({
      id: 'X', ownerId: 'B', combatStats: civilianStats, position: { x: 5, y: 0 },
    });
    expect(resolveAttackerHits([laser, defender])).toHaveLength(1);
  });

  it('skips bombers (orbital range) — they cannot target ships', () => {
    const bomber = makeActor({ id: 'B', ownerId: 'A', combatStats: lightBomberStats, position: { x: 0, y: 0 } });
    const defender = makeActor({ id: 'S', ownerId: 'B', combatStats: civilianStats, position: { x: 0, y: 0 } });
    expect(resolveAttackerHits([bomber, defender])).toHaveLength(0);
  });

  it('skips destroyed attackers and defenders', () => {
    const dead = makeActor({
      id: 'D', ownerId: 'A', combatStats: lightFighterStats, status: 'destroyed', hp: 0, position: { x: 0, y: 0 },
    });
    const target = makeActor({ id: 'T', ownerId: 'B', combatStats: civilianStats, position: { x: 0, y: 0 } });
    expect(resolveAttackerHits([dead, target])).toHaveLength(0);

    const live = makeActor({ id: 'L', ownerId: 'A', combatStats: lightFighterStats, position: { x: 0, y: 0 } });
    const deadDef = makeActor({
      id: 'X', ownerId: 'B', combatStats: civilianStats, status: 'destroyed', hp: 0, position: { x: 0, y: 0 },
    });
    expect(resolveAttackerHits([live, deadDef])).toHaveLength(0);
  });

  it('respects foreign-home-system protection', () => {
    const homeSys = { id: 'sys-home-B', isHome: true, ownerId: 'B' as string | null };
    const attacker = makeActor({
      id: 'F', ownerId: 'A', combatStats: lightLaserStats, position: { x: 0, y: 0 },
      hostSystem: { id: 'sys-neutral', isHome: false, ownerId: null },
    });
    const defender = makeActor({
      id: 'S', ownerId: 'B', combatStats: civilianStats, position: { x: 1, y: 0 },
      hostSystem: homeSys,
    });
    expect(resolveAttackerHits([attacker, defender])).toHaveLength(0);

    // But attacker INSIDE the home system can hit.
    const insideAttacker = makeActor({
      id: 'I', ownerId: 'A', combatStats: lightLaserStats, position: { x: 0, y: 0 },
      hostSystem: homeSys,
    });
    expect(resolveAttackerHits([insideAttacker, defender])).toHaveLength(1);
  });

  it('aggregates hits from multiple attackers on one defender', () => {
    const a = makeActor({ id: 'A', ownerId: 'OA', combatStats: lightFighterStats, position: { x: 0, y: 0 } });
    const b = makeActor({ id: 'B', ownerId: 'OA', combatStats: lightFighterStats, position: { x: 0, y: 0 } });
    const t = makeActor({ id: 'T', ownerId: 'OB', combatStats: civilianStats, position: { x: 0, y: 0 } });
    const hits = resolveAttackerHits([a, b, t]);
    const dps = sumDpsPerDefender(hits);
    expect(dps.get('T')).toBe(60);
  });

  it('applies rocket-carrier payload pressure at long range against medium/heavy hulls', () => {
    const carrier = makeActor({ id: 'RC', ownerId: 'A', combatStats: rocketCarrierStats, position: { x: 0, y: 0 } });
    const cruiser = makeActor({
      id: 'C',
      ownerId: 'B',
      combatStats: { targetClass: 'military_medium', evasion: 0.1 },
      defenderArmor: 20,
      position: { x: 7, y: 0 },
    });
    const hits = resolveAttackerHits([carrier, cruiser]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ attackerId: 'RC', defenderId: 'C' });
    expect(hits[0].effectiveDps).toBe(37);
  });

  it('keeps rocket carriers countered by light or evasive hulls', () => {
    const carrier = makeActor({ id: 'RC', ownerId: 'A', combatStats: rocketCarrierStats, position: { x: 0, y: 0 } });
    const light = makeActor({
      id: 'LF',
      ownerId: 'B',
      combatStats: { targetClass: 'military_light', evasion: 0.1 },
      position: { x: 0, y: 0 },
    });
    const evasiveMedium = makeActor({
      id: 'EM',
      ownerId: 'B',
      combatStats: { targetClass: 'military_medium', evasion: 0.3 },
      position: { x: 0, y: 0 },
    });
    expect(resolveAttackerHits([carrier, light, evasiveMedium])).toHaveLength(0);
  });
});

describe('combat engine — computeTickDamage', () => {
  it('returns 0 on first touch (no prior lastCombatTickAt)', () => {
    const defender = { lastCombatTickAtMs: null };
    expect(computeTickDamage(defender, 30, 10_000)).toBe(0);
  });

  it('applies dps * dt seconds otherwise', () => {
    const defender = { lastCombatTickAtMs: 10_000 };
    // 10s elapsed, 30 dps → 300 damage
    expect(computeTickDamage(defender, 30, 20_000)).toBe(300);
  });

  it('caps elapsed time at COMBAT_TICK_MAX_DT_SEC', () => {
    const defender = { lastCombatTickAtMs: 0 };
    // 1 hour elapsed, capped to 30s, 30 dps → 900 damage
    expect(computeTickDamage(defender, 30, 3_600_000)).toBe(30 * COMBAT_TICK_MAX_DT_SEC);
  });

  it('returns 0 when totalDps is 0', () => {
    expect(computeTickDamage({ lastCombatTickAtMs: 0 }, 0, 10_000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bomber → building targeting (P3-COM-007).
// ---------------------------------------------------------------------------

function makeBuilding(overrides: Partial<BuildingTarget>): BuildingTarget {
  return {
    id: 'B-' + Math.random().toString(36).slice(2, 8),
    planetId: 'planet-1',
    systemId: 'sys-1',
    ownerId: 'owner-target',
    targetClass: 'building',
    armor: 0,
    hp: 1000,
    destroyed: false,
    lastCombatTickAtMs: null,
    ...overrides,
  };
}

function makeBomber(overrides: Partial<BomberActor> = {}): BomberActor {
  return {
    id: 'X-' + Math.random().toString(36).slice(2, 8),
    ownerId: 'owner-attacker',
    status: 'idle',
    hp: 350,
    combatStats: lightBomberStats,
    hostSystemId: 'sys-1',
    ...overrides,
  };
}

describe('combat engine — selectBomberTargetForPlanet', () => {
  it('picks a non-CC building before the Command Center', () => {
    const cc = makeBuilding({ id: 'B-aaa', targetClass: 'command_center' });
    const mine = makeBuilding({ id: 'B-zzz', targetClass: 'building' });
    expect(selectBomberTargetForPlanet([cc, mine])?.id).toBe('B-zzz');
  });

  it('falls back to the Command Center when every non-CC is destroyed', () => {
    const cc = makeBuilding({ id: 'B-aaa', targetClass: 'command_center' });
    const mine = makeBuilding({ id: 'B-zzz', targetClass: 'building', destroyed: true });
    expect(selectBomberTargetForPlanet([cc, mine])?.id).toBe('B-aaa');
  });

  it('returns null when no building is alive', () => {
    const cc = makeBuilding({ id: 'B-aaa', targetClass: 'command_center', hp: 0 });
    const mine = makeBuilding({ id: 'B-zzz', targetClass: 'building', destroyed: true });
    expect(selectBomberTargetForPlanet([cc, mine])).toBeNull();
  });

  it('is deterministic — sorts by id within each priority tier', () => {
    const a = makeBuilding({ id: 'B-zzz', targetClass: 'building' });
    const b = makeBuilding({ id: 'B-aaa', targetClass: 'building' });
    expect(selectBomberTargetForPlanet([a, b])?.id).toBe('B-aaa');
  });
});

describe('combat engine — resolveBomberHits', () => {
  it('targets one building per enemy planet inside the same system', () => {
    const bomber = makeBomber({ hostSystemId: 'sys-1' });
    const planetA: BuildingTarget[] = [
      makeBuilding({ id: 'B-pa1', planetId: 'plA', systemId: 'sys-1', targetClass: 'building' }),
      makeBuilding({ id: 'B-pa2', planetId: 'plA', systemId: 'sys-1', targetClass: 'command_center' }),
    ];
    const planetB: BuildingTarget[] = [
      makeBuilding({ id: 'B-pb1', planetId: 'plB', systemId: 'sys-1', targetClass: 'building' }),
    ];
    const map = new Map<string, BuildingTarget[]>([['plA', planetA], ['plB', planetB]]);
    const hits = resolveBomberHits([bomber], map);
    expect(hits).toHaveLength(2);
    const targets = hits.map((h) => h.buildingId).sort();
    expect(targets).toEqual(['B-pa1', 'B-pb1'].sort());
  });

  it('skips planets in another system', () => {
    const bomber = makeBomber({ hostSystemId: 'sys-1' });
    const farPlanet: BuildingTarget[] = [
      makeBuilding({ id: 'B-far', planetId: 'far', systemId: 'sys-2', targetClass: 'building' }),
    ];
    const map = new Map<string, BuildingTarget[]>([['far', farPlanet]]);
    expect(resolveBomberHits([bomber], map)).toHaveLength(0);
  });

  it('skips planets owned by the bomber\'s player', () => {
    const bomber = makeBomber({ ownerId: 'O1' });
    const friendly: BuildingTarget[] = [
      makeBuilding({ id: 'B-f', ownerId: 'O1', targetClass: 'building' }),
    ];
    expect(resolveBomberHits([bomber], new Map([['p', friendly]]))).toHaveLength(0);
  });

  it('skips planets with no hostile buildings (all destroyed)', () => {
    const bomber = makeBomber({});
    const empty: BuildingTarget[] = [
      makeBuilding({ id: 'B-d1', destroyed: true }),
      makeBuilding({ id: 'B-d2', hp: 0 }),
    ];
    expect(resolveBomberHits([bomber], new Map([['p', empty]]))).toHaveLength(0);
  });

  it('skips in-flight bombers (no host system)', () => {
    const bomber = makeBomber({ hostSystemId: null });
    const targets: BuildingTarget[] = [makeBuilding({})];
    expect(resolveBomberHits([bomber], new Map([['p', targets]]))).toHaveLength(0);
  });

  it('two bombers stack DPS against the same building (priority CC-last still respected)', () => {
    const b1 = makeBomber({ id: 'X1', hostSystemId: 'sys-1' });
    const b2 = makeBomber({ id: 'X2', hostSystemId: 'sys-1' });
    const planet: BuildingTarget[] = [
      makeBuilding({ id: 'B-zzz', targetClass: 'building' }),
      makeBuilding({ id: 'B-aaa', targetClass: 'command_center' }),
    ];
    const hits = resolveBomberHits([b1, b2], new Map([['p', planet]]));
    const dps = sumDpsPerBuilding(hits);
    expect(dps.get('B-zzz')).toBe(200); // both 100 dps bombers stack on the non-CC target
    expect(dps.get('B-aaa')).toBeUndefined();
  });
});
