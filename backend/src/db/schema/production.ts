import { pgTable, uuid, text, numeric, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets } from './world.js';
import { buildings } from './buildings.js';
import type { ResourceAmount, ProductionOrderStatus } from '@shared/types/production.js';

export const productionOrders = pgTable('production_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  planetId: uuid('planet_id').references(() => planets.id).notNull(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'set null' }),
  recipeId: text('recipe_id').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull(),
  status: text('status').$type<ProductionOrderStatus>().notNull().default('queued'),
  inputs: jsonb('inputs').$type<ResourceAmount[]>().notNull(),
  outputs: jsonb('outputs').$type<ResourceAmount[]>().notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completesAt: timestamp('completes_at').notNull(),
  pausedAt: timestamp('paused_at'),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  dueIdx: index('production_orders_due_idx').on(table.status, table.completesAt),
  userStatusIdx: index('production_orders_user_status_idx').on(table.userId, table.status),
  planetStatusIdx: index('production_orders_planet_status_idx').on(table.planetId, table.status),
}));
