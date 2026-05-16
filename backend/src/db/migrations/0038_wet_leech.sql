ALTER TABLE "ship_types" ALTER COLUMN "jump_fuel_capacity" SET DEFAULT 150;--> statement-breakpoint
ALTER TABLE "ship_types" ADD COLUMN "refuel_fuel_capacity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ship_types" ADD COLUMN "refuel_jump_fuel_capacity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN "refuel_fuel" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ships" ADD COLUMN "refuel_jump_fuel" numeric(12, 2) DEFAULT '0' NOT NULL;