ALTER TABLE "buildings" ADD COLUMN "slot_index" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "systems" DROP COLUMN IF EXISTS "x";--> statement-breakpoint
ALTER TABLE "systems" DROP COLUMN IF EXISTS "y";--> statement-breakpoint
ALTER TABLE "systems" DROP COLUMN IF EXISTS "z";