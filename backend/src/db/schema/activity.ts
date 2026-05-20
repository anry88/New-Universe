import { date, index, integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const playerActivityDaily = pgTable('player_activity_daily', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  activityDate: date('activity_date', { mode: 'string' }).notNull(),
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  playSeconds: integer('play_seconds').notNull().default(0),
  sessionCount: integer('session_count').notNull().default(1),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.activityDate] }),
  dateIdx: index('player_activity_daily_date_idx').on(table.activityDate),
}));
