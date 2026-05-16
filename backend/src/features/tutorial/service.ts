import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { buildings, expeditions, planets, ships, systems, users } from '../../db/schema.js';
import {
  areAllTutorialRewardsClaimed,
  isTutorialRewardClaimed,
  isTutorialStepId,
  tutorialRewardBit,
  TUTORIAL_FINAL_STEP,
  TUTORIAL_REWARD_DIAMONDS,
  type TutorialStepId,
} from '@shared/config/tutorialRewards.js';

export interface TutorialProgress {
  tutorialStepCompleted: number;
  tutorialCompletedAt: Date | null;
  tutorialRewardsClaimed: number;
}

export interface TutorialClaimResult extends TutorialProgress {
  diamonds: number;
  rewardDiamonds: number;
  rewardGranted: boolean;
  claimedStepId: TutorialStepId;
}

async function lockTutorialUser(tx: any, userId: string): Promise<typeof users.$inferSelect> {
  const [user] = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for('update');

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

async function detectTutorialStepCompleted(tx: any, userId: string): Promise<number> {
  const [mineRows, storageRows, scoutRows, expeditionRows] = await Promise.all([
    tx
      .select({ id: buildings.id })
      .from(buildings)
      .innerJoin(planets, eq(planets.id, buildings.planetId))
      .innerJoin(systems, eq(systems.id, planets.systemId))
      .where(and(eq(systems.ownerId, userId), eq(buildings.typeId, 'mine'), isNull(buildings.queueAction)))
      .limit(1),
    tx
      .select({ id: buildings.id })
      .from(buildings)
      .innerJoin(planets, eq(planets.id, buildings.planetId))
      .innerJoin(systems, eq(systems.id, planets.systemId))
      .where(and(eq(systems.ownerId, userId), eq(buildings.typeId, 'storage'), isNull(buildings.queueAction)))
      .limit(1),
    tx
      .select({ id: ships.id })
      .from(ships)
      .where(and(eq(ships.ownerId, userId), eq(ships.typeId, 'scout'), ne(ships.status, 'building')))
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

  return nextStep;
}

function tutorialCompletedAtForMask(
  rewardsClaimed: number,
  existingCompletedAt: Date | null,
): Date | null {
  if (!areAllTutorialRewardsClaimed(rewardsClaimed)) {
    return null;
  }

  return existingCompletedAt ?? new Date();
}

async function persistTutorialState(
  tx: any,
  user: typeof users.$inferSelect,
  tutorialStepCompleted: number,
  tutorialRewardsClaimed: number,
): Promise<TutorialProgress> {
  const tutorialCompletedAt = tutorialCompletedAtForMask(
    tutorialRewardsClaimed,
    user.tutorialCompletedAt,
  );

  if (
    tutorialStepCompleted !== user.tutorialStepCompleted ||
    tutorialRewardsClaimed !== user.tutorialRewardsClaimed ||
    tutorialCompletedAt?.getTime() !== user.tutorialCompletedAt?.getTime()
  ) {
    await tx
      .update(users)
      .set({
        tutorialStepCompleted,
        tutorialRewardsClaimed,
        tutorialCompletedAt,
      })
      .where(eq(users.id, user.id));
  }

  return {
    tutorialStepCompleted,
    tutorialRewardsClaimed,
    tutorialCompletedAt,
  };
}

export async function syncTutorialProgress(userId: string): Promise<TutorialProgress> {
  return db.transaction(async (tx) => {
    const user = await lockTutorialUser(tx, userId);
    const nextStep = await detectTutorialStepCompleted(tx, userId);

    return persistTutorialState(
      tx,
      user,
      Math.max(user.tutorialStepCompleted, nextStep),
      user.tutorialRewardsClaimed,
    );
  });
}

export async function claimTutorialReward(
  userId: string,
  stepId: number,
): Promise<TutorialClaimResult> {
  if (!isTutorialStepId(stepId)) {
    throw new Error(`Invalid tutorial reward step: ${stepId}`);
  }

  return db.transaction(async (tx) => {
    const user = await lockTutorialUser(tx, userId);
    const nextStep = await detectTutorialStepCompleted(tx, userId);
    const tutorialStepCompleted = Math.max(user.tutorialStepCompleted, nextStep);

    if (stepId > tutorialStepCompleted) {
      throw new Error(`Tutorial reward step ${stepId} is not complete`);
    }

    if (isTutorialRewardClaimed(user.tutorialRewardsClaimed, stepId)) {
      const progress = await persistTutorialState(
        tx,
        user,
        tutorialStepCompleted,
        user.tutorialRewardsClaimed,
      );
      return {
        ...progress,
        diamonds: user.diamonds,
        rewardDiamonds: TUTORIAL_REWARD_DIAMONDS,
        rewardGranted: false,
        claimedStepId: stepId,
      };
    }

    const tutorialRewardsClaimed = user.tutorialRewardsClaimed | tutorialRewardBit(stepId);
    const tutorialCompletedAt = tutorialCompletedAtForMask(
      tutorialRewardsClaimed,
      user.tutorialCompletedAt,
    );

    const [updatedUser] = await tx
      .update(users)
      .set({
        diamonds: sql`${users.diamonds} + ${TUTORIAL_REWARD_DIAMONDS}`,
        tutorialStepCompleted,
        tutorialRewardsClaimed,
        tutorialCompletedAt,
      })
      .where(eq(users.id, userId))
      .returning({
        diamonds: users.diamonds,
      });

    return {
      tutorialStepCompleted,
      tutorialRewardsClaimed,
      tutorialCompletedAt,
      diamonds: updatedUser?.diamonds ?? user.diamonds + TUTORIAL_REWARD_DIAMONDS,
      rewardDiamonds: TUTORIAL_REWARD_DIAMONDS,
      rewardGranted: true,
      claimedStepId: stepId,
    };
  });
}
