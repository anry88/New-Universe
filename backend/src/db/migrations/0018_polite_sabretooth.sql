ALTER TABLE "systems" ADD COLUMN IF NOT EXISTS "x" numeric(10, 2) NOT NULL DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN IF NOT EXISTS "y" numeric(10, 2) NOT NULL DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN IF NOT EXISTS "z" numeric(10, 2) NOT NULL DEFAULT '0.00';