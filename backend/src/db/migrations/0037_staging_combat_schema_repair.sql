ALTER TABLE "building_types" ADD COLUMN IF NOT EXISTS "hp" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "building_types" ADD COLUMN IF NOT EXISTS "combat_stats" jsonb DEFAULT '{"targetClass":"building"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "hp" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "max_hp" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "ship_types" ADD COLUMN IF NOT EXISTS "combat_stats" jsonb DEFAULT '{"targetClass":"civilian"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN IF NOT EXISTS "hp" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN IF NOT EXISTS "max_hp" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN IF NOT EXISTS "combat_stats" jsonb DEFAULT '{"targetClass":"civilian"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ship_types" ADD COLUMN IF NOT EXISTS "fuel_capacity" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "ship_types" ADD COLUMN IF NOT EXISTS "jump_fuel_capacity" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN IF NOT EXISTS "jump_fuel" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN IF NOT EXISTS "last_combat_tick_at" timestamp;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN IF NOT EXISTS "destroyed_at" timestamp;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "last_combat_tick_at" timestamp;--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "destroyed_at" timestamp;
