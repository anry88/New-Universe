ALTER TABLE "systems" ADD COLUMN "rename_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "planets" ADD COLUMN "rename_count" integer DEFAULT 0 NOT NULL;
