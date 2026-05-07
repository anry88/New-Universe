CREATE TABLE IF NOT EXISTS "expeditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" uuid NOT NULL,
	"type" text NOT NULL,
	"origin_planet_id" uuid NOT NULL,
	"target_x" integer NOT NULL,
	"target_y" integer NOT NULL,
	"target_z" integer NOT NULL,
	"target_planet_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"eta" timestamp NOT NULL,
	"returned_at" timestamp,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_origin_planet_id_planets_id_fk" FOREIGN KEY ("origin_planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_target_planet_id_planets_id_fk" FOREIGN KEY ("target_planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expeditions_eta_status_idx" ON "expeditions" USING btree ("eta","status");