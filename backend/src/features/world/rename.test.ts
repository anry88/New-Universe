import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  colonies,
  planets,
  systems,
  users,
} from '../../db/schema.js';
import { RenameError, renamePlanet, renameSystem } from './rename.js';
import {
  PLANET_RENAME_DIAMOND_COST,
  SYSTEM_RENAME_DIAMOND_COST,
} from '@shared/types/entity-rename.js';

async function createUser(diamonds: number): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
      tgUsername: `renameuser_${Math.random().toString(36).slice(2)}`,
      diamonds,
    })
    .returning();
  return user.id;
}

async function createSystemRow(ownerId: string | null): Promise<string> {
  const [row] = await db
    .insert(systems)
    .values({
      ownerId,
      isHome: false,
      sectorX: Math.floor(Math.random() * 1000),
      sectorY: Math.floor(Math.random() * 1000),
      sectorZ: Math.floor(Math.random() * 1000),
      x: '0.00',
      y: '0.00',
      z: '0.00',
      name: 'autogen-tag',
      seed: 1,
    })
    .returning({ id: systems.id });
  return row!.id;
}

async function createPlanetRow(systemId: string): Promise<string> {
  const [row] = await db
    .insert(planets)
    .values({
      systemId,
      biome: 'rocky',
      size: 10,
      slotCount: 8,
      name: 'auto-1',
    })
    .returning({ id: planets.id });
  return row!.id;
}

async function createColonyRow(ownerId: string, planetId: string) {
  await db.insert(colonies).values({ ownerId, planetId });
}

async function loadPlanet(planetId: string) {
  return db.query.planets.findFirst({ where: eq(planets.id, planetId) });
}

async function loadSystem(systemId: string) {
  return db.query.systems.findFirst({ where: eq(systems.id, systemId) });
}

async function loadUser(userId: string) {
  return db.query.users.findFirst({ where: eq(users.id, userId) });
}

describe('renamePlanet', () => {
  let userId: string;
  let systemId: string;

  beforeAll(async () => {
    userId = await createUser(1000);
    systemId = await createSystemRow(userId);
  });

  it('first rename is free and increments the counter', async () => {
    const planetId = await createPlanetRow(systemId);
    await createColonyRow(userId, planetId);

    const result = await renamePlanet(userId, planetId, 'Newport');
    expect(result.diamondsSpent).toBe(0);
    expect(result.name).toBe('Newport');
    expect(result.renameCount).toBe(1);

    const stored = await loadPlanet(planetId);
    expect(stored?.name).toBe('Newport');
    expect(stored?.renameCount).toBe(1);
  });

  it('second rename costs PLANET_RENAME_DIAMOND_COST', async () => {
    const planetId = await createPlanetRow(systemId);
    await createColonyRow(userId, planetId);
    await renamePlanet(userId, planetId, 'First Name');

    const before = await loadUser(userId);
    const balanceBefore = before!.diamonds;

    const result = await renamePlanet(userId, planetId, 'Second Name');
    expect(result.diamondsSpent).toBe(PLANET_RENAME_DIAMOND_COST);
    expect(result.renameCount).toBe(2);
    expect(result.diamondsRemaining).toBe(balanceBefore - PLANET_RENAME_DIAMOND_COST);
  });

  it('charges only one free rename under concurrent planet rename submissions', async () => {
    const owner = await createUser(1000);
    const concurrentSystemId = await createSystemRow(owner);
    const planetId = await createPlanetRow(concurrentSystemId);
    await createColonyRow(owner, planetId);

    const before = await loadUser(owner);
    const results = await Promise.all([
      renamePlanet(owner, planetId, 'Concurrent One'),
      renamePlanet(owner, planetId, 'Concurrent Two'),
    ]);

    expect(results.map((result) => result.renameCount).sort()).toEqual([1, 2]);
    expect(results.reduce((sum, result) => sum + result.diamondsSpent, 0)).toBe(
      PLANET_RENAME_DIAMOND_COST,
    );

    const after = await loadUser(owner);
    expect(after?.diamonds).toBe(before!.diamonds - PLANET_RENAME_DIAMOND_COST);
  });

  it('rejects when the player does not own the colony', async () => {
    const intruderId = await createUser(500);
    const planetId = await createPlanetRow(systemId);
    await createColonyRow(userId, planetId);

    await expect(renamePlanet(intruderId, planetId, 'Pirate Bay')).rejects.toMatchObject({
      code: 'not_owned',
    });
  });

  it('rejects invalid names with the validation code', async () => {
    const planetId = await createPlanetRow(systemId);
    await createColonyRow(userId, planetId);

    await expect(renamePlanet(userId, planetId, 'Земля')).rejects.toBeInstanceOf(RenameError);
    await expect(renamePlanet(userId, planetId, 'blyad')).rejects.toMatchObject({
      code: 'profanity',
    });
  });

  it('rejects when diamonds are insufficient for a paid rename', async () => {
    const broke = await createUser(5);
    const planetId = await createPlanetRow(systemId);
    await createColonyRow(broke, planetId);
    await renamePlanet(broke, planetId, 'First Free');

    await expect(renamePlanet(broke, planetId, 'Costly')).rejects.toMatchObject({
      code: 'insufficient_diamonds',
    });

    const after = await loadUser(broke);
    expect(after?.diamonds).toBe(5);
  });
});

