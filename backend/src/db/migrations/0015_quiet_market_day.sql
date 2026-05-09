CREATE TYPE "public"."market_scope" AS ENUM('npc', 'player');
CREATE TYPE "public"."market_side" AS ENUM('buy', 'sell');
CREATE TYPE "public"."market_offer_status" AS ENUM('active', 'paused', 'exhausted', 'archived');
CREATE TYPE "public"."market_order_type" AS ENUM('market', 'limit');
CREATE TYPE "public"."market_order_status" AS ENUM('open', 'partially_filled', 'filled', 'cancelled', 'expired', 'failed', 'settled');

CREATE TABLE "market_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" "market_scope" DEFAULT 'npc' NOT NULL,
  "side" "market_side" NOT NULL,
  "resource_id" text NOT NULL,
  "status" "market_offer_status" DEFAULT 'active' NOT NULL,
  "price_per_unit" numeric(18, 4) NOT NULL,
  "available_qty" numeric(18, 4) NOT NULL,
  "min_qty" numeric(18, 4),
  "fee_bps" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp
);

CREATE TABLE "market_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "scope" "market_scope" DEFAULT 'npc' NOT NULL,
  "side" "market_side" NOT NULL,
  "order_type" "market_order_type" DEFAULT 'market' NOT NULL,
  "status" "market_order_status" DEFAULT 'open' NOT NULL,
  "resource_id" text NOT NULL,
  "requested_qty" numeric(18, 4) NOT NULL,
  "filled_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
  "limit_price" numeric(18, 4),
  "avg_executed_price" numeric(18, 4),
  "fee_bps" integer DEFAULT 0 NOT NULL,
  "fee_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
  "total_value" numeric(18, 4) DEFAULT '0' NOT NULL,
  "source_offer_id" uuid,
  "delivery_expedition_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "closed_at" timestamp
);

CREATE TABLE "market_order_fills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "offer_id" uuid,
  "resource_id" text NOT NULL,
  "qty" numeric(18, 4) NOT NULL,
  "price_per_unit" numeric(18, 4) NOT NULL,
  "fee_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
  "delivery_expedition_id" uuid,
  "executed_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "market_offers" ADD CONSTRAINT "market_offers_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_source_offer_id_market_offers_id_fk" FOREIGN KEY ("source_offer_id") REFERENCES "public"."market_offers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_delivery_expedition_id_expeditions_id_fk" FOREIGN KEY ("delivery_expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "market_order_fills" ADD CONSTRAINT "market_order_fills_order_id_market_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."market_orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "market_order_fills" ADD CONSTRAINT "market_order_fills_offer_id_market_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."market_offers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "market_order_fills" ADD CONSTRAINT "market_order_fills_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "market_order_fills" ADD CONSTRAINT "market_order_fills_delivery_expedition_id_expeditions_id_fk" FOREIGN KEY ("delivery_expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "market_offers_resource_side_status_idx" ON "market_offers" USING btree ("resource_id", "side", "status", "created_at");
CREATE INDEX "market_offers_scope_status_created_idx" ON "market_offers" USING btree ("scope", "status", "created_at");
CREATE INDEX "market_orders_user_created_idx" ON "market_orders" USING btree ("user_id", "created_at");
CREATE INDEX "market_orders_resource_state_created_idx" ON "market_orders" USING btree ("resource_id", "status", "created_at");
CREATE INDEX "market_orders_status_created_idx" ON "market_orders" USING btree ("status", "created_at");
CREATE INDEX "market_order_fills_order_executed_idx" ON "market_order_fills" USING btree ("order_id", "executed_at");
CREATE INDEX "market_order_fills_resource_executed_idx" ON "market_order_fills" USING btree ("resource_id", "executed_at");
