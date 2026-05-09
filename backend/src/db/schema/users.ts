import { pgTable, uuid, bigint, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tgId: bigint('tg_id', { mode: 'bigint' }).unique().notNull(),
  tgUsername: text('tg_username'),
  tgFirstName: text('tg_first_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  premiumUntil: timestamp('premium_until'),
  powerScore: integer('power_score').default(0).notNull(),
  tutorialStep: integer('tutorial_step').default(0).notNull(),
  tutorialCompletedAt: timestamp('tutorial_completed_at'),
});
