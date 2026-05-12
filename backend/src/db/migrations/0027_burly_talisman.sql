CREATE TABLE IF NOT EXISTS "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"planet_id" uuid NOT NULL,
	"building_id" uuid,
	"recipe_id" text NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"inputs" jsonb NOT NULL,
	"outputs" jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completes_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_orders_due_idx" ON "production_orders" USING btree ("status","completes_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_orders_user_status_idx" ON "production_orders" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_orders_planet_status_idx" ON "production_orders" USING btree ("planet_id","status");
