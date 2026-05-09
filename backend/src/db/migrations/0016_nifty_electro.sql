CREATE TABLE IF NOT EXISTS "colonies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"planet_id" uuid NOT NULL,
	"founded_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "colonies" ADD CONSTRAINT "colonies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "colonies" ADD CONSTRAINT "colonies_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "colonies_planet_id_idx" ON "colonies" USING btree ("planet_id");