import { pgTable, text, integer, jsonb } from 'drizzle-orm/pg-core';

export const resources = pgTable('resources', {
  id: text('id').primaryKey(),
  name: jsonb('name').notNull().$type<{ ru: string; en: string }>(),
  tier: integer('tier').notNull(),
  symbol: text('symbol').notNull(),
  baseRegenRate: integer('base_regen_rate').notNull(),
  defaultStorageCap: integer('default_storage_cap').notNull(),
});
