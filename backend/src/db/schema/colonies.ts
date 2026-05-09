import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { planets } from './world.js';

export const colonies = pgTable('colonies', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  planetId: uuid('planet_id').references(() => planets.id).notNull(),
  foundedAt: timestamp('founded_at').defaultNow().notNull(),
  status: text('status').notNull().default('active'),
}, (table) => ({
  planetIdx: uniqueIndex('colonies_planet_id_idx').on(table.planetId),
}));

export const coloniesRelations = relations(colonies, ({ one }) => ({
  owner: one(users, {
    fields: [colonies.ownerId],
    references: [users.id],
  }),
  planet: one(planets, {
    fields: [colonies.planetId],
    references: [planets.id],
  }),
}));
