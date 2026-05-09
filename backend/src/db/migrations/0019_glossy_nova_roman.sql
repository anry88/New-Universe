ALTER TABLE "market_orders" DROP CONSTRAINT IF EXISTS "market_orders_planet_id_planets_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
