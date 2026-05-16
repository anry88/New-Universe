import {
  boolean,
  integer,
  serial,
  text,
  timestamp,
  uuid,
  pgTable,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const starPayments = pgTable('star_payments', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  packId: text('pack_id').notNull(),
  diamonds: integer('diamonds').notNull(),
  priceStars: integer('price_stars').notNull(),
  currency: text('currency').notNull().default('XTR'),
  invoicePayload: text('invoice_payload').notNull(),
  telegramPaymentChargeId: text('telegram_payment_charge_id').notNull(),
  providerPaymentChargeId: text('provider_payment_charge_id'),
  refunded: boolean('refunded').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  refundedAt: timestamp('refunded_at'),
}, (table) => ({
  telegramPaymentChargeIdIdx: uniqueIndex('star_payments_telegram_charge_id_idx')
    .on(table.telegramPaymentChargeId),
}));

export const starPaymentSupportRequests = pgTable('star_payment_support_requests', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  paymentId: integer('payment_id').references(() => starPayments.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull().default(''),
  status: text('status').notNull().default('pending'),
  adminMessage: text('admin_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});
