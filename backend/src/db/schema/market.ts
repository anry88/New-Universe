import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { resources } from './resources.js';
import { users } from './users.js';
import { expeditions } from './expeditions.js';
import { planets } from './world.js';

export const marketScopeEnum = pgEnum('market_scope', ['npc', 'player']);
export const marketSideEnum = pgEnum('market_side', ['buy', 'sell']);
export const marketOfferStatusEnum = pgEnum('market_offer_status', [
  'active',
  'paused',
  'exhausted',
  'archived',
]);
export const marketOrderTypeEnum = pgEnum('market_order_type', ['market', 'limit']);
export const marketOrderStatusEnum = pgEnum('market_order_status', [
  'open',
  'partially_filled',
  'filled',
  'cancelled',
  'expired',
  'failed',
  'settled',
]);

export const marketOffers = pgTable(
  'market_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: marketScopeEnum('scope').notNull().default('npc'),
    side: marketSideEnum('side').notNull(),
    resourceId: text('resource_id')
      .references(() => resources.id, { onDelete: 'restrict' })
      .notNull(),
    status: marketOfferStatusEnum('status').notNull().default('active'),
    pricePerUnit: numeric('price_per_unit', { precision: 18, scale: 4 }).notNull(),
    availableQty: numeric('available_qty', { precision: 18, scale: 4 }).notNull(),
    minQty: numeric('min_qty', { precision: 18, scale: 4 }),
    feeBps: integer('fee_bps').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => ({
    resourceSideStatusIdx: index('market_offers_resource_side_status_idx').on(
      table.resourceId,
      table.side,
      table.status,
      table.createdAt,
    ),
    scopeStatusCreatedIdx: index('market_offers_scope_status_created_idx').on(
      table.scope,
      table.status,
      table.createdAt,
    ),
  }),
);

export const marketOrders = pgTable(
  'market_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    scope: marketScopeEnum('scope').notNull().default('npc'),
    side: marketSideEnum('side').notNull(),
    orderType: marketOrderTypeEnum('order_type').notNull().default('market'),
    status: marketOrderStatusEnum('status').notNull().default('open'),
    resourceId: text('resource_id')
      .references(() => resources.id, { onDelete: 'restrict' })
      .notNull(),
    requestedQty: numeric('requested_qty', { precision: 18, scale: 4 }).notNull(),
    filledQty: numeric('filled_qty', { precision: 18, scale: 4 }).notNull().default('0'),
    limitPrice: numeric('limit_price', { precision: 18, scale: 4 }),
    avgExecutedPrice: numeric('avg_executed_price', { precision: 18, scale: 4 }),
    feeBps: integer('fee_bps').notNull().default(0),
    feeAmount: numeric('fee_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    totalValue: numeric('total_value', { precision: 18, scale: 4 }).notNull().default('0'),
    sourceOfferId: uuid('source_offer_id').references(() => marketOffers.id, {
      onDelete: 'set null',
    }),
    deliveryExpeditionId: uuid('delivery_expedition_id').references(() => expeditions.id, {
      onDelete: 'set null',
    }),
    planetId: uuid('planet_id').references(() => planets.id, { onDelete: 'set null' }),
    deliveryReadyAt: timestamp('delivery_ready_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    closedAt: timestamp('closed_at'),
  },
  (table) => ({
    userCreatedIdx: index('market_orders_user_created_idx').on(table.userId, table.createdAt),
    resourceStateCreatedIdx: index('market_orders_resource_state_created_idx').on(
      table.resourceId,
      table.status,
      table.createdAt,
    ),
    statusCreatedIdx: index('market_orders_status_created_idx').on(table.status, table.createdAt),
    fulfillmentTickIdx: index('market_orders_fulfillment_tick_idx').on(
      table.scope,
      table.status,
      table.deliveryReadyAt,
    ),
  }),
);

export const marketOrderFills = pgTable(
  'market_order_fills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .references(() => marketOrders.id, { onDelete: 'cascade' })
      .notNull(),
    offerId: uuid('offer_id').references(() => marketOffers.id, { onDelete: 'set null' }),
    resourceId: text('resource_id')
      .references(() => resources.id, { onDelete: 'restrict' })
      .notNull(),
    qty: numeric('qty', { precision: 18, scale: 4 }).notNull(),
    pricePerUnit: numeric('price_per_unit', { precision: 18, scale: 4 }).notNull(),
    feeAmount: numeric('fee_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    deliveryExpeditionId: uuid('delivery_expedition_id').references(() => expeditions.id, {
      onDelete: 'set null',
    }),
    executedAt: timestamp('executed_at').notNull().defaultNow(),
  },
  (table) => ({
    orderExecutedIdx: index('market_order_fills_order_executed_idx').on(table.orderId, table.executedAt),
    resourceExecutedIdx: index('market_order_fills_resource_executed_idx').on(
      table.resourceId,
      table.executedAt,
    ),
  }),
);
