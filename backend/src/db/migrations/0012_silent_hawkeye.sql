ALTER TABLE "expeditions" DROP CONSTRAINT IF EXISTS "expeditions_ship_id_ships_id_fk";--> statement-breakpoint
ALTER TABLE "expeditions" DROP CONSTRAINT IF EXISTS "expeditions_origin_planet_id_planets_id_fk";--> statement-breakpoint
ALTER TABLE "expeditions" DROP CONSTRAINT IF EXISTS "expeditions_target_planet_id_planets_id_fk";--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_origin_planet_id_planets_id_fk" FOREIGN KEY ("origin_planet_id") REFERENCES "public"."planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_target_planet_id_planets_id_fk" FOREIGN KEY ("target_planet_id") REFERENCES "public"."planets"("id") ON DELETE set null ON UPDATE no action;