describe('renameSystem', () => {
  it('first rename is free; counter persists per-system across owners', async () => {
    const firstOwner = await createUser(1000);
    const systemId = await createSystemRow(null);
    const planetId = await createPlanetRow(systemId);
    await createColonyRow(firstOwner, planetId);

    const firstResult = await renameSystem(firstOwner, systemId, 'Alpha Reach');
    expect(firstResult.diamondsSpent).toBe(0);
    expect(firstResult.renameCount).toBe(1);

    // Simulate hostile takeover: foreign colony removed, new owner colony.
    await db.delete(colonies).where(eq(colonies.planetId, planetId));
    const secondOwner = await createUser(1000);
    await createColonyRow(secondOwner, planetId);

    const secondResult = await renameSystem(secondOwner, systemId, 'Beta Reach');
    expect(secondResult.diamondsSpent).toBe(SYSTEM_RENAME_DIAMOND_COST);
    expect(secondResult.renameCount).toBe(2);

    const stored = await loadSystem(systemId);
    expect(stored?.name).toBe('Beta Reach');
  });

  it('charges only one free rename under concurrent system rename submissions', async () => {
    const owner = await createUser(1000);
    const systemId = await createSystemRow(null);
    const planetId = await createPlanetRow(systemId);
    await createColonyRow(owner, planetId);

    const before = await loadUser(owner);
    const results = await Promise.all([
      renameSystem(owner, systemId, 'Concurrent Alpha'),
      renameSystem(owner, systemId, 'Concurrent Beta'),
    ]);

    expect(results.map((result) => result.renameCount).sort()).toEqual([1, 2]);
    expect(results.reduce((sum, result) => sum + result.diamondsSpent, 0)).toBe(
      SYSTEM_RENAME_DIAMOND_COST,
    );

    const after = await loadUser(owner);
    expect(after?.diamonds).toBe(before!.diamonds - SYSTEM_RENAME_DIAMOND_COST);
  });

  it('rejects when the player has no colony in the system', async () => {
    const observer = await createUser(1000);
    const systemId = await createSystemRow(null);
    await createPlanetRow(systemId); // unsettled

    await expect(renameSystem(observer, systemId, 'No Right')).rejects.toMatchObject({
      code: 'no_player_colony',
    });
  });

  it('rejects when foreign colonies are present', async () => {
    const owner = await createUser(1000);
    const rival = await createUser(1000);
    const systemId = await createSystemRow(null);
    const planetA = await createPlanetRow(systemId);
    const planetB = await createPlanetRow(systemId);
    await createColonyRow(owner, planetA);
    await createColonyRow(rival, planetB);

    await expect(renameSystem(owner, systemId, 'Contested')).rejects.toMatchObject({
      code: 'foreign_colony_present',
    });
  });

  it('rejects invalid names', async () => {
    const owner = await createUser(1000);
    const systemId = await createSystemRow(null);
    const planetId = await createPlanetRow(systemId);
    await createColonyRow(owner, planetId);

    await expect(renameSystem(owner, systemId, '   ')).rejects.toMatchObject({
      code: 'empty',
    });
    await expect(renameSystem(owner, systemId, 'a'.repeat(31))).rejects.toMatchObject({
      code: 'too_long',
    });
  });
});
