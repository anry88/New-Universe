ALTER TABLE "building_types" ADD COLUMN "hp" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "building_types" ADD COLUMN "combat_stats" jsonb DEFAULT '{"targetClass":"building"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "hp" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "max_hp" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "ship_types" ADD COLUMN "combat_stats" jsonb DEFAULT '{"targetClass":"civilian"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN "hp" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN "max_hp" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN "combat_stats" jsonb DEFAULT '{"targetClass":"civilian"}'::jsonb NOT NULL;