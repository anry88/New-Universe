import { pgTable, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const sectors = pgTable('sectors', {
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  z: integer('z').notNull(),
  seed: integer('seed').notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  systemCount: integer('system_count').notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.x, table.y, table.z] }),
}));
