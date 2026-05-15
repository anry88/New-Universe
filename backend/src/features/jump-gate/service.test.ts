import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  discoveredSystems,
  discoveredPlanets,
  buildings,
  colonies,
  jumpGates,
  notifications,
  planets,
  planetResources,
  productionOrders,
  researchProgress,
  richness,
  ships,
  systems,
  users,
} from '../../db/schema.js';
import { getJumpGateState } from './service.js';
import { seedResources } from '../../db/seed/resources.js';
import {
  formatCommonSystemDisplayName,
  homeSystemShortTag,
} from '@shared/format/homeSystemNaming.js';

async function createUserWithHomeSystem(suffix: string) {
  const [user] = await db.insert(users).values({
    tgId: BigInt(Math.floor(Math.random() * 1e12)),
    tgUsername: `gate_${suffix}_${Date.now()}`,
  }).returning();

  const [homeSystem] = await db.insert(systems).values({
    ownerId: user.id,
    isHome: true,
    sectorX: Math.floor(Math.random() * 50000) + 1000,
    sectorY: Math.floor(Math.random() * 50000) + 1000,
    sectorZ: Math.floor(Math.random() * 50000) + 1000,
    x: '10.00',
    y: '20.00',
    z: '30.00',
    name: `Home Gate Test ${suffix}`,
    seed: 100,
  }).returning();

  return { user, homeSystem };
}

