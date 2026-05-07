CREATE TABLE IF NOT EXISTS "ship_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"role" text NOT NULL,
	"hp" integer NOT NULL,
	"speed" numeric(10, 2) NOT NULL,
	"cargo" integer NOT NULL,
	"dps" integer DEFAULT 0 NOT NULL,
	"armor" integer DEFAULT 0 NOT NULL,
	"fuel_consumption" numeric(10, 2) NOT NULL,
	"build_time_sec" integer NOT NULL,
	"build_cost" jsonb NOT NULL,
	"required_buildings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sensor_range" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"type_id" text NOT NULL,
	"location_planet_id" uuid,
	"status" text DEFAULT 'idle' NOT NULL,
	"cargo_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fuel" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ships" ADD CONSTRAINT "ships_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ships" ADD CONSTRAINT "ships_type_id_ship_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."ship_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ships" ADD CONSTRAINT "ships_location_planet_id_planets_id_fk" FOREIGN KEY ("location_planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
