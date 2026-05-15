import { pgTable, uuid, text, integer, jsonb, numeric, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets } from './world.js';
import type { CombatStats } from '@shared/types/combat.js';

export const shipTypes = pgTable('ship_types', {
  id: text('id').primaryKey(),
  name: jsonb('name').$type<{ ru: string; en: string }>().notNull(),
  role: text('role').notNull(),
  hp: integer('hp').notNull(),
  speed: numeric('speed', { precision: 10, scale: 2 }).notNull(),
  cargo: integer('cargo').notNull(),
  dps: integer('dps').notNull().default(0),
  armor: integer('armor').notNull().default(0),
  fuelConsumption: numeric('fuel_consumption', { precision: 10, scale: 2 }).notNull(),
  fuelCapacity: integer('fuel_capacity').notNull().default(100),
  jumpFuelCapacity: integer('jump_fuel_capacity').notNull().default(3),
  buildTimeSec: integer('build_time_sec').notNull(),
  buildCost: jsonb('build_cost').$type<Record<string, number>>().notNull(),
  requiredBuildings: jsonb('required_buildings').$type<{ typeId: string; level: number }[]>().notNull().default([]),
  sensorRange: integer('sensor_range').notNull(),
  combatStats: jsonb('combat_stats').$type<CombatStats>().notNull().default({ targetClass: 'civilian' } as CombatStats),
});

export const ships = pgTable('ships', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  typeId: text('type_id').references(() => shipTypes.id).notNull(),
  locationPlanetId: uuid('location_planet_id').references(() => planets.id),
  status: text('status').notNull().default('idle'),
  queueCompletesAt: timestamp('queue_completes_at'),
  cargoJson: jsonb('cargo_json').$type<Record<string, number>>().notNull().default({}),
  fuel: numeric('fuel', { precision: 12, scale: 2 }).notNull().default('0'),
  jumpFuel: numeric('jump_fuel', { precision: 12, scale: 2 }).notNull().default('0'),
  hp: integer('hp').notNull().default(100),
  maxHp: integer('max_hp').notNull().default(100),
  combatStats: jsonb('combat_stats').$type<CombatStats>().notNull().default({ targetClass: 'civilian' } as CombatStats),
  lastCombatTickAt: timestamp('last_combat_tick_at'),
  destroyedAt: timestamp('destroyed_at'),
});

import { relations } from 'drizzle-orm';

export const shipTypesRelations = relations(shipTypes, ({ many }) => ({
  ships: many(ships),
}));

export const shipsRelations = relations(ships, ({ one }) => ({
  owner: one(users, {
    fields: [ships.ownerId],
    references: [users.id],
  }),
  type: one(shipTypes, {
    fields: [ships.typeId],
    references: [shipTypes.id],
  }),
  locationPlanet: one(planets, {
    fields: [ships.locationPlanetId],
    references: [planets.id],
  }),
}));