describe('getJumpGateState', () => {
  beforeEach(async () => {
    await db.delete(jumpGates);
    await db.delete(discoveredPlanets);
    await db.delete(discoveredSystems);
    await db.delete(researchProgress);
    await db.delete(ships);
    await db.delete(productionOrders);
    await db.delete(buildings);
    await db.delete(colonies);
    await db.delete(notifications);
    await db.delete(planetResources);
    await db.delete(richness);
    await db.delete(planets);
    await db.delete(systems);
    await db.delete(users);
    await seedResources();
  });

  it('returns locked state and a home anchor before completed Jump Drive research', async () => {
    const { user, homeSystem } = await createUserWithHomeSystem('locked');

    const state = await getJumpGateState(user.id, {
      now: new Date('2026-05-13T00:00:00.000Z'),
    });

    expect(state.unlocked).toBe(false);
    expect(state.lockedReason).toEqual({
      code: 'jump_drive_required',
      requiredResearch: { branch: 'jump_drive', level: 1 },
      currentResearchLevel: 0,
    });
    expect(state.homeGateAnchor?.systemId).toBe(homeSystem.id);
    expect(state.homeGateAnchor?.orbitSlot).toBe(10);
    expect(state.randomJumpAvailability).toEqual({
      available: false,
      blockedCode: 'jump_drive_required',
      readyAt: null,
    });

    const gateRows = await db.select().from(jumpGates).where(eq(jumpGates.userId, user.id));
    expect(gateRows).toHaveLength(0);
  });

  it('does not unlock from active but unfinished Jump Drive research', async () => {
    const { user } = await createUserWithHomeSystem('active');

    await db.insert(researchProgress).values({
      userId: user.id,
      branch: 'jump_drive',
      level: 0,
      completesAt: new Date(Date.now() + 60_000),
    });

    const state = await getJumpGateState(user.id);

    expect(state.unlocked).toBe(false);
    expect(state.lockedReason?.code).toBe('jump_drive_required');
    expect(state.lockedReason?.currentResearchLevel).toBe(0);
  });

  it('creates a private gate row once Jump Drive level 1 is complete', async () => {
    const { user, homeSystem } = await createUserWithHomeSystem('unlocked');

    await db.insert(researchProgress).values({
      userId: user.id,
      branch: 'jump_drive',
      level: 1,
    });

    const state = await getJumpGateState(user.id);

    expect(state.unlocked).toBe(true);
    expect(state.lockedReason).toBeNull();
    expect(state.calibration.status).toBe('idle');
    expect(state.randomJumpAvailability.available).toBe(true);

    const gate = await db.query.jumpGates.findFirst({
      where: and(eq(jumpGates.userId, user.id), eq(jumpGates.homeSystemId, homeSystem.id)),
    });
    expect(gate).toBeDefined();
  });

  it('returns only discovered public systems as known destinations', async () => {
    const { user, homeSystem } = await createUserWithHomeSystem('destinations');

    await db.insert(researchProgress).values({
      userId: user.id,
      branch: 'jump_drive',
      level: 1,
    });

    const [publicSystem] = await db.insert(systems).values({
      ownerId: null,
      isHome: false,
      sectorX: homeSystem.sectorX + 1,
      sectorY: homeSystem.sectorY,
      sectorZ: homeSystem.sectorZ,
      x: '100.00',
      y: '110.00',
      z: '120.00',
      name: 'Known Public System',
      seed: 200,
    }).returning();

    await db.insert(planets).values([
      {
        systemId: publicSystem.id,
        biome: 'rocky',
        size: 12,
        slotCount: 8,
        name: 'Known Public I',
      },
      {
        systemId: publicSystem.id,
        biome: 'green',
        size: 14,
        slotCount: 9,
        name: 'Known Public II',
      },
    ]);

    const [foreignOwner] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1e12)),
      tgUsername: `gate_foreign_${Date.now()}`,
    }).returning();

    const [foreignHome] = await db.insert(systems).values({
      ownerId: foreignOwner.id,
      isHome: true,
      sectorX: homeSystem.sectorX + 2,
      sectorY: homeSystem.sectorY,
      sectorZ: homeSystem.sectorZ,
      x: '200.00',
      y: '210.00',
      z: '220.00',
      name: 'Foreign Home System',
      seed: 300,
    }).returning();

    await db.insert(discoveredSystems).values([
      { userId: user.id, systemId: homeSystem.id },
      { userId: user.id, systemId: publicSystem.id },
      { userId: user.id, systemId: foreignHome.id },
    ]);

    const state = await getJumpGateState(user.id);

    expect(state.knownDestinations).toHaveLength(1);
    const publicShortTag = homeSystemShortTag(publicSystem.id);
    expect(state.knownDestinations[0]).toMatchObject({
      systemId: publicSystem.id,
      systemName: formatCommonSystemDisplayName('en', publicShortTag),
      shortTag: publicShortTag,
      planetCount: 2,
    });
  });

  it('returns resources for discovered public destination planets only', async () => {
    const { user, homeSystem } = await createUserWithHomeSystem('resources');

    await db.insert(researchProgress).values({
      userId: user.id,
      branch: 'jump_drive',
      level: 1,
    });

    const [publicSystem] = await db.insert(systems).values({
      ownerId: null,
      isHome: false,
      sectorX: homeSystem.sectorX + 1,
      sectorY: homeSystem.sectorY,
      sectorZ: homeSystem.sectorZ,
      x: '100.00',
      y: '110.00',
      z: '120.00',
      name: 'Known Public System',
      seed: 200,
    }).returning();

    const [discoveredPlanet, hiddenPlanet] = await db.insert(planets).values([
      {
        systemId: publicSystem.id,
        biome: 'rocky',
        size: 12,
        slotCount: 8,
        name: 'a111-1',
      },
      {
        systemId: publicSystem.id,
        biome: 'ice',
        size: 14,
        slotCount: 9,
        name: 'a111-2',
      },
    ]).returning();

    await db.insert(richness).values({
      planetId: discoveredPlanet.id,
      resourceId: 'iron',
      value: 3,
    });
    await db.insert(planetResources).values({
      planetId: discoveredPlanet.id,
      resourceId: 'iron',
      amount: '0',
      regenRate: '0',
    });
    await db.insert(discoveredSystems).values({
      userId: user.id,
      systemId: publicSystem.id,
    });
    await db.insert(discoveredPlanets).values({
      userId: user.id,
      planetId: discoveredPlanet.id,
    });

    const state = await getJumpGateState(user.id);
    const destination = state.knownDestinations[0]!;
    expect(destination.planets).toHaveLength(2);

    const visible = destination.planets.find((planet) => planet.id === discoveredPlanet.id)!;
    expect(visible).toMatchObject({
      name: 'a111-1',
      biome: 'rocky',
      slotCount: 8,
      isDiscovered: true,
      resources: [
        expect.objectContaining({
          resourceId: 'iron',
          richness: 3,
        }),
      ],
    });

    const hidden = destination.planets.find((planet) => planet.id === hiddenPlanet.id)!;
    expect(hidden).toMatchObject({
      name: null,
      biome: null,
      slotCount: null,
      isDiscovered: false,
    });
    expect(hidden.resources).toBeUndefined();
  });

  it('marks due calibration as ready in persisted state', async () => {
    const { user, homeSystem } = await createUserWithHomeSystem('calibration');
    const now = new Date('2026-05-13T00:00:00.000Z');

    await db.insert(researchProgress).values({
      userId: user.id,
      branch: 'jump_drive',
      level: 1,
    });

    await db.insert(jumpGates).values({
      userId: user.id,
      homeSystemId: homeSystem.id,
      calibrationStatus: 'calibrating',
      calibrationMode: 'random',
      calibrationStartedAt: new Date(now.getTime() - 120_000),
      calibrationCompletesAt: new Date(now.getTime() - 60_000),
    });

    const state = await getJumpGateState(user.id, { now });

    expect(state.calibration.status).toBe('ready');

    const gate = await db.query.jumpGates.findFirst({
      where: eq(jumpGates.userId, user.id),
    });
    expect(gate?.calibrationStatus).toBe('ready');
  });
});
