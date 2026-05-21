import { index, pgTable, uuid, bigint, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import type { NotificationPreferences } from '@shared/types/notifications.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tgId: bigint('tg_id', { mode: 'bigint' }).unique().notNull(),
  tgUsername: text('tg_username'),
  tgFirstName: text('tg_first_name'),
  playerNickname: text('player_nickname'),
  playerNicknameChangeCount: integer('player_nickname_change_count').notNull().default(0),
  registrationSource: text('registration_source', { enum: ['direct', 'telegram_start'] }),
  registrationSourceCode: text('registration_source_code'),
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
  registrationSourceCodeIdx: index('users_registration_source_code_idx').on(table.registrationSourceCode),
}));

export const telegramRegistrationReferrals = pgTable('telegram_registration_referrals', {
  tgId: bigint('tg_id', { mode: 'bigint' }).primaryKey(),
  referralCode: text('referral_code').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  referralCodeIdx: index('telegram_registration_referrals_referral_code_idx').on(table.referralCode),
  updatedAtIdx: index('telegram_registration_referrals_updated_at_idx').on(table.updatedAt),
}));
