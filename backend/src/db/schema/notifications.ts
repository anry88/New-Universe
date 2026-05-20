import { pgTable, uuid, text, jsonb, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  read: boolean('read').notNull().default(false),
  pending: boolean('pending').notNull().default(true),
  deliveryStatus: text('delivery_status', {
    enum: ['pending', 'sent', 'skipped', 'failed'],
  }).notNull().default('pending'),
  sentAt: timestamp('sent_at'),
  failedAt: timestamp('failed_at'),
  failureCode: text('failure_code'),
  failureReason: text('failure_reason'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at'),
});
