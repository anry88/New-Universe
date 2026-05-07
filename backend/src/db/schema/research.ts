import { pgTable, text, uuid, integer, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const researchBranches = pgTable('research_branches', {

  id: text('id').primaryKey(),
  name: jsonb('name').notNull().$type<{ ru: string; en: string }>(),
  description: text('description'),
});

export const researchProgress = pgTable('research_progress', {
  userId: uuid('user_id').references(() => users.id).notNull(),
  branch: text('branch').references(() => researchBranches.id).notNull(),
  level: integer('level').default(0).notNull(),
  completesAt: timestamp('completes_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.branch] }),
}));
