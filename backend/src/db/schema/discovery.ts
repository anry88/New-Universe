import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets, systems } from './world.js';

export const discoveredPlanets = pgTable('discovered_planets', {
  userId: uuid('user_id').references(() => users.id).notNull(),
  planetId: uuid('planet_id').references(() => planets.id).notNull(),
  discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.planetId] }),
}));

export const discoveredSystems = pgTable('discovered_systems', {
  userId: uuid('user_id').references(() => users.id).notNull(),
  systemId: uuid('system_id').references(() => systems.id).notNull(),
  discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.systemId] }),
}));
