ALTER TABLE "building_types" ADD COLUMN IF NOT EXISTS "max_per_planet" integer;
--> statement-breakpoint
ALTER TABLE "building_types" ADD COLUMN IF NOT EXISTS "max_global" integer;
