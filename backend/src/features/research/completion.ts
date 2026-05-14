import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { researchProgress, notifications } from '../../db/schema.js';
import {
  invalidateResearchEffectsCache,
  type ResearchEffectsRequestCache,
} from './effects.js';

/**
 * Applies completed research tiers: increments `level`, clears `completes_at`, optionally notifies.
 * Idempotent per row: rows without a due `completes_at` are skipped.
 */
export async function processCompletedResearch(
  database: typeof import('../../db/index.js').db,
  options: {
    userId?: string;
    skipNotification?: boolean;
    now?: Date;
    effectsCache?: ResearchEffectsRequestCache;
  } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const dueConditions = [
    isNotNull(researchProgress.completesAt),
    lte(researchProgress.completesAt, now),
  ];
  if (options.userId) {
    dueConditions.push(eq(researchProgress.userId, options.userId));
  }

  const due = await database
    .select({
      userId: researchProgress.userId,
      branch: researchProgress.branch,
      completesAt: researchProgress.completesAt,
    })
    .from(researchProgress)
    .where(and(...dueConditions));

  for (const row of due) {
    await database.transaction(async (tx) => {
      const [updated] = await tx
        .update(researchProgress)
        .set({
          level: sql`${researchProgress.level} + 1`,
          completesAt: null,
        })
        .where(
          and(
            eq(researchProgress.userId, row.userId),
            eq(researchProgress.branch, row.branch),
            isNotNull(researchProgress.completesAt),
            lte(researchProgress.completesAt, now),
          ),
        )
        .returning({
          userId: researchProgress.userId,
          branch: researchProgress.branch,
          level: researchProgress.level,
        });

      if (!updated) return;

      invalidateResearchEffectsCache(updated.userId, options.effectsCache);

      if (!options.skipNotification) {
        await tx.insert(notifications).values({
          userId: updated.userId,
          type: 'research_done',
          payload: {
            branch: updated.branch,
            level: updated.level,
          },
        });
      }
    });
  }
}
