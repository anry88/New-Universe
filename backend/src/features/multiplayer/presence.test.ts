import { describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import {
  users,
  systems,
  planets,
  colonies,
  ships,
  shipTypes,
  discoveredSystems,
  jumpGates,
  expeditions,
} from '../../db/schema.js';
import { getSectorPresence, getSectorSystemAnchors } from './presence.js';
import { SHIP_STATUS_DESTROYED } from '@shared/types/combat.js';

function randomSector() {
  const base = Math.floor(Math.random() * 40000) + 500;
  return {
    sx: base,
    sy: base + 1,
    sz: base + 2,
  };
}

let testUserCounter = 0;

function randomTgId(): bigint {
  testUserCounter += 1;
  return BigInt(Date.now()) * 1000000n + BigInt(process.pid) * 1000n + BigInt(testUserCounter);
}

async function createUser(username: string) {
  const [row] = await db.insert(users).values({
    tgId: randomTgId(),
    tgUsername: username,
  }).returning();

  return row;
}

async function createSystem(input: {
  ownerId?: string | null;
  isHome?: boolean;
  sector: ReturnType<typeof randomSector>;
  name: string;
  seed: number;
  x?: string;
  y?: string;
  z?: string;
}) {
  const [row] = await db.insert(systems).values({
    ownerId: input.ownerId ?? null,
    isHome: input.isHome ?? false,
    sectorX: input.sector.sx,
    sectorY: input.sector.sy,
    sectorZ: input.sector.sz,
    x: input.x ?? '10.00',
    y: input.y ?? '10.00',
    z: input.z ?? '10.00',
    name: input.name,
    seed: input.seed,
  }).returning();

  return row;
}

async function createPlanet(systemId: string, name: string) {
  const [row] = await db.insert(planets).values({
    systemId,
    biome: 'rocky',
    size: 10,
    slotCount: 8,
    name,
  }).returning();

  return row;
}

async function createShipType(id: string) {
  const [row] = await db.insert(shipTypes).values({
    id,
    name: { en: id, ru: id },
    role: 'scout',
    hp: 10,
    speed: '10.00',
    cargo: 0,
    dps: 0,
    armor: 0,
    fuelConsumption: '1.00',
    buildTimeSec: 60,
    buildCost: {},
    requiredBuildings: [],
    sensorRange: 30,
  }).returning();

  return row;
}

describe('getSectorPresence', () => {
  it('never exposes another players home system in the sector slice', async () => {
    const sector = randomSector();
    const viewer = await createUser('mp_viewer');
    const foreign = await createUser('mp_foreign');
    const foreignHome = await createSystem({
      ownerId: foreign.id,
      isHome: true,
      sector,
      name: 'Secret Homeworld',
      seed: 1,
    });
    const foreignHomePlanet = await createPlanet(foreignHome.id, 'Hidden Capital');
    const foreignShipType = await createShipType(`mp_hidden_scout_${sector.sx}`);

    await db.insert(jumpGates).values({
      userId: foreign.id,
      homeSystemId: foreignHome.id,
    });

    await db.insert(colonies).values({
      ownerId: foreign.id,
      planetId: foreignHomePlanet.id,
      status: 'active',
    });

    const [foreignHomeShip] = await db.insert(ships).values({
      ownerId: foreign.id,
      typeId: foreignShipType.id,
      locationPlanetId: foreignHomePlanet.id,
      status: 'idle',
    }).returning();

    const payload = await getSectorPresence(viewer.id, sector.sx, sector.sy, sector.sz);

    expect(payload.entities.some((e) => e.systemId === foreignHome.id)).toBe(false);
    expect(payload.entities.some((e) => e.planetId === foreignHomePlanet.id)).toBe(false);
    expect(payload.entities.some((e) => e.shipId === foreignHomeShip.id)).toBe(false);
    expect(payload.entities.some((e) => e.title === 'Secret Homeworld')).toBe(false);
    expect(payload.entities.some((e) => e.title.includes('Jump Gate'))).toBe(false);
  });

  it('projects explicit home, public, colony, and fleet entities for multiple players in one sector', async () => {
    const sector = randomSector();
    const viewer = await createUser('mp_viewer2');
    const rival = await createUser('longrivalname_x');
    const shipType = await createShipType(`mp_visible_scout_${sector.sx}`);

    const viewerHome = await createSystem({
      ownerId: viewer.id,
      isHome: true,
      sector,
      name: 'Viewer Home',
      seed: 2,
      x: '20.00',
      y: '25.00',
      z: '30.00',
    });

    const neutralSys = await createSystem({
      sector,
      name: 'Open Nexus',
      seed: 3,
      x: '50.00',
      y: '60.00',
      z: '70.00',
    });

    const viewerColonyPlanet = await createPlanet(neutralSys.id, 'Settlement Prime');
    const rivalColonyPlanet = await createPlanet(neutralSys.id, 'Rival Outpost');

    await db.insert(colonies).values({
      ownerId: viewer.id,
      planetId: viewerColonyPlanet.id,
      status: 'active',
    });

    await db.insert(colonies).values({
      ownerId: rival.id,
      planetId: rivalColonyPlanet.id,
      status: 'active',
    });

    const [viewerShip] = await db.insert(ships).values({
      ownerId: viewer.id,
      typeId: shipType.id,
      locationPlanetId: viewerColonyPlanet.id,
      status: 'idle',
    }).returning();

    const [rivalShip] = await db.insert(ships).values({
      ownerId: rival.id,
      typeId: shipType.id,
      locationPlanetId: rivalColonyPlanet.id,
      status: 'idle',
    }).returning();

    const [viewerStationedShip] = await db.insert(ships).values({
      ownerId: viewer.id,
      typeId: shipType.id,
      locationPlanetId: null,
      status: 'moving',
    }).returning();

    const [rivalStationedShip] = await db.insert(ships).values({
      ownerId: rival.id,
      typeId: shipType.id,
      locationPlanetId: null,
      status: 'moving',
    }).returning();
    const [destroyedStationedShip] = await db.insert(ships).values({
      ownerId: rival.id,
      typeId: shipType.id,
      locationPlanetId: null,
      status: SHIP_STATUS_DESTROYED,
      hp: 0,
      destroyedAt: new Date(),
    }).returning();

    await db.insert(expeditions).values([
      {
        shipId: viewerStationedShip.id,
        type: shipType.id,
        originPlanetId: viewerColonyPlanet.id,
        targetX: neutralSys.sectorX.toString(),
        targetY: neutralSys.sectorY.toString(),
        targetZ: neutralSys.sectorZ.toString(),
        status: 'stationed',
        eta: new Date(),
        result: {
          routeMode: 'jump_gate',
          destinationSystemId: neutralSys.id,
          targetSystemPoint: { x: 10, y: 20 },
        },
      },
      {
        shipId: rivalStationedShip.id,
        type: shipType.id,
        originPlanetId: rivalColonyPlanet.id,
        targetX: neutralSys.sectorX.toString(),
        targetY: neutralSys.sectorY.toString(),
        targetZ: neutralSys.sectorZ.toString(),
        status: 'stationed',
        eta: new Date(),
        result: {
          routeMode: 'jump_gate',
          destinationSystemId: neutralSys.id,
          targetSystemPoint: { x: 30, y: 40 },
        },
      },
      {
        shipId: destroyedStationedShip.id,
        type: shipType.id,
        originPlanetId: rivalColonyPlanet.id,
        targetX: neutralSys.sectorX.toString(),
        targetY: neutralSys.sectorY.toString(),
        targetZ: neutralSys.sectorZ.toString(),
        status: 'stationed',
        eta: new Date(),
        result: {
          routeMode: 'jump_gate',
          destinationSystemId: neutralSys.id,
          targetSystemPoint: { x: 50, y: 60 },
        },
      },
    ]);

    const payload = await getSectorPresence(viewer.id, sector.sx, sector.sy, sector.sz);

    const ownHome = payload.entities.find((e) => e.kind === 'own_home_system' && e.systemId === viewerHome.id);
    expect(ownHome).toMatchObject({
      entityType: 'home',
      relation: 'self',
      visibility: 'full',
    });

    const neutral = payload.entities.find((e) => e.kind === 'neutral_system' && e.systemId === neutralSys.id);
    expect(neutral).toMatchObject({
      entityType: 'public_sector',
      relation: 'public',
      visibility: 'summary',
    });

    const ownColony = payload.entities.find((e) => e.kind === 'own_colony');
    expect(ownColony).toMatchObject({
      entityType: 'colony',
      relation: 'self',
      planetId: viewerColonyPlanet.id,
      visibility: 'full',
    });

    const foreignColony = payload.entities.find((e) => e.kind === 'foreign_colony');
    expect(foreignColony).toMatchObject({
      entityType: 'colony',
      relation: 'foreign',
      planetId: rivalColonyPlanet.id,
      visibility: 'summary',
    });
    expect(foreignColony?.subtitle).toContain('@longrivalnam');

    const ownFleet = payload.entities.find((e) => e.kind === 'own_ship');
    expect(ownFleet).toMatchObject({
      entityType: 'fleet',
      relation: 'self',
      shipId: viewerShip.id,
      visibility: 'full',
    });

    const foreignFleet = payload.entities.find((e) => e.kind === 'foreign_ship');
    expect(foreignFleet).toMatchObject({
      entityType: 'fleet',
      relation: 'foreign',
      shipId: rivalShip.id,
      visibility: 'summary',
    });

    const ownStationedFleet = payload.entities.find(
      (e) => e.kind === 'own_ship' && e.shipId === viewerStationedShip.id,
    );
    expect(ownStationedFleet).toMatchObject({
      entityType: 'fleet',
      relation: 'self',
      systemId: neutralSys.id,
      visibility: 'full',
    });
    expect(ownStationedFleet?.planetId).toBeUndefined();

    const foreignStationedFleet = payload.entities.find(
      (e) => e.kind === 'foreign_ship' && e.shipId === rivalStationedShip.id,
    );
    expect(foreignStationedFleet).toMatchObject({
      entityType: 'fleet',
      relation: 'foreign',
      systemId: neutralSys.id,
      visibility: 'summary',
    });
    expect(foreignStationedFleet?.planetId).toBeUndefined();
    expect(payload.entities.some((e) => e.shipId === destroyedStationedShip.id)).toBe(false);
  });
});

describe('getSectorSystemAnchors', () => {
  it('returns home, discovered, colony, and fleet anchors without foreign home leaks', async () => {
    const homeSector = randomSector();
    const commonSector = randomSector();
    const hiddenSector = randomSector();
    const viewer = await createUser('mp_anchor_viewer');
    const rival = await createUser('mp_anchor_rival');
    const shipType = await createShipType(`mp_anchor_scout_${homeSector.sx}`);

    const home = await createSystem({
      ownerId: viewer.id,
      isHome: true,
      sector: homeSector,
      name: 'Anchor Home',
      seed: 4,
    });

    const common = await createSystem({
      sector: commonSector,
      name: 'Anchor Common',
      seed: 5,
      x: '42.00',
      y: '45.00',
      z: '0.00',
    });
    const commonPlanet = await createPlanet(common.id, 'Anchor Colony');

    await db.insert(discoveredSystems).values({
      userId: viewer.id,
      systemId: common.id,
      discoveredAt: new Date('2026-05-01T12:00:00.000Z'),
    });
    await db.insert(colonies).values({
      ownerId: viewer.id,
      planetId: commonPlanet.id,
      status: 'active',
      foundedAt: new Date('2026-05-02T12:00:00.000Z'),
    });
    await db.insert(ships).values({
      ownerId: viewer.id,
      typeId: shipType.id,
      locationPlanetId: commonPlanet.id,
      status: 'idle',
    });
    await db.insert(ships).values({
      ownerId: viewer.id,
      typeId: shipType.id,
      locationPlanetId: commonPlanet.id,
      status: SHIP_STATUS_DESTROYED,
      hp: 0,
      destroyedAt: new Date(),
    });
    const [stationedShip] = await db.insert(ships).values({
      ownerId: viewer.id,
      typeId: shipType.id,
      locationPlanetId: null,
      status: 'moving',
    }).returning();
    const [destroyedStationedShip] = await db.insert(ships).values({
      ownerId: viewer.id,
      typeId: shipType.id,
      locationPlanetId: null,
      status: SHIP_STATUS_DESTROYED,
      hp: 0,
      destroyedAt: new Date(),
    }).returning();
    await db.insert(expeditions).values({
      shipId: stationedShip.id,
      type: shipType.id,
      originPlanetId: commonPlanet.id,
      targetX: common.sectorX.toString(),
      targetY: common.sectorY.toString(),
      targetZ: common.sectorZ.toString(),
      status: 'stationed',
      eta: new Date('2026-05-02T13:00:00.000Z'),
      result: {
        routeMode: 'jump_gate',
        destinationSystemId: common.id,
        targetSystemPoint: { x: 12, y: 24 },
      },
    });
    await db.insert(expeditions).values({
      shipId: destroyedStationedShip.id,
      type: shipType.id,
      originPlanetId: commonPlanet.id,
      targetX: common.sectorX.toString(),
      targetY: common.sectorY.toString(),
      targetZ: common.sectorZ.toString(),
      status: 'stationed',
      eta: new Date('2026-05-02T13:05:00.000Z'),
      result: {
        routeMode: 'jump_gate',
        destinationSystemId: common.id,
        targetSystemPoint: { x: 16, y: 30 },
      },
    });

    const foreignHome = await createSystem({
      ownerId: rival.id,
      isHome: true,
      sector: hiddenSector,
      name: 'Hidden Anchor Home',
      seed: 6,
    });

    await db.insert(discoveredSystems).values({
      userId: viewer.id,
      systemId: foreignHome.id,
      discoveredAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    const payload = await getSectorSystemAnchors(viewer.id);

    const homeAnchor = payload.systems.find((anchor) => anchor.systemId === home.id);
    expect(homeAnchor?.tags).toContain('home');
    expect(homeAnchor?.sector).toEqual([homeSector.sx, homeSector.sy, homeSector.sz]);

    const commonAnchor = payload.systems.find((anchor) => anchor.systemId === common.id);
    expect(commonAnchor?.tags).toEqual(['colony', 'fleet', 'recent', 'discovered']);
    expect(commonAnchor?.colonyCount).toBe(1);
    expect(commonAnchor?.shipCount).toBe(2);
    expect(commonAnchor?.sector).toEqual([commonSector.sx, commonSector.sy, commonSector.sz]);

    expect(payload.systems.some((anchor) => anchor.systemId === foreignHome.id)).toBe(false);
    expect(payload.systems.some((anchor) => anchor.title === 'Hidden Anchor Home')).toBe(false);
  });
});
