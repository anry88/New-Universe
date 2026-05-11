import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../db/index.js';
import { researchProgress, users } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { rushActiveResearch } from './rush.js';

describe('rushActiveResearch', () => {
  let userId: string;

  beforeEach(async () => {
    const [user] = await db
      .insert(users)
      .values({
        tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
        tgUsername: `resrush_${Date.now()}_${Math.random()}`,
        diamonds: 100,
      })
      .returning();
    userId = user.id;
  });

  it('deducts diamonds and completes active research immediately', async () => {
    await db.insert(researchProgress).values({
      userId,
      branch: 'mining',
      level: 0,
      completesAt: new Date(Date.now() + 10 * 60_000),
    });

    const result = await rushActiveResearch(userId, 'mining');

    expect(result.success).toBe(true);
    expect(result.cost).toBeGreaterThan(0);
    expect(result.diamondsRemaining).toBe(100 - result.cost);
    expect(result.level).toBe(1);

    const row = await db.query.researchProgress.findFirst({
      where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')),
    });
    expect(row?.level).toBe(1);
    expect(row?.completesAt).toBeNull();
  });

  it('rejects rush when the player does not have enough diamonds', async () => {
    await db.update(users).set({ diamonds: 0 }).where(eq(users.id, userId));
    await db.insert(researchProgress).values({
      userId,
      branch: 'mining',
      level: 0,
      completesAt: new Date(Date.now() + 10 * 60_000),
    });

    await expect(rushActiveResearch(userId, 'mining')).rejects.toThrow('Not enough diamonds');

    const row = await db.query.researchProgress.findFirst({
      where: and(eq(researchProgress.userId, userId), eq(researchProgress.branch, 'mining')),
    });
    expect(row?.level).toBe(0);
    expect(row?.completesAt).not.toBeNull();
  });
});
