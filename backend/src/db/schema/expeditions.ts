import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { ships } from './ships.js';
import { planets } from './world.js';

export const expeditions = pgTable('expeditions', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipId: uuid('ship_id').references(() => ships.id).notNull(),
  type: text('type').notNull(),
  originPlanetId: uuid('origin_planet_id').references(() => planets.id).notNull(),
  targetX: integer('target_x').notNull(),
  targetY: integer('target_y').notNull(),
  targetZ: integer('target_z').notNull(),
  targetPlanetId: uuid('target_planet_id').references(() => planets.id),
  status: text('status').notNull().default('queued'),
  eta: timestamp('eta').notNull(),
  returnedAt: timestamp('returned_at'),
  result: jsonb('result').$type<Record<string, any>>().notNull().default({}),
}, (table) => ({
  etaStatusIdx: index('expeditions_eta_status_idx').on(table.eta, table.status),
}));
