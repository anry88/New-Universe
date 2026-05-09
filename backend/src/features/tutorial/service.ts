import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { buildings, expeditions, planetResources, planets, ships, systems, users } from '../../db/schema.js';

const TUTORIAL_FINAL_STEP = 4;

export interface TutorialProgress {
  tutorialStep: number;
  tutorialCompletedAt: Date | null;
}

export async function syncTutorialProgress(userId: string): Promise<TutorialProgress> {
  return db.transaction(async (tx) => {
    const user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.tutorialCompletedAt) {
      return {
        tutorialStep: user.tutorialStep,
        tutorialCompletedAt: user.tutorialCompletedAt,
      };
    }

    const [mineRows, storageRows, scoutRows, expeditionRows] = await Promise.all([
      tx
        .select({ id: buildings.id })
        .from(buildings)
        .innerJoin(planets, eq(planets.id, buildings.planetId))
        .innerJoin(systems, eq(systems.id, planets.systemId))
        .where(and(eq(systems.ownerId, userId), eq(buildings.typeId, 'mine')))
        .limit(1),
      tx
        .select({ id: buildings.id })
        .from(buildings)
        .innerJoin(planets, eq(planets.id, buildings.planetId))
        .innerJoin(systems, eq(systems.id, planets.systemId))
        .where(and(eq(systems.ownerId, userId), eq(buildings.typeId, 'storage')))
        .limit(1),
      tx
        .select({ id: ships.id })
        .from(ships)
        .where(and(eq(ships.ownerId, userId), eq(ships.typeId, 'scout')))
        .limit(1),
      tx
        .select({ id: expeditions.id })
        .from(expeditions)
        .innerJoin(ships, eq(ships.id, expeditions.shipId))
        .where(eq(ships.ownerId, userId))
        .limit(1),
    ]);

    let nextStep = 0;
    if (mineRows.length > 0) nextStep = 1;
    if (storageRows.length > 0) nextStep = 2;
    if (scoutRows.length > 0) nextStep = 3;
    if (expeditionRows.length > 0) nextStep = TUTORIAL_FINAL_STEP;

    let tutorialCompletedAt: Date | null = user.tutorialCompletedAt;
    if (nextStep === TUTORIAL_FINAL_STEP && !tutorialCompletedAt) {
      const homeSystem = await tx.query.systems.findFirst({
        where: and(eq(systems.ownerId, userId), eq(systems.isHome, true)),
        with: {
          planets: true,
        },
      });

      const rewardPlanetId = homeSystem?.planets?.[0]?.id;
      if (rewardPlanetId) {
        await tx
          .update(planetResources)
          .set({
            amount: sql`${planetResources.amount} + 200`,
            lastUpdateAt: new Date(),
          })
          .where(and(eq(planetResources.planetId, rewardPlanetId), eq(planetResources.resourceId, 'iron')));

        await tx
          .update(planetResources)
          .set({
            amount: sql`${planetResources.amount} + 100`,
            lastUpdateAt: new Date(),
          })
          .where(and(eq(planetResources.planetId, rewardPlanetId), eq(planetResources.resourceId, 'water')));
      }

      tutorialCompletedAt = new Date();
    }

    if (nextStep !== user.tutorialStep || tutorialCompletedAt !== user.tutorialCompletedAt) {
      await tx
        .update(users)
        .set({
          tutorialStep: nextStep,
          tutorialCompletedAt,
        })
        .where(eq(users.id, userId));
    }

    return {
      tutorialStep: nextStep,
      tutorialCompletedAt,
    };
  });
}
