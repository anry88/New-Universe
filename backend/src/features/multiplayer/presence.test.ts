import { describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import { users, systems, planets, colonies } from '../../db/schema.js';
import { getSectorPresence } from './presence.js';

describe('getSectorPresence', () => {
  it('never exposes another players home system in the sector slice', async () => {
    const SX = Math.floor(Math.random() * 40000) + 500;
    const SY = Math.floor(Math.random() * 40000) + 500;
    const SZ = Math.floor(Math.random() * 40000) + 500;
    const [viewer] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1e12)),
      tgUsername: 'mp_viewer',
    }).returning();

    const [foreign] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1e12)),
      tgUsername: 'mp_foreign',
    }).returning();

    const [foreignHome] = await db.insert(systems).values({
      ownerId: foreign.id,
      isHome: true,
      sectorX: SX,
      sectorY: SY,
      sectorZ: SZ,
      x: '10.00',
      y: '10.00',
      z: '10.00',
      name: 'Secret Homeworld',
      seed: 1,
    }).returning();

    const payload = await getSectorPresence(viewer.id, SX, SY, SZ);

    expect(payload.entities.some((e) => e.systemId === foreignHome.id)).toBe(false);
    expect(payload.entities.some((e) => e.title === 'Secret Homeworld')).toBe(false);
  });

  it('lists neutral systems and masks foreign colonies', async () => {
    const SX = Math.floor(Math.random() * 40000) + 500;
    const SY = Math.floor(Math.random() * 40000) + 500;
    const SZ = Math.floor(Math.random() * 40000) + 500;
    const [viewer] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1e12)),
      tgUsername: 'mp_viewer2',
    }).returning();

    const [rival] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1e12)),
      tgUsername: 'longrivalname_x',
    }).returning();

    const [neutralSys] = await db.insert(systems).values({
      ownerId: null,
      isHome: false,
      sectorX: SX,
      sectorY: SY,
      sectorZ: SZ,
      x: '50.00',
      y: '60.00',
      z: '70.00',
      name: 'Open Nexus',
      seed: 2,
    }).returning();

    const [colonyPlanet] = await db.insert(planets).values({
      systemId: neutralSys.id,
      biome: 'rocky',
      size: 10,
      slotCount: 8,
      name: 'Settlement Prime',
    }).returning();

    await db.insert(colonies).values({
      ownerId: rival.id,
      planetId: colonyPlanet.id,
      status: 'active',
    });

    const payload = await getSectorPresence(viewer.id, SX, SY, SZ);

    expect(payload.entities.some((e) => e.kind === 'neutral_system' && e.systemId === neutralSys.id)).toBe(true);

    const foreignColony = payload.entities.find((e) => e.kind === 'foreign_colony');
    expect(foreignColony).toBeDefined();
    expect(foreignColony?.visibility).toBe('summary');
    expect(foreignColony?.subtitle).toContain('@longrivalnam');
    expect(foreignColony?.planetId).toBe(colonyPlanet.id);
  });
});
