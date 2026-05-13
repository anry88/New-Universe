import { pgTable, uuid, timestamp, primaryKey, text } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets, systems } from './world.js';

export type KnownDestinationSource = 'sensor' | 'random_jump';

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
  source: text('source').$type<KnownDestinationSource>().notNull().default('sensor'),
  lastVisitedAt: timestamp('last_visited_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.systemId] }),
}));
