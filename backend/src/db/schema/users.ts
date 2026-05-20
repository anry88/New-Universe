import { index, pgTable, uuid, bigint, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import type { NotificationPreferences } from '@shared/types/notifications.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tgId: bigint('tg_id', { mode: 'bigint' }).unique().notNull(),
  tgUsername: text('tg_username'),
  tgFirstName: text('tg_first_name'),
  preferredLocale: text('preferred_locale', { enum: ['en', 'ru'] }).notNull().default('en'),
  notificationPreferences: jsonb('notification_preferences')
    .$type<Partial<NotificationPreferences>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  telegramNotificationsBlockedAt: timestamp('telegram_notifications_blocked_at'),
  premiumUntil: timestamp('premium_until'),
  powerScore: integer('power_score').default(0).notNull(),
  tutorialStepCompleted: integer('tutorial_step').default(0).notNull(),
  tutorialCompletedAt: timestamp('tutorial_completed_at'),
  /** Bitmask of claimed onboarding rewards for tutorial steps 0..4. */
  tutorialRewardsClaimed: integer('tutorial_rewards_claimed').notNull().default(0),
  /** Premium currency (diamonds); spent on rush-build; optional Telegram Stars purchase later. */
  diamonds: integer('diamonds').notNull().default(0),
}, (table) => ({
  createdAtIdx: index('users_created_at_idx').on(table.createdAt),
}));
