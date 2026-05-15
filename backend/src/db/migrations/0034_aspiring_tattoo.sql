ALTER TABLE "ship_types" ADD COLUMN "fuel_capacity" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "ship_types" ADD COLUMN "jump_fuel_capacity" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN "jump_fuel" numeric(12, 2) DEFAULT '0' NOT NULL;