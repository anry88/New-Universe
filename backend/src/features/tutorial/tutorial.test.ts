import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import { buildings, expeditions, planets, ships, systems, users } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { claimTutorialReward, syncTutorialProgress } from './service.js';
import { seedBuildingTypes } from '../../db/seed/building-types.js';
import { seedResources } from '../../db/seed/resources.js';
import { seedShipTypes } from '../../db/seed/ship-types.js';
import {
  TUTORIAL_ALL_REWARDS_CLAIMED_MASK,
  TUTORIAL_REWARD_DIAMONDS,
} from '@shared/config/tutorialRewards.js';

describe('tutorial sync', () => {
  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE TABLE
        expeditions,
        colonies,
        ships,
        buildings,
        discovered_planets,
        discovered_systems,
        richness,
        notifications,
        planet_resources,
        planets,
        systems,
        users
      RESTART IDENTITY
      CASCADE
    `);
    await seedResources();
    await seedBuildingTypes();
    await seedShipTypes();
  });

  async function createTutorialUser(seed: number, diamonds = 0) {
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(50_000_000 + seed),
        tgFirstName: 'Tutorial',
        diamonds,
      })
      .returning();

    const [system] = await db
      .insert(systems)
      .values({
        ownerId: user.id,
        isHome: true,
        sectorX: 1,
        sectorY: 1,
        sectorZ: 1,
        x: '0.00',
        y: '0.00',
        z: '0.00',
        name: `Home ${seed}`,
        seed,
      })
      .returning();

    const [planet] = await db
      .insert(planets)
      .values({
        systemId: system.id,
        biome: 'rocky',
        size: 12,
        slotCount: 8,
        name: `Prime ${seed}`,
      })
      .returning();

    return { user, system, planet };
  }

  it('syncs progress without auto-granting and claims five diamond rewards once', async () => {
    const { user, planet } = await createTutorialUser(1, 10);

    await db.insert(buildings).values([
      { planetId: planet.id, typeId: 'mine', level: 1, slotIndex: 0 },
      { planetId: planet.id, typeId: 'storage', level: 1, slotIndex: 1 },
    ]);

    const [scout] = await db
      .insert(ships)
      .values({
        ownerId: user.id,
        typeId: 'scout',
        locationPlanetId: planet.id,
        status: 'idle',
      })
      .returning();

    await db.insert(expeditions).values({
      shipId: scout.id,
      type: 'scout',
      originPlanetId: planet.id,
      targetX: '1',
      targetY: '1',
      targetZ: '1',
      eta: new Date(Date.now() + 60_000),
    });

    const synced = await syncTutorialProgress(user.id);
    expect(synced.tutorialStepCompleted).toBe(4);
    expect(synced.tutorialCompletedAt).toBeNull();
    expect(synced.tutorialRewardsClaimed).toBe(0);

    const [afterSync] = await db.select().from(users).where(eq(users.id, user.id));
    expect(afterSync.diamonds).toBe(10);

    for (const stepId of [0, 1, 2, 3, 4]) {
      await claimTutorialReward(user.id, stepId);
    }

    const [afterClaims] = await db.select().from(users).where(eq(users.id, user.id));
    expect(afterClaims.diamonds).toBe(10 + TUTORIAL_REWARD_DIAMONDS * 5);
    expect(afterClaims.tutorialRewardsClaimed).toBe(TUTORIAL_ALL_REWARDS_CLAIMED_MASK);
    expect(afterClaims.tutorialCompletedAt).not.toBeNull();

    const repeatClaim = await claimTutorialReward(user.id, 4);
    expect(repeatClaim.rewardGranted).toBe(false);

    const [afterRepeat] = await db.select().from(users).where(eq(users.id, user.id));
    expect(afterRepeat.diamonds).toBe(afterClaims.diamonds);
  });

  it('keeps queued milestones locked until the task is complete', async () => {
    const { user, planet } = await createTutorialUser(2);

    await db.insert(buildings).values({
      planetId: planet.id,
      typeId: 'mine',
      level: 1,
      slotIndex: 0,
      queueAction: 'build',
      queueCompletesAt: new Date(Date.now() + 60_000),
    });

    const synced = await syncTutorialProgress(user.id);
    expect(synced.tutorialStepCompleted).toBe(0);

    const welcomeClaim = await claimTutorialReward(user.id, 0);
    expect(welcomeClaim.rewardGranted).toBe(true);

    await expect(claimTutorialReward(user.id, 1)).rejects.toThrow('not complete');
  });
});
