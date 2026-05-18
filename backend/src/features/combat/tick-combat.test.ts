import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import {
  buildings,
  colonies,
  discoveredPlanets,
  expeditions,
  notifications,
  planets,
  ships,
  shipTypes,
  systems,
  users,
} from '../../db/schema.js';
import { generateHomeSystem } from '../world/home-system-generator.js';
import { seedShipTypes } from '../../db/seed/ship-types.js';
import { seedResources } from '../../db/seed/resources.js';
import { seedBuildingTypes } from '../../db/seed/building-types.js';
import { processDueCombat } from './tick-combat.js';
import { SHIP_STATUS_DESTROYED } from '@shared/types/combat.js';
import { checkColonizationGates } from '../colonies/colonization-rules.js';

describe('combat tick — processDueCombat', () => {
  beforeAll(async () => {
    await seedResources();
    await seedBuildingTypes();
    await seedShipTypes();
  });

  async function createUser(label: string) {
    const tgId = BigInt(Math.floor(Math.random() * 1_000_000_000));
    const [user] = await db
      .insert(users)
      .values({ tgId, tgUsername: `${label}_${Date.now()}`, tgFirstName: label })
      .returning();
    await generateHomeSystem(user.id);
    const system = (await db.query.systems.findFirst({ where: eq(systems.ownerId, user.id) }))!;
    const planet = (await db.query.planets.findFirst({
      where: eq(planets.systemId, system.id),
      orderBy: (p, { asc }) => asc(p.name),
    }))!;
    return { userId: user.id, systemId: system.id, planetId: planet.id };
  }

  /** Drop a ship at a planet with the given hp (defaults to type baseline). */
  async function spawnShip(args: {
    ownerId: string;
    planetId: string;
    typeId: string;
    hp?: number;
    lastCombatTickAt?: Date | null;
  }) {
    const shipType = (await db.query.shipTypes.findFirst({
      where: eq(shipTypes.id, args.typeId),
    }))!;
    const [ship] = await db
      .insert(ships)
      .values({
        ownerId: args.ownerId,
        typeId: args.typeId,
        locationPlanetId: args.planetId,
        status: 'idle',
        hp: args.hp ?? shipType.hp,
        maxHp: shipType.hp,
        combatStats: shipType.combatStats,
        lastCombatTickAt: args.lastCombatTickAt ?? null,
      })
      .returning();
    return ship;
  }

  /**
   * Co-locate two players at the same planet by relocating the attacker's ship
   * to the defender's planet. Distance becomes zero, so range never matters.
   */
  async function relocate(shipId: string, planetId: string) {
    await db.update(ships).set({ locationPlanetId: planetId }).where(eq(ships.id, shipId));
  }

  it('applies zero damage on first contact and stamps lastCombatTickAt', async () => {
    const attackerOwner = await createUser('atk1');
    const defenderOwner = await createUser('def1');

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_fighter',
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'scout',
    });
    await relocate(attacker.id, defenderOwner.planetId);

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    const res = await processDueCombat({ now: t0, skipNotifications: true });

    // Other ships from previous tests may also be in the DB; assert on OUR pair only.
    expect(res.destroyed).not.toContain(defender.id);

    const stamped = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });
    expect(stamped!.hp).toBe(40); // scout baseline HP — unchanged on first contact
    expect(stamped!.status).toBe('idle');
    expect(stamped!.lastCombatTickAt).not.toBeNull();
  });

  it('destroys a civilian scout within seconds under light_fighter fire', async () => {
    const attackerOwner = await createUser('atk2');
    const defenderOwner = await createUser('def2');

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_fighter',
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'scout',
    });
    await relocate(attacker.id, defenderOwner.planetId);

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });

    // 5 seconds later is capped to the visible-combat damage window; scout still dies.
    const t1 = new Date(t0.getTime() + 5_000);
    const res = await processDueCombat({ now: t1, skipNotifications: false });

    expect(res.destroyed).toContain(defender.id);

    const dead = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });
    expect(dead!.status).toBe(SHIP_STATUS_DESTROYED);
    expect(dead!.hp).toBe(0);
    expect(dead!.destroyedAt).not.toBeNull();

    const notif = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, defenderOwner.userId),
        eq(notifications.type, 'ship_destroyed'),
      ),
    });
    expect(notif).toBeDefined();
  });

  it('a military light hull survives materially longer than a civilian under the same fire', async () => {
    const attackerOwner = await createUser('atk3');
    const defenderOwner = await createUser('def3');

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_fighter',
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'light_fighter',
    });
    await relocate(attacker.id, defenderOwner.planetId);

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });

    // 5 seconds is capped to the visible-combat damage window; the military hull still survives.
    const t1 = new Date(t0.getTime() + 5_000);
    const res1 = await processDueCombat({ now: t1, skipNotifications: true });
    expect(res1.destroyed).not.toContain(defender.id);

    const mid = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });
    expect(mid!.hp).toBeGreaterThan(0);
    expect(mid!.hp).toBeLessThan(200);
    expect(mid!.hp).toBeGreaterThan(40); // would already be dead if it were a scout
  });

  it('does not apply stale combat time as burst damage when a fresh attacker arrives', async () => {
    const attackerOwner = await createUser('atkReengage');
    const defenderOwner = await createUser('defReengage');
    const staleTime = new Date('2026-06-01T00:00:00.000Z');
    const now = new Date(staleTime.getTime() + 60_000);

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_fighter',
    });
    const defenderA = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'light_fighter',
      hp: 98,
      lastCombatTickAt: staleTime,
    });
    const defenderB = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'light_fighter',
      hp: 98,
      lastCombatTickAt: staleTime,
    });
    await relocate(attacker.id, defenderOwner.planetId);

    await processDueCombat({ now, skipNotifications: true });

    const freshAttacker = await db.query.ships.findFirst({ where: eq(ships.id, attacker.id) });
    const stillAliveA = await db.query.ships.findFirst({ where: eq(ships.id, defenderA.id) });
    const stillAliveB = await db.query.ships.findFirst({ where: eq(ships.id, defenderB.id) });

    expect(freshAttacker!.hp).toBe(200);
    expect(stillAliveA!.hp).toBe(98);
    expect(stillAliveB!.hp).toBe(98);
    expect(stillAliveA!.status).toBe('idle');
    expect(stillAliveB!.status).toBe('idle');
    expect(
      [stillAliveA!.lastCombatTickAt?.getTime(), stillAliveB!.lastCombatTickAt?.getTime()]
        .includes(now.getTime()),
    ).toBe(true);
    expect(freshAttacker!.lastCombatTickAt?.getTime()).toBe(now.getTime());
  });

  it('is idempotent — running twice in succession does not double damage', async () => {
    const attackerOwner = await createUser('atk4');
    const defenderOwner = await createUser('def4');

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_fighter',
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'light_fighter',
    });
    await relocate(attacker.id, defenderOwner.planetId);

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });

    const t1 = new Date(t0.getTime() + 4_000);
    await processDueCombat({ now: t1, skipNotifications: true });
    const afterFirst = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });

    // Run the same tick again at the same instant.
    await processDueCombat({ now: t1, skipNotifications: true });
    const afterSecond = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });

    expect(afterSecond!.hp).toBe(afterFirst!.hp);
  });

  it('destroyed ships cannot be re-attacked and stay at 0 hp on subsequent ticks', async () => {
    const attackerOwner = await createUser('atk5');
    const defenderOwner = await createUser('def5');

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_fighter',
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'scout',
    });
    await relocate(attacker.id, defenderOwner.planetId);

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });
    await processDueCombat({
      now: new Date(t0.getTime() + 5_000),
      skipNotifications: true,
    });

    const t2 = new Date(t0.getTime() + 60_000);
    await processDueCombat({ now: t2, skipNotifications: true });
    const final = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });
    expect(final!.status).toBe(SHIP_STATUS_DESTROYED);
    expect(final!.hp).toBe(0);
  });

  it('destruction cancels in-flight expeditions for the destroyed ship', async () => {
    const attackerOwner = await createUser('atk6');
    const defenderOwner = await createUser('def6');

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_fighter',
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'scout',
    });
    await relocate(attacker.id, defenderOwner.planetId);

    const [exp] = await db
      .insert(expeditions)
      .values({
        shipId: defender.id,
        type: 'scout',
        originPlanetId: defenderOwner.planetId,
        targetX: '0',
        targetY: '0',
        targetZ: '0',
        status: 'in_flight',
        eta: new Date(Date.now() + 600_000),
        result: { distance: 1, speed: 1, engineFactor: 1, returnTrip: false },
      })
      .returning();

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });
    await processDueCombat({
      now: new Date(t0.getTime() + 5_000),
      skipNotifications: true,
    });

    const surviving = await db.query.expeditions.findFirst({ where: eq(expeditions.id, exp.id) });
    expect(surviving).toBeUndefined();
  });

  it('does NOT damage a defender protected by a foreign home system', async () => {
    const attackerOwner = await createUser('atk7');
    const defenderOwner = await createUser('def7');

    // Attacker sits in their own home (not at the defender's planet).
    await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_laser', // long range — would reach IF allowed
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'scout',
    });

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });
    await processDueCombat({
      now: new Date(t0.getTime() + 60_000),
      skipNotifications: true,
    });

    const stillSafe = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });
    expect(stillSafe!.status).toBe('idle');
    expect(stillSafe!.hp).toBe(40);
  });

  it('shield ships absorb incoming fire for allied ships and recharge after combat breaks', async () => {
    const attackerOwner = await createUser('atkShield');
    const defenderOwner = await createUser('defShield');

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_fighter',
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'scout',
    });
    const shield = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'small_shield_ship',
    });
    await relocate(attacker.id, defenderOwner.planetId);

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });
    await processDueCombat({ now: new Date(t0.getTime() + 5_000), skipNotifications: true });

    const protectedScout = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });
    const shieldAfterDamage = await db.query.ships.findFirst({ where: eq(ships.id, shield.id) });
    expect(protectedScout!.hp).toBe(40);
    expect(shieldAfterDamage!.hp).toBe(320);
    expect(shieldAfterDamage!.combatStats.shields?.currentHp).toBe(610);

    await db.update(ships).set({ status: SHIP_STATUS_DESTROYED, hp: 0 }).where(eq(ships.id, attacker.id));
    await processDueCombat({ now: new Date(t0.getTime() + 25_000), skipNotifications: true });

    const shieldAfterRecharge = await db.query.ships.findFirst({ where: eq(ships.id, shield.id) });
    expect(shieldAfterRecharge!.combatStats.shields?.currentHp).toBeGreaterThan(
      shieldAfterDamage!.combatStats.shields!.currentHp!,
    );
    expect(shieldAfterRecharge!.combatStats.shields?.currentHp).toBeLessThanOrEqual(700);
  });

  /**
   * Sets up an attacker–victim pair with a colony on the victim's planet plus
   * one optional non-CC building. The attacker docks at the victim's planet so
   * the bomber's host system matches the target planet's system (orbital range
   * = same system).
   */
  async function setupBombingScenario(label: string, includeNonCc = true) {
    const atk = await createUser(`atkB${label}`);
    const def = await createUser(`defB${label}`);

    // `generateHomeSystem` already creates the capital colony. Keep this
    // idempotent so the fixture also works if reused with a non-capital planet.
    await db
      .insert(colonies)
      .values({ ownerId: def.userId, planetId: def.planetId })
      .onConflictDoNothing();

    // CC sits at slot 0 — `home-system-generator` already planted one, so we
    // do not create it again. Just confirm it exists.
    const cc = await db.query.buildings.findFirst({
      where: and(
        eq(buildings.planetId, def.planetId),
        eq(buildings.typeId, 'command_center'),
      ),
    });
    expect(cc).toBeDefined();

    let mineId: string | null = null;
    if (includeNonCc) {
      const [mine] = await db
        .insert(buildings)
        .values({
          planetId: def.planetId,
          typeId: 'mine',
          slotIndex: 1,
          level: 1,
          hp: 1000,
          maxHp: 1000,
        })
        .returning();
      mineId = mine.id;
    }

    const bomber = await spawnShip({
      ownerId: atk.userId,
      planetId: atk.planetId,
      typeId: 'light_bomber',
    });
    await relocate(bomber.id, def.planetId);

    return { atk, def, ccId: cc!.id, mineId, bomberId: bomber.id };
  }

  it('bomber damages a non-CC building first; HP drops gradually under orbital fire', async () => {
    const s = await setupBombingScenario('A');
    const t0 = new Date('2026-07-01T00:00:00.000Z');

    await processDueCombat({ now: t0, skipNotifications: true });
    const mineAfterFirst = await db.query.buildings.findFirst({ where: eq(buildings.id, s.mineId!) });
    expect(mineAfterFirst!.hp).toBe(1000); // first-touch — no damage yet
    expect(mineAfterFirst!.lastCombatTickAt).not.toBeNull();

    // 5 seconds later is capped to the visible-combat damage window, so damage is gradual.
    await processDueCombat({ now: new Date(t0.getTime() + 5_000), skipNotifications: true });
    const mineHalf = await db.query.buildings.findFirst({ where: eq(buildings.id, s.mineId!) });
    expect(mineHalf!.hp).toBeGreaterThan(0);
    expect(mineHalf!.hp).toBeLessThan(1000);

    // Meanwhile CC is still untouched because the non-CC target is alive.
    const ccUntouched = await db.query.buildings.findFirst({ where: eq(buildings.id, s.ccId) });
    expect(ccUntouched!.hp).toBe(1000);
  });

  it('bombing is idempotent — running the tick twice in succession does not double damage', async () => {
    const s = await setupBombingScenario('B');
    const t0 = new Date('2026-07-01T00:00:00.000Z');

    await processDueCombat({ now: t0, skipNotifications: true });
    const t1 = new Date(t0.getTime() + 4_000);
    await processDueCombat({ now: t1, skipNotifications: true });
    const afterFirst = await db.query.buildings.findFirst({ where: eq(buildings.id, s.mineId!) });

    await processDueCombat({ now: t1, skipNotifications: true });
    const afterSecond = await db.query.buildings.findFirst({ where: eq(buildings.id, s.mineId!) });
    expect(afterSecond!.hp).toBe(afterFirst!.hp);
  });

  it('non-CC building must be destroyed before the Command Center takes any damage', async () => {
    const s = await setupBombingScenario('C');
    const t0 = new Date('2026-07-01T00:00:00.000Z');

    await processDueCombat({ now: t0, skipNotifications: true });
    for (const seconds of [10, 20, 30, 40]) {
      await processDueCombat({
        now: new Date(t0.getTime() + seconds * 1000),
        skipNotifications: true,
      });
    }
    const mine = await db.query.buildings.findFirst({ where: eq(buildings.id, s.mineId!) });
    // mine is now destroyed (hp=0, destroyedAt set), still a row
    expect(mine!.hp).toBe(0);
    expect(mine!.destroyedAt).not.toBeNull();

    const ccBefore = await db.query.buildings.findFirst({ where: eq(buildings.id, s.ccId) });
    expect(ccBefore!.hp).toBe(1000); // CC untouched up to this point

    // Next tick the bomber switches to the CC: first-touch stamps
    // lastCombatTickAt but applies no damage yet, so we run one more tick to
    // see the CC actually take a hit.
    await processDueCombat({
      now: new Date(t0.getTime() + 50_000),
      skipNotifications: true,
    });
    const ccAfterFirstTouch = await db.query.buildings.findFirst({ where: eq(buildings.id, s.ccId) });
    expect(ccAfterFirstTouch!.hp).toBe(1000);
    expect(ccAfterFirstTouch!.lastCombatTickAt).not.toBeNull();

    await processDueCombat({
      now: new Date(t0.getTime() + 60_000),
      skipNotifications: true,
    });
    const ccDamaged = await db.query.buildings.findFirst({ where: eq(buildings.id, s.ccId) });
    // CC may be wiped (cascade) once it reaches 0 HP. Either way: it took damage.
    expect(ccDamaged === undefined || ccDamaged.hp < 1000).toBe(true);
  });

  it('killing the Command Center wipes the colony and every building on the planet', async () => {
    const s = await setupBombingScenario('D');

    // Skip the mine straight to "destroyed" so the bomber jumps to the CC.
    await db
      .update(buildings)
      .set({ hp: 0, destroyedAt: new Date('2026-06-30T23:00:00.000Z') })
      .where(eq(buildings.id, s.mineId!));

    const t0 = new Date('2026-07-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });

    for (const seconds of [10, 20, 30, 40]) {
      await processDueCombat({
        now: new Date(t0.getTime() + seconds * 1000),
        skipNotifications: true,
      });
    }

    const remainingBuildings = await db
      .select({ id: buildings.id })
      .from(buildings)
      .where(eq(buildings.planetId, s.def.planetId));
    expect(remainingBuildings).toHaveLength(0);

    const remainingColony = await db.query.colonies.findFirst({
      where: eq(colonies.planetId, s.def.planetId),
    });
    expect(remainingColony).toBeUndefined();
  });

  it('bombs nothing when the target planet has no hostile buildings', async () => {
    const atk = await createUser('atkNoTarget');
    const def = await createUser('defNoTarget');

    // No colony, no buildings on the defender's planet (we wipe the auto-generated CC).
    await db.delete(buildings).where(eq(buildings.planetId, def.planetId));

    const bomber = await spawnShip({
      ownerId: atk.userId,
      planetId: atk.planetId,
      typeId: 'light_bomber',
    });
    await relocate(bomber.id, def.planetId);

    const t0 = new Date('2026-07-01T00:00:00.000Z');
    const r1 = await processDueCombat({ now: t0, skipNotifications: true });
    const r2 = await processDueCombat({ now: new Date(t0.getTime() + 30_000), skipNotifications: true });
    expect(r1.buildingsDestroyed).toEqual([]);
    expect(r2.buildingsDestroyed).toEqual([]);
  });

  it('colonization is blocked while hostile buildings remain and unblocks after cleanup', async () => {
    const atk = await createUser('atkColonyBlock');
    const otherOwner = await createUser('defColonyBlock');

    // Build a neutral (non-home) system + planet so the colonization gate
    // does not short-circuit on `colony_protected_home` before the hostile-
    // buildings gate fires.
    const [neutralSystem] = await db
      .insert(systems)
      .values({
        name: 'Test Neutral',
        x: '50',
        y: '50',
        z: '0',
        sectorX: 50,
        sectorY: 50,
        sectorZ: 0,
        seed: 12345,
        isHome: false,
      })
      .returning();
    const [neutralPlanet] = await db
      .insert(planets)
      .values({
        systemId: neutralSystem.id,
        name: 'Neutral-1',
        biome: 'rocky',
        slotCount: 4,
        size: 1,
      })
      .returning();

    // Defender plants a colony + non-CC building on the neutral planet.
    await db.insert(colonies).values({
      ownerId: otherOwner.userId,
      planetId: neutralPlanet.id,
    });
    await db.insert(buildings).values({
      planetId: neutralPlanet.id,
      typeId: 'command_center',
      slotIndex: 0,
      level: 1,
      hp: 1000,
      maxHp: 1000,
    });
    await db.insert(buildings).values({
      planetId: neutralPlanet.id,
      typeId: 'mine',
      slotIndex: 1,
      level: 1,
      hp: 1000,
      maxHp: 1000,
    });
    await db
      .insert(discoveredPlanets)
      .values({ userId: atk.userId, planetId: neutralPlanet.id });

    const blocked = await checkColonizationGates(atk.userId, neutralPlanet.id, {
      enforceDistance: false,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.code).toBe('colony_blocked_hostile_buildings');

    // Simulate a successful bombing run: cascade cleanup removes the colony
    // and every building.
    await db.delete(buildings).where(eq(buildings.planetId, neutralPlanet.id));
    await db.delete(colonies).where(eq(colonies.planetId, neutralPlanet.id));

    const unblocked = await checkColonizationGates(atk.userId, neutralPlanet.id, {
      enforceDistance: false,
    });
    // After the planet is cleared, the hostile-buildings gate no longer fires;
    // the next applicable gate is the engineering research requirement.
    expect(unblocked.code).toBe('colony_research_required');
  });

  it('skips bombers — they target buildings, not ships', async () => {
    const attackerOwner = await createUser('atk8');
    const defenderOwner = await createUser('def8');

    const attacker = await spawnShip({
      ownerId: attackerOwner.userId,
      planetId: attackerOwner.planetId,
      typeId: 'light_bomber',
    });
    const defender = await spawnShip({
      ownerId: defenderOwner.userId,
      planetId: defenderOwner.planetId,
      typeId: 'scout',
    });
    await relocate(attacker.id, defenderOwner.planetId);

    const t0 = new Date('2026-06-01T00:00:00.000Z');
    await processDueCombat({ now: t0, skipNotifications: true });
    await processDueCombat({
      now: new Date(t0.getTime() + 30_000),
      skipNotifications: true,
    });

    const safe = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });
    expect(safe!.hp).toBe(40);
    expect(safe!.status).toBe('idle');
  });
});
