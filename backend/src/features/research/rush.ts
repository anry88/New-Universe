import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import { researchProgress, users } from '../../db/schema.js';
import { rushDiamondCost, rushRemainingSeconds } from '../../lib/diamonds.js';
import { invalidateResearchEffectsCache } from './effects.js';

export async function rushActiveResearch(
  userId: string,
  branch: string,
): Promise<{
  success: boolean;
  cost: number;
  diamondsRemaining: number;
  branch: string;
  level: number;
}> {
  const progress = await defaultDb.query.researchProgress.findFirst({
    where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, branch)),
  });

  if (!progress?.completesAt) {
    throw new Error('Research is not active');
  }

  const cost = rushDiamondCost(rushRemainingSeconds(progress.completesAt));

  return defaultDb.transaction(async (tx) => {
    let diamondsRemaining: number | null = null;
    if (cost > 0) {
      const rows = await tx
        .update(users)
        .set({ diamonds: sql`${users.diamonds} - ${cost}` })
        .where(and(eq(users.id, userId), gte(users.diamonds, cost)))
        .returning({ diamonds: users.diamonds });

      if (!rows.length) {
        throw new Error('Not enough diamonds');
      }
      diamondsRemaining = rows[0]!.diamonds;
    }

    const [updated] = await tx
      .update(researchProgress)
      .set({
        level: sql`${researchProgress.level} + 1`,
        completesAt: null,
      })
      .where(
        and(
          eq(researchProgress.userId, userId),
          eq(researchProgress.branch, branch),
          isNotNull(researchProgress.completesAt),
        ),
      )
      .returning({
        branch: researchProgress.branch,
        level: researchProgress.level,
      });

    if (!updated) {
      throw new Error('Research is not active');
    }

    invalidateResearchEffectsCache(userId);

    if (diamondsRemaining == null) {
      const [userAfter] = await tx
        .select({ diamonds: users.diamonds })
        .from(users)
        .where(eq(users.id, userId));
      diamondsRemaining = userAfter?.diamonds ?? 0;
    }

    return {
      success: true,
      cost,
      diamondsRemaining,
      branch: updated.branch,
      level: updated.level,
    };
  });
}
