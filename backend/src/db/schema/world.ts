import { pgTable, uuid, text, integer, boolean, timestamp, numeric, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { users } from './users.js';
import { resources } from './resources.js';
import { buildings } from './buildings.ts';

export const systems = pgTable('systems', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id),
  isHome: boolean('is_home').notNull().default(false),
  sectorX: integer('sector_x').notNull(),
  sectorY: integer('sector_y').notNull(),
  sectorZ: integer('sector_z').notNull(),
  name: text('name').notNull(),
  seed: integer('seed').notNull(),
});

export const planets = pgTable('planets', {
  id: uuid('id').primaryKey().defaultRandom(),
  systemId: uuid('system_id').references(() => systems.id).notNull(),
  biome: text('biome').notNull(),
  size: integer('size').notNull(),
  slotCount: integer('slot_count').notNull(),
  name: text('name').notNull(),
}, (table) => ({
  systemIdx: index('planets_system_id_idx').on(table.systemId),
}));

export const planetResources = pgTable('planet_resources', {
  planetId: uuid('planet_id').references(() => planets.id).notNull(),
  resourceId: text('resource_id').references(() => resources.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
  lastUpdateAt: timestamp('last_update_at').defaultNow().notNull(),
  regenRate: numeric('regen_rate', { precision: 8, scale: 4 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.planetId, table.resourceId] }),
}));

export const richness = pgTable('richness', {
  planetId: uuid('planet_id').references(() => planets.id).notNull(),
  resourceId: text('resource_id').references(() => resources.id).notNull(),
  value: integer('value').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.planetId, table.resourceId] }),
  valueCheck: check('richness_value_check', sql`${table.value} >= 0 AND ${table.value} <= 5`),
}));

export const systemsRelations = relations(systems, ({ many }) => ({
  planets: many(planets),
}));

export const planetsRelations = relations(planets, ({ one, many }) => ({
  system: one(systems, {
    fields: [planets.systemId],
    references: [systems.id],
  }),
  buildings: many(buildings),
}));
