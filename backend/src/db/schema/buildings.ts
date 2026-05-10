import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { planets } from './world.js';

export const buildingTypes = pgTable('building_types', {
  id: text('id').primaryKey(),
  name: jsonb('name').$type<{ ru: string; en: string }>().notNull(),
  description: jsonb('description').$type<{ ru: string; en: string }>().notNull().default({ ru: '', en: '' }),
  category: text('category').notNull(),
  /** Max completed + in-queue instances per planet; null = unlimited. */
  maxPerPlanet: integer('max_per_planet'),
  /** Max completed + in-queue instances across all owned planets; null = unlimited. */
  maxGlobal: integer('max_global'),
  maxLevel: integer('max_level').notNull(),
  deps: jsonb('deps').$type<{ typeId: string; level: number }[]>().notNull().default([]),
  baseCost: jsonb('base_cost').$type<Record<string, number>>().notNull(),
  baseTimeSec: integer('base_time_sec').notNull(),
  baseOutput: jsonb('base_output').$type<Record<string, any>>().notNull().default({}),
  energyConsumption: integer('energy_consumption').notNull().default(0),
});

export const buildings = pgTable('buildings', {
  id: uuid('id').primaryKey().defaultRandom(),
  planetId: uuid('planet_id').references(() => planets.id).notNull(),
  typeId: text('type_id').references(() => buildingTypes.id).notNull(),
  level: integer('level').notNull().default(1),
  slotIndex: integer('slot_index').notNull(),
  queueAction: text('queue_action'),
  queueCompletesAt: timestamp('queue_completes_at'),
});

export const buildingsRelations = relations(buildings, ({ one }) => ({
  planet: one(planets, {
    fields: [buildings.planetId],
    references: [planets.id],
  }),
  type: one(buildingTypes, {
    fields: [buildings.typeId],
    references: [buildingTypes.id],
  }),
}));
