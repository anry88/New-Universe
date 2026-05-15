import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import {
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

    // 5 seconds later — light_fighter dps=30, scout armor=0 → 150 dmg, scout has 40 hp
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

    // 5 seconds — light_fighter (dps=30, ap=0.2) vs light_fighter armor=5
    // effective dps = 30 - 5*0.8 = 26, dmg = 130, target hp = 200 → still alive
    const t1 = new Date(t0.getTime() + 5_000);
    const res1 = await processDueCombat({ now: t1, skipNotifications: true });
    expect(res1.destroyed).not.toContain(defender.id);

    const mid = await db.query.ships.findFirst({ where: eq(ships.id, defender.id) });
    expect(mid!.hp).toBeGreaterThan(0);
    expect(mid!.hp).toBeLessThan(200);
    expect(mid!.hp).toBeGreaterThan(40); // would already be dead if it were a scout
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
