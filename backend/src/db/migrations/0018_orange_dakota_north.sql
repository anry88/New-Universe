ALTER TABLE "market_orders" ADD COLUMN IF NOT EXISTS "planet_id" uuid;
--> statement-breakpoint
ALTER TABLE "market_orders" ADD COLUMN IF NOT EXISTS "delivery_ready_at" timestamp;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_orders_fulfillment_tick_idx" ON "market_orders" USING btree ("scope","status","delivery_ready_at");
