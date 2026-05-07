CREATE TABLE IF NOT EXISTS "building_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"category" text NOT NULL,
	"max_level" integer NOT NULL,
	"deps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_cost" jsonb NOT NULL,
	"base_time_sec" integer NOT NULL,
	"base_output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"energy_consumption" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planet_id" uuid NOT NULL,
	"type_id" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"queue_action" text,
	"queue_completes_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "buildings" ADD CONSTRAINT "buildings_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "buildings" ADD CONSTRAINT "buildings_type_id_building_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."building_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
