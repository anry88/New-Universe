import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { systems } from './world.js';

export type JumpGateCalibrationStatus = 'idle' | 'calibrating' | 'ready';
export type JumpGateCalibrationMode = 'random' | 'known';

export const jumpGates = pgTable('jump_gates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  homeSystemId: uuid('home_system_id').references(() => systems.id, { onDelete: 'cascade' }).notNull(),
  calibrationStatus: text('calibration_status').$type<JumpGateCalibrationStatus>().notNull().default('idle'),
  calibrationMode: text('calibration_mode').$type<JumpGateCalibrationMode>(),
  calibrationTargetSystemId: uuid('calibration_target_system_id').references(() => systems.id, { onDelete: 'set null' }),
  calibrationStartedAt: timestamp('calibration_started_at'),
  calibrationCompletesAt: timestamp('calibration_completes_at'),
  randomJumpReadyAt: timestamp('random_jump_ready_at'),
  lastRandomJumpAt: timestamp('last_random_jump_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('jump_gates_user_id_idx').on(table.userId),
  homeSystemIdx: uniqueIndex('jump_gates_home_system_id_idx').on(table.homeSystemId),
}));

export const jumpGatesRelations = relations(jumpGates, ({ one }) => ({
  user: one(users, {
    fields: [jumpGates.userId],
    references: [users.id],
  }),
  homeSystem: one(systems, {
    fields: [jumpGates.homeSystemId],
    references: [systems.id],
  }),
  calibrationTargetSystem: one(systems, {
    fields: [jumpGates.calibrationTargetSystemId],
    references: [systems.id],
  }),
}));
