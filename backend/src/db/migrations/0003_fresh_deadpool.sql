CREATE TABLE IF NOT EXISTS "planet_resources" (
	"planet_id" uuid NOT NULL,
	"resource_id" text NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"last_update_at" timestamp DEFAULT now() NOT NULL,
	"regen_rate" numeric(8, 4) NOT NULL,
	CONSTRAINT "planet_resources_planet_id_resource_id_pk" PRIMARY KEY("planet_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_id" uuid NOT NULL,
	"biome" text NOT NULL,
	"size" integer NOT NULL,
	"slot_count" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "richness" (
	"planet_id" uuid NOT NULL,
	"resource_id" text NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "richness_planet_id_resource_id_pk" PRIMARY KEY("planet_id","resource_id"),
	CONSTRAINT "richness_value_check" CHECK ("richness"."value" >= 0 AND "richness"."value" <= 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"is_home" boolean DEFAULT false NOT NULL,
	"sector_x" integer NOT NULL,
	"sector_y" integer NOT NULL,
	"sector_z" integer NOT NULL,
	"name" text NOT NULL,
	"seed" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planet_resources" ADD CONSTRAINT "planet_resources_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planet_resources" ADD CONSTRAINT "planet_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planets" ADD CONSTRAINT "planets_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "richness" ADD CONSTRAINT "richness_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "richness" ADD CONSTRAINT "richness_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "systems" ADD CONSTRAINT "systems_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planets_system_id_idx" ON "planets" USING btree ("system_id");