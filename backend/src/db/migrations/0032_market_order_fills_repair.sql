CREATE TABLE IF NOT EXISTS "market_order_fills" (
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
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_order_fills" ADD CONSTRAINT "market_order_fills_order_id_market_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."market_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_order_fills" ADD CONSTRAINT "market_order_fills_offer_id_market_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."market_offers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_order_fills" ADD CONSTRAINT "market_order_fills_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_order_fills" ADD CONSTRAINT "market_order_fills_delivery_expedition_id_expeditions_id_fk" FOREIGN KEY ("delivery_expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_order_fills_order_executed_idx" ON "market_order_fills" USING btree ("order_id", "executed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_order_fills_resource_executed_idx" ON "market_order_fills" USING btree ("resource_id", "executed_at");
