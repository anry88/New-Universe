ALTER TABLE "discovered_systems" ADD COLUMN "source" text DEFAULT 'sensor' NOT NULL;--> statement-breakpoint
ALTER TABLE "discovered_systems" ADD COLUMN "last_visited_at" timestamp;