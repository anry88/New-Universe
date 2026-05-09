import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../db/index.js';
import { researchProgress, notifications, users } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { processCompletedResearch } from './completion.js';
import { getResearchEffectsForUser } from './effects.js';

describe('processCompletedResearch', () => {
  let userId: string;

  beforeEach(async () => {
    const [u] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
        tgUsername: `rescomp_${Date.now()}_${Math.random()}`,
      })
      .returning();
    userId = u.id;
  });

  it('increments level once, clears timer, applies effects, inserts notification', async () => {
    await db.insert(researchProgress).values({
      userId,
      branch: 'mining',
      level: 0,
      completesAt: new Date(Date.now() - 60_000),
    });

    const beforeEffects = await getResearchEffectsForUser(userId, db);
    expect(beforeEffects.resourceProductionMultiplier).toBe(1);

    await processCompletedResearch(db);

    const row = await db.query.researchProgress.findFirst({
      where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')),
    });
    expect(row?.level).toBe(1);
    expect(row?.completesAt).toBeNull();

    const afterEffects = await getResearchEffectsForUser(userId, db);
    expect(afterEffects.resourceProductionMultiplier).toBeGreaterThan(1);

    const notes = await db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
    });
    const researchNote = notes.find((n) => n.type === 'research_done');
    expect(researchNote).toBeDefined();
    expect((researchNote!.payload as { branch: string }).branch).toBe('mining');
    expect((researchNote!.payload as { level: number }).level).toBe(1);
  });

  it('does not double-apply when run repeatedly', async () => {
    await db.insert(researchProgress).values({
      userId,
      branch: 'mining',
      level: 0,
      completesAt: new Date(Date.now() - 60_000),
    });

    await processCompletedResearch(db);
    await processCompletedResearch(db);

    const row = await db.query.researchProgress.findFirst({
      where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')),
    });
    expect(row?.level).toBe(1);

    const notes = await db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
    });
    expect(notes.filter((n) => n.type === 'research_done').length).toBe(1);
  });

  it('ignores research still in the future', async () => {
    await db.insert(researchProgress).values({
      userId,
      branch: 'mining',
      level: 0,
      completesAt: new Date(Date.now() + 3600_000),
    });

    await processCompletedResearch(db);

    const row = await db.query.researchProgress.findFirst({
      where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')),
    });
    expect(row?.level).toBe(0);
    expect(row?.completesAt).not.toBeNull();
  });
});
