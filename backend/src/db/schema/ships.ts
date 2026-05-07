import { pgTable, uuid, text, integer, jsonb, numeric } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets } from './world.js';

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
  buildTimeSec: integer('build_time_sec').notNull(),
  buildCost: jsonb('build_cost').$type<Record<string, number>>().notNull(),
  requiredBuildings: jsonb('required_buildings').$type<{ typeId: string; level: number }[]>().notNull().default([]),
  sensorRange: integer('sensor_range').notNull(),
});

export const ships = pgTable('ships', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  typeId: text('type_id').references(() => shipTypes.id).notNull(),
  locationPlanetId: uuid('location_planet_id').references(() => planets.id),
  status: text('status').notNull().default('idle'),
  cargoJson: jsonb('cargo_json').$type<Record<string, number>>().notNull().default({}),
  fuel: numeric('fuel', { precision: 12, scale: 2 }).notNull().default('0'),
});
